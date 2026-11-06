import { refusal } from "../../../shared/errors/refusal.js";
import { resultsFor, scopeOf, stepCycleSeconds } from "./kpi-results-rules.js";
import { planningUnreachable } from "../../planning/planning-error.js";
import { cycleTimeIdeal, inEffect } from "../work-master/work-master-rules.js";

import type { Operation } from "../work-master/work-master.js";
import type { AreasStore } from "../areas/areas-store.js";
import type { SitesStore } from "../sites/sites-store.js";
import type { TShiftsService } from "../shifts/shifts-service.js";
import type { ShiftInstance } from "../shifts/shifts.js";
import type { WorkCentersStore } from "../work-centers/work-centers-store.js";
import type { ReferenceDataStore } from "../reference-data/reference-data-store.js";
import type { WorkMasterStore } from "../work-master/work-master-store.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";
import type { PlanningClientContract } from "@molca/contract-client";
import type {
  KpiQuery,
  KpiResult,
  PlanningOperation,
  PlanningWorkOrder,
  StepCycle,
} from "./kpi-results.js";

const MAX_RANGE_DAYS = 366; // [proposed] PRD-004 PRF-002 rule 2

/**
 * The routing step row a Job Order's `operationId` points at, in effect on the
 * business date (WMS-003). Pinned to the work order's routing version. Undefined
 * when the routing or the step is unknown: never a guessed step.
 */
function stepRowOf(
  operations: ReadonlyArray<Operation>,
  routingId: string | null,
  stepId: string | undefined,
  date: string,
): Operation | undefined {
  if (!routingId || !stepId) return undefined;
  return inEffect(
    operations.filter((o) => o.routingId === routingId && o.stepId === stepId),
    date,
  );
}

type Deps = {
  planningClient: PlanningClientContract;
  shiftsService: TShiftsService;
  sitesStore: SitesStore;
  areasStore: AreasStore;
  workCentersStore: WorkCentersStore;
  workUnitsStore: WorkUnitsStore;
  workMasterStore: WorkMasterStore;
  referenceDataStore: ReferenceDataStore;
};

type TKpiResultsService = KpiResultsService;

/**
 * KPI_RESULT for the Production KPIs, read on demand. Inputs are the Job
 * Order quantities the Production Planning API holds (PRD-003 KPI-003 /
 * 009 / 010 / 011 / 013 read WORK_ORDER_OPERATION).
 */
class KpiResultsService {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async results(q: KpiQuery): Promise<KpiResult[]> {
    const perShift = q.shiftInstanceId !== undefined;
    if (!perShift && (!q.from || !q.to) && q.level !== "work_order")
      throw refusal(422, "period_required");
    if (q.from && q.to) {
      if (q.to < q.from) throw refusal(422, "range_reversed");
      if ((Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
        throw refusal(422, "range_too_long", { max: MAX_RANGE_DAYS });
      }
    }

    const { workOrders, operations } = await this.planningData();
    const instances = new Map(
      (await this.deps.shiftsService.listInstances()).map((i) => [i.id, i]),
    );
    const shift = perShift ? instances.get(q.shiftInstanceId!) : undefined;
    if (perShift && !shift) throw refusal(404, "shift_not_found");

    const inPeriod = (op: PlanningOperation): ShiftInstance | undefined => {
      const inst = op.shiftInstanceId ? instances.get(op.shiftInstanceId) : undefined;
      if (!inst) return undefined;
      if (shift) return inst.id === shift.id ? inst : undefined;
      if (q.from && q.to)
        return inst.businessDate >= q.from && inst.businessDate <= q.to ? inst : undefined;
      return inst; // work_order level with no period: the whole order
    };

    const place = await this.placeOf();
    const now = new Date();
    const computedAt = now.toISOString();
    const periodFrom = shift?.businessDate ?? q.from ?? "";
    const periodTo = shift?.businessDate ?? q.to ?? "";
    const scope = scopeOf(q.level, perShift);

    // Group the period's rows by scope item.
    const groups = new Map<string, { code: string; rows: PlanningOperation[]; open: boolean }>();
    const items = await this.itemsOf(q, workOrders, place);
    for (const item of items) groups.set(item.id, { code: item.code, rows: [], open: false });
    // KPI-009 rule 5: a roll-up needs each row's step cycle time at its work unit.
    const rollup = q.level === "work_center" || q.level === "area" || q.level === "site";
    const cycleOfRow = rollup ? await this.cycleResolver(workOrders) : undefined;
    const cycles = new Map<string, StepCycle>();
    // KPI-013 fall-off counts steps: each row's step number comes from Master Data.
    const stepNumberOf = await this.stepNumberResolver(workOrders);

    for (const op of operations) {
      const inst = inPeriod(op);
      if (!inst || !op.workUnitId) continue;
      const where = place(op.workUnitId);
      const key =
        q.level === "work_unit"
          ? op.workUnitId
          : q.level === "work_center"
            ? where.workCenterId
            : q.level === "area"
              ? where.areaId
              : q.level === "site"
                ? where.siteId
                : op.workOrderId;
      const group = groups.get(key);
      if (!group) continue;
      group.rows.push({ ...op, stepNumber: stepNumberOf(op, inst.businessDate) });
      if (cycleOfRow) cycles.set(op.id, cycleOfRow(op, inst.businessDate));
      if (inst.status === "open") group.open = true;
    }
    if (shift?.status === "open") for (const g of groups.values()) g.open = true;

    return [...groups.entries()].flatMap(([scopeId, g]) =>
      resultsFor(
        {
          aggregationLevel: q.level,
          aggregationMethod: "sum_of_terms",
          scopeId,
          scopeCode: g.code,
          shiftInstanceId: shift?.id ?? null,
          periodFrom,
          periodTo,
          isProvisional: g.open,
          computedAt,
        },
        scope,
        g.rows,
        now,
        (op) =>
          cycles.get(op.id) ?? {
            workUnitCode: "",
            uomId: "",
            cycleTimeSeconds: null,
            batchSize: null,
          },
      ),
    );
  }

  /**
   * The step's cycle time at the row's work unit on the business date
   * (WMS-003 `cycleTimeIdeal`: the station override in effect, else the step
   * default). The row's pinned routing (Planning PLN-003 rule 2) and its
   * `stepId` locate the step. Unresolvable → cycle time null, never a guess.
   */
  private async cycleResolver(
    workOrders: PlanningWorkOrder[],
  ): Promise<(op: PlanningOperation, date: string) => StepCycle> {
    const { workMasterStore, workUnitsStore, referenceDataStore } = this.deps;
    const [operations, stations, units, times] = await Promise.all([
      workMasterStore.readOperations(),
      workMasterStore.readStations(),
      workUnitsStore.all(),
      referenceDataStore.listTimeConversions(),
    ]);
    // The step's cycle time is in its timeConversionId's unit (WMS-003); a station
    // override shares it. Read once per resolver, never guessed.
    const secondsPerUnit = new Map(times.map((t) => [t.id, t.secondsPerUnit]));
    const codeOf = new Map(units.map((u) => [u.id, u.code]));
    const routingOf = new Map(workOrders.map((w) => [w.id, w.routingId ?? null]));
    return (op, date) => {
      const workUnitCode = codeOf.get(op.workUnitId ?? "") ?? "";
      const none: StepCycle = { workUnitCode, uomId: "", cycleTimeSeconds: null, batchSize: null };
      const routingId = routingOf.get(op.workOrderId) ?? null;
      if (!op.workUnitId) return none;
      const step = stepRowOf(operations, routingId, op.stepId, date);
      if (!step) return none;
      const cycle = cycleTimeIdeal(
        step,
        stations.filter((s) => s.routingId === routingId && s.stepId === op.stepId),
        op.workUnitId,
        date,
      );
      const cycleTimeSeconds = stepCycleSeconds(cycle, step.timeConversionId, secondsPerUnit);
      return { workUnitCode, uomId: step.uomId, cycleTimeSeconds, batchSize: step.batchSize };
    };
  }

  /**
   * The routing step number of a row's operation, in effect on the row's business
   * date: the same step lookup the cycle time takes (`stepRowOf`). Undefined when
   * Master Data has no such step.
   */
  private async stepNumberResolver(
    workOrders: PlanningWorkOrder[],
  ): Promise<(op: PlanningOperation, date: string) => number | undefined> {
    const operations = await this.deps.workMasterStore.readOperations();
    const routingOf = new Map(workOrders.map((w) => [w.id, w.routingId ?? null]));
    return (op, date) =>
      stepRowOf(operations, routingOf.get(op.workOrderId) ?? null, op.stepId, date)?.stepNumber;
  }

  /**
   * KPI-008 AC-11 (`kpi-004.conversion.product`): the product running now on
   * this work unit, else the last one run. The spec reads it from the work
   * unit's `product_code` tag; tag readings don't exist in this prototype, so
   * the Planning API's execution rows (actual start / end) stand in.
   */
  async runningProduct(
    workUnitId: string,
  ): Promise<{ productId: string; runningNow: boolean; at: string | null } | null> {
    const { workOrders, operations } = await this.planningData();
    const mine = operations.filter((o) => o.workUnitId === workUnitId && o.actualStart);
    const productOf = (op: PlanningOperation) =>
      workOrders.find((w) => w.id === op.workOrderId)?.productId;
    const running = mine.find((o) => !o.actualEnd);
    if (running && productOf(running)) {
      return { productId: productOf(running)!, runningNow: true, at: running.actualStart };
    }
    const last = [...mine]
      .filter((o) => productOf(o))
      .sort((a, b) => (b.actualEnd ?? "").localeCompare(a.actualEnd ?? ""))[0];
    return last ? { productId: productOf(last)!, runningNow: false, at: last.actualEnd } : null;
  }

  /**
   * The scope items to report on: every work unit / work center / area / site of the site
   * filter, or the Job Orders.
   */
  private async itemsOf(
    q: KpiQuery,
    workOrders: PlanningWorkOrder[],
    place: (wuId: string) => { workCenterId: string; areaId: string; siteId: string },
  ): Promise<Array<{ id: string; code: string }>> {
    const { sitesStore, areasStore, workCentersStore, workUnitsStore } = this.deps;
    const inSite = (siteId: string) => !q.siteId || siteId === q.siteId;
    switch (q.level) {
      case "work_unit":
        return (await workUnitsStore.all())
          .filter((w) => inSite(place(w.id).siteId))
          .map((w) => ({ id: w.id, code: w.code }));
      case "work_center": {
        const siteOfArea = new Map((await areasStore.all()).map((a) => [a.id, a.siteId]));
        return (await workCentersStore.all())
          .filter((w) => inSite(siteOfArea.get(w.areaId) ?? ""))
          .map((w) => ({ id: w.id, code: w.code }));
      }
      case "area":
        return (await areasStore.all())
          .filter((a) => inSite(a.siteId))
          .map((a) => ({ id: a.id, code: a.code }));
      case "site":
        return (await sitesStore.all())
          .filter((s) => inSite(s.id))
          .map((s) => ({ id: s.id, code: s.code }));
      case "work_order":
        return workOrders
          .filter((w) => (!q.workOrderId || w.id === q.workOrderId) && inSite(w.siteId))
          .map((w) => ({ id: w.id, code: w.woNumber }));
    }
  }

  private async placeOf() {
    const { areasStore, workCentersStore, workUnitsStore } = this.deps;
    const [units, centers, areas] = await Promise.all([
      workUnitsStore.all(),
      workCentersStore.all(),
      areasStore.all(),
    ]);
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const centerById = new Map(centers.map((center) => [center.id, center]));
    const areaById = new Map(areas.map((area) => [area.id, area]));
    return (workUnitId: string) => {
      const wu = unitById.get(workUnitId);
      const wc = wu ? centerById.get(wu.workCenterId) : undefined;
      const area = wc ? areaById.get(wc.areaId) : undefined;
      return { workCenterId: wc?.id ?? "", areaId: area?.id ?? "", siteId: area?.siteId ?? "" };
    };
  }

  private async planningData(): Promise<{
    workOrders: PlanningWorkOrder[];
    operations: PlanningOperation[];
  }> {
    // Each execution's `operationId` (its Job Order's step) becomes the row's `stepId`.
    const { workOrders, executions } = await this.deps.planningClient
      .executions()
      .catch((err: unknown) => {
        throw planningUnreachable(err);
      });
    return {
      workOrders,
      operations: executions.map((e) => ({ ...e, stepId: e.operationId })),
    };
  }
}

export { KpiResultsService };
export type { TKpiResultsService };
