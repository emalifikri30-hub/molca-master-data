import { declareAuditAction, markDraftEdit } from "../../../shared/audit/audit-context.js";
import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { conversionPath, round6 } from "../products/uom-conversion.js";
import {
  addDays,
  bomDraftError,
  checkError,
  cleanCheck,
  detailChange,
  endSteps,
  findCycle,
  findLoop,
  inEffect,
  releasePlan,
  stepError,
  versionChange,
} from "./work-master-rules.js";

import type { ProductsReader } from "../products/products-repository.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";
import type {
  Bom,
  BomLine,
  CheckFrequency,
  CheckValueType,
  Operation,
  OperationCheck,
  OperationInstruction,
  OperationWorkUnit,
  ProductFlow,
  Routing,
  WorkMasterRefusal,
} from "./work-master.js";
import type { WorkMasterStore } from "./work-master-store.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function refuse(r: WorkMasterRefusal) {
  return refusal(422, "work_master", { refusal: r });
}

/** A class step's stations (F-08 §9.2.2), each with an optional cycle-time override. */
type StationInput = { workUnitId: string; cycleTimeValue: number | null };

type StepFields = Omit<Operation, "id" | "stepId" | "routingId" | "validFrom" | "validTo">;

type OperationInput = Omit<Operation, "id" | "stepId" | "validTo"> & {
  stations?: Array<StationInput>;
  /** "Waits for" — other steps (`stepId`) of the same routing version. */
  waitsFor?: Array<string>;
};

type StepInput = StepFields & { stations?: Array<StationInput>; waitsFor?: Array<string> };

/** A standard edit (WMS-003 rule 5): a dated row inside the same version. */
type ChangeStandard = {
  validFrom: string;
  /** Optional: a new row may carry a new time or item unit (throughput entry picks the time unit). */
  uomId?: string;
  timeConversionId?: string;
  cycleTimeValue: number | null;
  standardSpeedValue: number | null;
  standardSetupTime: number | null;
  setupTimeConversionId?: string | null;
  crewSize: number | null;
  batchSize: number | null;
  plannedShrinkage?: number | null;
  yieldMinPct?: number | null;
  yieldMaxPct?: number | null;
  maxHoldTime?: number | null;
  holdTimeConversionId?: string | null;
  /** A class step's station overrides; a changed value is a dated row too. */
  overrides?: Array<StationInput>;
};

type BomInput = {
  productId: string;
  flowId?: string;
  validFrom: string;
  baseQty?: number;
  baseUomId?: string;
  isPhantom?: boolean;
  lines: Array<Omit<BomLine, "id">>;
};

type InstructionInput = {
  instructionId?: string | null;
  instructionText: string;
  requiresConfirmation: boolean;
};

type CheckInput = {
  checkId?: string | null;
  checkName: string;
  valueType: CheckValueType;
  targetValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  uomId: string | null;
  sampleCount: number;
  frequencyType: CheckFrequency;
  frequencyIntervalValue: number | null;
  frequencyIntervalConversionId: string | null;
  isCritical: boolean;
};

type DetailInput = {
  /** When a standard (dated) change starts. Ignored on a draft, which is edited in place. */
  validFrom: string;
  instructions: Array<InstructionInput>;
  checks: Array<CheckInput>;
};

type WorkMasterServiceDeps = {
  workMasterStore: WorkMasterStore;
  productsReaderRepository: ProductsReader;
  workUnitsStore: WorkUnitsStore;
};

/** WMS-003 rule 11: a typed value keeps up to 6 decimals, rounded half-up. */
const rounded = (n: number | null) => (n === null ? null : round6(n));

const CHECK_KEYS = [
  "checkName",
  "valueType",
  "targetValue",
  "minValue",
  "maxValue",
  "uomId",
  "sampleCount",
  "frequencyType",
  "frequencyIntervalValue",
  "frequencyIntervalConversionId",
  "isCritical",
] as const;

class WorkMasterService {
  readonly data: WorkMasterStore;
  private products: ProductsReader;
  private workUnits: WorkUnitsStore;

  constructor({
    workMasterStore,
    productsReaderRepository,
    workUnitsStore,
  }: WorkMasterServiceDeps) {
    this.data = workMasterStore;
    this.products = productsReaderRepository;
    this.workUnits = workUnitsStore;
  }

  private async product(productId: string) {
    const product = await this.products.getProduct(productId);
    if (!product) throw refusal(404, "not_found");
    return product;
  }

  private async routing(id: string): Promise<Routing> {
    const routing = (await this.data.readRoutings()).find((r) => r.id === id);
    if (!routing) throw refusal(404, "not_found");
    return routing;
  }

  /** WMS-002 rule 1 / WMS-003 rule 5: a structural edit happens on a draft only. */
  private draftOnly(v: { status: Routing["status"] }) {
    if (v.status !== "draft") throw refuse({ kind: "not_draft", status: v.status });
    markDraftEdit();
  }

  /** F-08 §9.0 (wave 2): every product has a flow; "Standard" is made automatically. */
  async ensureFlow(productId: string, flowId?: string): Promise<ProductFlow> {
    const mine = (await this.data.readFlows()).filter((f) => f.productId === productId);
    const chosen = flowId ? mine.find((f) => f.id === flowId) : mine.find((f) => f.isPrimary);
    if (chosen) return chosen;
    if (flowId) throw refusal(404, "not_found");
    const created: ProductFlow = {
      id: ulid(),
      productId,
      flowCode: "STANDARD",
      flowName: "Standard",
      isPrimary: true,
      status: "released",
      validFrom: today(),
      validTo: null,
    };
    return this.data.saveFlow(created);
  }

  /**
   * WMS-003 rule 10 (F-08 §9.2.1): a discrete step whose item unit is not the
   * product's base unit needs a conversion path in force on `validFrom`. The
   * same rule holds for a BOM's recipe base unit (WMS-002 rule 6).
   */
  private async checkUnit(productId: string, uomId: string, validFrom: string) {
    const product = await this.product(productId);
    const path = conversionPath(
      await this.products.listConversions(),
      product,
      uomId,
      product.baseUomId,
      validFrom,
    );
    if (!path) {
      throw refuse({
        kind: "no_conversion",
        uomId,
        baseUomId: product.baseUomId,
        productCode: product.code,
        validFrom,
      });
    }
  }

  // -------------------------------------------------------------------------
  // WMS-002 — versioned BOMs

  /** Components of the BOM version in force on `date` (drafts never count). */
  private componentsOf(boms: Bom[], productId: string, date: string): string[] {
    const bom = inEffect(
      boms.filter((b) => b.productId === productId && b.status !== "draft"),
      date,
    );
    return bom ? bom.lines.map((l) => l.componentProductId) : [];
  }

  /** The steps of the product's routings — a BOM line's entry step must be one (rule 8). */
  private async stepIdsOf(productId: string): Promise<Set<string>> {
    const [routings, operations] = await Promise.all([
      this.data.readRoutings(),
      this.data.readOperations(),
    ]);
    const routingIds = new Set(routings.filter((r) => r.productId === productId).map((r) => r.id));
    return new Set(operations.filter((o) => routingIds.has(o.routingId)).map((o) => o.stepId));
  }

  /** WMS-002 rules 3, 5–8, 10 for one version's content. */
  private async validateBom(productId: string, content: Omit<Bom, "id" | "version" | "status">) {
    const [product, products, boms] = await Promise.all([
      this.product(productId),
      this.products.listProducts(),
      this.data.readBoms(),
    ]);
    const typeOf = (id: string) => products.find((p) => p.id === id)?.productType;
    const error = bomDraftError(
      { productType: product.productType, ...content },
      typeOf,
      await this.stepIdsOf(productId),
    );
    if (error) throw refuse(error);
    // Rule 6: the recipe base unit is the base unit or has a conversion path on valid_from.
    await this.checkUnit(productId, content.baseUomId, content.validFrom);
    const chain = findCycle(
      productId,
      content.lines.map((l) => l.componentProductId),
      (id) => this.componentsOf(boms, id, content.validFrom),
    );
    if (chain) throw refuse({ kind: "circular", chain });
  }

  private async bomContent(
    productId: string,
    flowId: string,
    input: Omit<BomInput, "productId" | "flowId">,
    previous?: Bom,
  ) {
    const product = await this.product(productId);
    return {
      productId,
      flowId,
      baseQty: input.baseQty ?? previous?.baseQty ?? 1,
      baseUomId: input.baseUomId ?? previous?.baseUomId ?? product.baseUomId,
      isPhantom: input.isPhantom ?? previous?.isPhantom ?? false,
      validFrom: input.validFrom,
      validTo: null,
      lines: input.lines.map((l) => ({
        ...l,
        // Rule 8: only a produced line has a primary-output mark.
        isPrimaryOutput: l.lineUse === "produced" ? Boolean(l.isPrimaryOutput) : null,
        dispenseToleranceValue: l.dispenseToleranceType ? l.dispenseToleranceValue : null,
        id: ulid(),
      })),
    };
  }

  /**
   * WMS-002 rule 2 / WMS-003 rule 5 (PO 2026-10-02, prd-molcadx#24 item 19):
   * a flow has at most one draft — edit that one (`draft_exists`, naming its
   * version). For routings the limit is per flow at each work center (PO
   * 2026-10-03, prd-molcadx#26 item 10); for BOMs, per flow.
   */
  private noOtherDraft(
    rows: ReadonlyArray<{ id: string; status: string; version: number }>,
    entity: "bom" | "routing",
    except?: string,
  ) {
    const draft = rows.find((r) => r.status === "draft" && r.id !== except);
    if (draft) {
      throw refuse({ kind: "draft_exists", draftId: draft.id, version: draft.version, entity });
    }
  }

  /**
   * WMS-002 AC-1: a new BOM version is saved as a draft — numbered per flow,
   * usable by no job until it is released.
   */
  async createBom(input: BomInput): Promise<Bom> {
    const flow = await this.ensureFlow(input.productId, input.flowId);
    const siblings = (await this.data.readBoms()).filter(
      (b) => b.productId === input.productId && b.flowId === flow.id,
    );
    this.noOtherDraft(siblings, "bom");
    const latest = [...siblings].sort((a, b) => b.version - a.version)[0];
    const content = await this.bomContent(input.productId, flow.id, input, latest);
    await this.validateBom(input.productId, content);
    const created: Bom = {
      ...content,
      id: ulid(),
      version: (latest?.version ?? 0) + 1,
      status: "draft",
    };
    return this.data.saveBom(created);
  }

  /**
   * WMS-002 rule 1 / AC-4 / AC-19: a draft is edited in place. Any edit of a
   * released version (BOM lines are not effective-dated, rule 10) leaves it
   * unchanged and opens the next version as a draft with the edit.
   */
  async updateBom(id: string, input: Omit<BomInput, "productId" | "flowId">): Promise<Bom> {
    const bom = (await this.data.readBoms()).find((b) => b.id === id);
    if (!bom) throw refusal(404, "not_found");
    if (bom.status === "retired") throw refuse({ kind: "not_draft", status: bom.status });
    if (bom.status === "released") {
      return this.createBom({ ...input, productId: bom.productId, flowId: bom.flowId });
    }
    markDraftEdit();
    const content = await this.bomContent(bom.productId, bom.flowId, input, bom);
    await this.validateBom(bom.productId, content);
    Object.assign(bom, content);
    return this.data.saveBom(bom);
  }

  /**
   * WMS-002 rules 1–2 / AC-4 / AC-5: releasing a draft retires the released
   * version it follows (closed the day before); any other overlap is refused.
   */
  async releaseBom(id: string): Promise<Bom> {
    // F-14: `release` is a business action, audited as such and needing a reason.
    declareAuditAction("BOM", "release");
    const boms = await this.data.readBoms();
    const bom = boms.find((b) => b.id === id);
    if (!bom) throw refusal(404, "not_found");
    this.draftOnly(bom);
    await this.validateBom(bom.productId, bom);
    const siblings = boms.filter(
      (b) => b.productId === bom.productId && b.flowId === bom.flowId && b.id !== bom.id,
    );
    const plan = releasePlan(bom, siblings);
    if ("overlap" in plan) throw refuse({ kind: "overlap", ...plan.overlap });
    for (const r of plan.retire) {
      const old = siblings.find((s) => s.id === r.id)!;
      old.validTo = r.validTo;
      old.status = "retired";
      await this.data.saveBom(old);
    }
    bom.status = "released";
    return this.data.saveBom(bom);
  }

  // -------------------------------------------------------------------------
  // WMS-003 — routings, versions and steps

  /**
   * WMS-003: a routing of a product at a work center, as a draft. When a
   * version already exists for the flow and work center, the next version
   * is opened as a copy instead (rule 5). `steps` pre-fills one step per
   * ticked work unit in the work center's flow order (AC-19), with no cycle
   * time yet ("Cycle time missing" until it is entered).
   */
  async createRouting(input: {
    productId: string;
    workCenterId: string;
    validFrom: string;
    flowId?: string;
    isPrimary?: boolean;
    enforceSequence?: boolean;
    steps?: Array<{ workUnitId: string; stepName?: string; timeConversionId: string }>;
  }): Promise<Routing> {
    const product = await this.product(input.productId);
    const flow = await this.ensureFlow(input.productId, input.flowId);
    const siblings = (await this.data.readRoutings()).filter(
      (r) =>
        r.productId === input.productId &&
        r.flowId === flow.id &&
        r.workCenterId === input.workCenterId,
    );
    this.noOtherDraft(siblings, "routing");
    const latest = [...siblings].sort((a, b) => b.version - a.version)[0];
    if (latest) return this.newDraft(latest.id);
    const created: Routing = {
      id: ulid(),
      productId: input.productId,
      workCenterId: input.workCenterId,
      flowId: flow.id,
      version: 1,
      status: "draft",
      isPrimary: input.isPrimary ?? true,
      enforceSequence: input.enforceSequence ?? false,
      validFrom: input.validFrom,
      validTo: null,
    };
    await this.data.saveRouting(created);
    for (const [i, s] of (input.steps ?? []).entries()) {
      const unit = await this.workUnits.get(s.workUnitId);
      if (!unit || unit.workCenterId !== input.workCenterId) {
        throw refuse({ kind: "station_or_class" });
      }
      await this.data.saveOperation({
        ...this.emptyStep(),
        id: ulid(),
        stepId: ulid(),
        routingId: created.id,
        stepNumber: (i + 1) * 10,
        // Rule 12: the step name is pre-filled from the work unit's name.
        stepName: s.stepName?.trim() || unit.name,
        workUnitId: s.workUnitId,
        uomId: product.baseUomId,
        timeConversionId: s.timeConversionId,
        validFrom: input.validFrom,
        validTo: null,
      });
    }
    return created;
  }

  private emptyStep(): Omit<StepFields, "stepNumber" | "stepName" | "uomId" | "timeConversionId"> {
    return {
      stepType: null,
      workUnitId: null,
      requiredWorkUnitClassId: null,
      cycleTimeValue: null,
      batchSize: null,
      standardSpeedValue: null,
      speedUomId: null,
      standardSetupTime: null,
      setupTimeConversionId: null,
      crewSize: null,
      plannedShrinkage: null,
      yieldMinPct: null,
      yieldMaxPct: null,
      maxHoldTime: null,
      holdTimeConversionId: null,
    };
  }

  /**
   * WMS-003 AC-16 ("Start version <n+1> as a draft?"): the next version as a
   * draft copy — every step, station, dependency, instruction and check in
   * force on its start date. Step, instruction and check ids are kept, so a
   * BOM line's entry step survives the new version.
   */
  async newDraft(routingId: string): Promise<Routing> {
    const source = await this.routing(routingId);
    const siblings = (await this.data.readRoutings()).filter(
      (r) =>
        r.productId === source.productId &&
        r.flowId === source.flowId &&
        r.workCenterId === source.workCenterId,
    );
    this.noOtherDraft(siblings, "routing");
    const validFrom = today() > source.validFrom ? today() : addDays(source.validFrom, 1);
    const draft: Routing = {
      ...source,
      id: ulid(),
      version: Math.max(...siblings.map((r) => r.version)) + 1,
      status: "draft",
      validFrom,
      validTo: null,
    };
    await this.data.saveRouting(draft);
    const at = (rows: Array<{ validFrom: string; validTo: string | null }>) =>
      inEffect(rows, validFrom) ?? rows.at(-1);
    const copy = <
      T extends { id: string; routingId: string; validFrom: string; validTo: string | null },
    >(
      rows: Array<T>,
      key: (r: T) => string,
    ) => {
      const groups = new Map<string, Array<T>>();
      for (const r of rows.filter((x) => x.routingId === source.id)) {
        groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
      }
      return [...groups.values()]
        .map((g) => at(g) as T | undefined)
        .filter((r): r is T => Boolean(r) && (r!.validTo === null || r!.validTo > validFrom))
        .map((r) => ({ ...r, id: ulid(), routingId: draft.id, validFrom, validTo: null }));
    };
    const [operations, stations, instructions, checks, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readStations(),
      this.data.readInstructions(),
      this.data.readChecks(),
      this.data.readDependencies(),
    ]);
    for (const row of copy(operations, (o) => o.stepId)) await this.data.saveOperation(row);
    for (const row of copy(stations, (o) => `${o.stepId}:${o.workUnitId}`)) {
      await this.data.saveStation(row);
    }
    for (const row of copy(instructions, (i) => i.instructionId)) {
      await this.data.saveInstruction(row);
    }
    for (const row of copy(checks, (c) => c.checkId)) await this.data.saveCheck(row);
    for (const row of dependencies
      .filter((d) => d.routingId === source.id)
      .map((d) => ({ ...d, id: ulid(), routingId: draft.id }))) {
      await this.data.saveDependency(row);
    }
    return draft;
  }

  /**
   * Version flags. "Steps must be done in order" and "Primary routing at
   * <work center>" are declared here (rule 16); a draft's start date moves
   * its rows with it.
   */
  async updateRouting(
    id: string,
    patch: { isPrimary?: boolean; enforceSequence?: boolean; validFrom?: string },
  ): Promise<Routing> {
    const routing = await this.routing(id);
    if (routing.status === "retired") throw refuse({ kind: "not_draft", status: routing.status });
    if (patch.validFrom !== undefined && patch.validFrom !== routing.validFrom) {
      this.draftOnly(routing);
      const from = routing.validFrom;
      const [operations, stations, instructions, checks] = await Promise.all([
        this.data.readOperations(),
        this.data.readStations(),
        this.data.readInstructions(),
        this.data.readChecks(),
      ]);
      const shift = async <T extends { routingId: string; validFrom: string }>(
        rows: T[],
        save: (row: T) => Promise<T>,
      ) => {
        for (const row of rows) {
          if (row.routingId === id && row.validFrom === from) {
            row.validFrom = patch.validFrom!;
            await save(row);
          }
        }
      };
      await shift(operations, (row) => this.data.saveOperation(row));
      await shift(stations, (row) => this.data.saveStation(row));
      await shift(instructions, (row) => this.data.saveInstruction(row));
      await shift(checks, (row) => this.data.saveCheck(row));
      routing.validFrom = patch.validFrom;
    }
    if (patch.isPrimary !== undefined) routing.isPrimary = patch.isPrimary;
    if (patch.enforceSequence !== undefined) routing.enforceSequence = patch.enforceSequence;
    return this.data.saveRouting(routing);
  }

  /**
   * WMS-003 rule 7 / AC-16: "Release" makes a draft usable by work orders and
   * retires the previous released version of the same flow and work center
   * from the release's start date. A discrete step needs its cycle time
   * (rule 1, AC-3) by then.
   */
  async releaseRouting(id: string): Promise<Routing> {
    declareAuditAction("ROUTING", "release");
    const routing = await this.routing(id);
    this.draftOnly(routing);
    const [operations, stations, instructions, checks, routings, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readStations(),
      this.data.readInstructions(),
      this.data.readChecks(),
      this.data.readRoutings(),
      this.data.readDependencies(),
    ]);
    const ops = operations.filter((o) => o.routingId === id && o.validTo === null);
    if (ops.some((o) => o.cycleTimeValue === null && o.standardSpeedValue === null)) {
      throw refuse({ kind: "cycle_not_positive" });
    }
    // Rule 21 / AC-37: the version ends in exactly one step. Also refused on
    // each step save (see refuseTwoEndSteps); release checks it again.
    this.refuseTwoEndSteps(
      ops,
      dependencies.filter((d) => d.routingId === id),
    );
    const siblings = routings.filter(
      (r) =>
        r.id !== id &&
        r.productId === routing.productId &&
        r.flowId === routing.flowId &&
        r.workCenterId === routing.workCenterId,
    );
    const plan = releasePlan(routing, siblings);
    if ("overlap" in plan) throw refuse({ kind: "overlap", ...plan.overlap });
    await this.noDroppedBomStep(routing, ops, siblings, operations);
    const close = async <
      T extends { routingId: string; validFrom: string; validTo: string | null },
    >(
      rows: T[],
      routingId: string,
      validTo: string,
      save: (row: T) => Promise<T>,
    ) => {
      for (const row of rows) {
        if (row.routingId !== routingId || row.validFrom > validTo) continue;
        if (row.validTo === null || row.validTo > validTo) {
          row.validTo = validTo;
          await save(row);
        }
      }
    };
    for (const r of plan.retire) {
      const old = siblings.find((s) => s.id === r.id)!;
      old.validTo = r.validTo;
      old.status = "retired";
      await this.data.saveRouting(old);
      await close(operations, old.id, r.validTo, (row) => this.data.saveOperation(row));
      await close(stations, old.id, r.validTo, (row) => this.data.saveStation(row));
      await close(instructions, old.id, r.validTo, (row) => this.data.saveInstruction(row));
      await close(checks, old.id, r.validTo, (row) => this.data.saveCheck(row));
    }
    routing.status = "released";
    return this.data.saveRouting(routing);
  }

  /**
   * W-22 (PO 2026-10-03) / WMS-003 rule 5, AC-36: releasing a version that
   * drops a step a released BOM line of the same flow points at
   * (`BOM_LINE.step_id`) is refused, naming the BOM version and the line.
   * "Dropped" = in the version released now at this flow and work center, not
   * in the new one. Nothing changes; the line is moved first.
   */
  private async noDroppedBomStep(
    routing: Routing,
    newOps: ReadonlyArray<Operation>,
    siblings: ReadonlyArray<Routing>,
    operations: ReadonlyArray<Operation>,
  ) {
    const current = siblings.find((r) => r.status === "released" && r.validTo === null);
    if (!current) return;
    const kept = new Set(newOps.map((o) => o.stepId));
    const dropped = new Map(
      operations
        .filter((o) => o.routingId === current.id && o.validTo === null && !kept.has(o.stepId))
        .map((o) => [o.stepId, o] as const),
    );
    if (dropped.size === 0) return;
    const boms = (await this.data.readBoms()).filter(
      (b) =>
        b.status === "released" &&
        b.validTo === null &&
        b.productId === routing.productId &&
        b.flowId === routing.flowId,
    );
    for (const bom of boms) {
      const line = bom.lines.find((l) => l.stepId !== null && dropped.has(l.stepId));
      if (!line) continue;
      const step = dropped.get(line.stepId!)!;
      const component = await this.products.getProduct(line.componentProductId);
      throw refuse({
        kind: "step_used_by_bom",
        version: routing.version,
        bomVersion: bom.version,
        component: component?.code ?? line.componentProductId,
        step: step.stepName || String(step.stepNumber),
      });
    }
  }

  /**
   * WMS-003 rule 21 / AC-37: a save that leaves two or more end steps is
   * refused, nothing is written. `steps` and `dependencies` are the version as
   * it would be after the save; a waits-for row whose step is not in `steps`
   * is ignored.
   */
  private refuseTwoEndSteps(
    steps: ReadonlyArray<{ stepId: string; stepNumber: number; stepName: string }>,
    dependencies: ReadonlyArray<{ stepId: string; predecessorStepId: string }>,
  ) {
    const ends = endSteps(
      steps,
      dependencies.filter((d) => steps.some((s) => s.stepId === d.stepId)),
    );
    if (ends.length > 1) throw refuse({ kind: "end_steps", steps: ends.map((e) => e.stepName) });
  }

  /** WMS-003 rules 4, 12–14, 20 for a step's content (rule 9–10 item unit included). */
  private async validateStep(
    routing: Routing,
    step: StepInput,
    validFrom: string,
    stepId: string | null,
  ) {
    const error = stepError(step);
    if (error) throw refuse({ kind: error });
    const [operations, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readDependencies(),
    ]);
    // Rule 3: step numbers are unique within a routing version.
    const taken = operations.some(
      (o) =>
        o.routingId === routing.id &&
        o.stepId !== stepId &&
        o.stepNumber === step.stepNumber &&
        o.validTo === null,
    );
    if (taken) throw refuse({ kind: "step_taken", stepNumber: step.stepNumber });
    if (step.workUnitId) {
      const unit = await this.workUnits.get(step.workUnitId);
      if (!unit || unit.workCenterId !== routing.workCenterId) {
        throw refuse({ kind: "station_or_class" });
      }
    }
    // Rule 4: a class step's stations are of that class and in the routing's work center.
    for (const s of step.stations ?? []) {
      const unit = await this.workUnits.get(s.workUnitId);
      if (
        step.requiredWorkUnitClassId === null ||
        !unit ||
        unit.workCenterId !== routing.workCenterId ||
        unit.classId !== step.requiredWorkUnitClassId
      ) {
        throw refuse({ kind: "station_not_in_class", workUnitId: s.workUnitId });
      }
      if (s.cycleTimeValue !== null && !(s.cycleTimeValue > 0)) {
        throw refuse({ kind: "cycle_not_positive" });
      }
    }
    // Rule 14: "Waits for" names other steps of the same version; no loops.
    if (step.waitsFor) {
      const known = new Set(
        operations.filter((o) => o.routingId === routing.id).map((o) => o.stepId),
      );
      if (step.waitsFor.some((p) => p === stepId || !known.has(p))) {
        throw refuse({ kind: "waits_for_unknown" });
      }
      const others = dependencies.filter((d) => d.routingId === routing.id && d.stepId !== stepId);
      const mine = step.waitsFor.map((p) => ({ stepId: stepId ?? "new", predecessorStepId: p }));
      const loop = findLoop([...others, ...mine]);
      if (loop) {
        const name = (namedId: string) =>
          namedId === (stepId ?? "new")
            ? step.stepName
            : (operations.find((o) => o.stepId === namedId && o.routingId === routing.id)
                ?.stepName ?? namedId);
        throw refuse({ kind: "loop", steps: loop.map(name) });
      }
    }
    if (step.cycleTimeValue !== null) {
      // Rule 9: on a discrete step the item and the time unit are both required.
      if (!step.uomId || !step.timeConversionId) throw refuse({ kind: "cycle_not_positive" });
      await this.checkUnit(routing.productId, step.uomId, validFrom);
    }
  }

  private async writeStations(routing: Routing, stepId: string, stations: Array<StationInput>) {
    for (const row of await this.data.readStations()) {
      if (row.routingId === routing.id && row.stepId === stepId) {
        await this.data.deleteStation(row.id);
      }
    }
    for (const s of stations) {
      await this.data.saveStation({
        id: ulid(),
        routingId: routing.id,
        stepId,
        workUnitId: s.workUnitId,
        cycleTimeValue: rounded(s.cycleTimeValue),
        validFrom: routing.validFrom,
        validTo: null,
      });
    }
  }

  private async writeWaitsFor(routing: Routing, stepId: string, waitsFor: Array<string>) {
    for (const row of await this.data.readDependencies()) {
      if (row.routingId === routing.id && row.stepId === stepId) {
        await this.data.deleteDependency(row.id);
      }
    }
    for (const predecessorStepId of waitsFor) {
      await this.data.saveDependency({
        id: ulid(),
        routingId: routing.id,
        stepId,
        predecessorStepId,
      });
    }
  }

  /** WMS-003: add a step — structural, so a draft only (rule 5). AC-3: a cycle time above 0. */
  async addOperation(input: OperationInput): Promise<Operation> {
    const routing = await this.routing(input.routingId);
    this.draftOnly(routing);
    const value = input.cycleTimeValue ?? input.standardSpeedValue;
    if (value === null || !(value > 0)) throw refuse({ kind: "cycle_not_positive" });
    if (input.requiredWorkUnitClassId === null && input.workUnitId !== null && !input.stepName) {
      input = { ...input, stepName: (await this.workUnits.get(input.workUnitId))?.name ?? "" };
    }
    await this.validateStep(routing, input, routing.validFrom, null);
    const stepId = ulid();
    const [operations, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readDependencies(),
    ]);
    this.refuseTwoEndSteps(
      [
        ...operations.filter((o) => o.routingId === routing.id && o.validTo === null),
        { stepId, stepNumber: input.stepNumber, stepName: input.stepName },
      ],
      [
        ...dependencies.filter((d) => d.routingId === routing.id),
        ...(input.waitsFor ?? []).map((predecessorStepId) => ({ stepId, predecessorStepId })),
      ],
    );
    const { stations, waitsFor, ...row } = input;
    const created: Operation = {
      ...row,
      stepType: row.stepType?.trim() || null,
      cycleTimeValue: rounded(row.cycleTimeValue),
      standardSpeedValue: rounded(row.standardSpeedValue),
      validFrom: routing.validFrom,
      id: ulid(),
      stepId,
      validTo: null,
    };
    await this.data.saveOperation(created);
    if (stations) await this.writeStations(routing, created.stepId, stations);
    if (waitsFor) await this.writeWaitsFor(routing, created.stepId, waitsFor);
    return created;
  }

  /**
   * Edit a step of a draft in place — station or class, name, type, standards,
   * stations and "Waits for". A released version is never edited in place.
   */
  async updateStep(routingId: string, stepId: string, input: StepInput): Promise<Operation> {
    const routing = await this.routing(routingId);
    this.draftOnly(routing);
    const rows = (await this.data.readOperations()).filter(
      (o) => o.routingId === routingId && o.stepId === stepId,
    );
    if (rows.length === 0) throw refusal(404, "not_found");
    await this.validateStep(routing, input, routing.validFrom, stepId);
    const [operations, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readDependencies(),
    ]);
    // No "Waits for" in the input keeps the step's stored rows (writeWaitsFor is skipped).
    this.refuseTwoEndSteps(
      [
        ...operations.filter(
          (o) => o.routingId === routingId && o.validTo === null && o.stepId !== stepId,
        ),
        { stepId, stepNumber: input.stepNumber, stepName: input.stepName },
      ],
      [
        ...dependencies.filter((d) => d.routingId === routingId && d.stepId !== stepId),
        ...(input.waitsFor
          ? input.waitsFor.map((predecessorStepId) => ({ stepId, predecessorStepId }))
          : dependencies.filter((d) => d.routingId === routingId && d.stepId === stepId)),
      ],
    );
    const { stations, waitsFor, ...fields } = input;
    // A draft has one row per step: the dated history starts at release.
    for (const old of rows.slice(1)) await this.data.deleteOperation(old.id);
    const row: Operation = {
      ...fields,
      stepType: fields.stepType?.trim() || null,
      cycleTimeValue: rounded(fields.cycleTimeValue),
      standardSpeedValue: rounded(fields.standardSpeedValue),
      id: rows[0].id,
      stepId,
      routingId,
      validFrom: routing.validFrom,
      validTo: null,
    };
    await this.data.saveOperation(row);
    if (fields.requiredWorkUnitClassId === null) await this.writeStations(routing, stepId, []);
    else if (stations) await this.writeStations(routing, stepId, stations);
    if (waitsFor) await this.writeWaitsFor(routing, stepId, waitsFor);
    return row;
  }

  /** Remove a step (and its stations, waits, instructions and checks) from a draft. */
  async removeStep(routingId: string, stepId: string): Promise<{ stepId: string }> {
    const routing = await this.routing(routingId);
    this.draftOnly(routing);
    const mine = (r: { routingId: string; stepId: string }) =>
      r.routingId === routingId && r.stepId === stepId;
    const [operations, stations, instructions, checks, dependencies] = await Promise.all([
      this.data.readOperations(),
      this.data.readStations(),
      this.data.readInstructions(),
      this.data.readChecks(),
      this.data.readDependencies(),
    ]);
    this.refuseTwoEndSteps(
      operations.filter(
        (o) => o.routingId === routingId && o.validTo === null && o.stepId !== stepId,
      ),
      dependencies.filter(
        (d) => d.routingId === routingId && d.stepId !== stepId && d.predecessorStepId !== stepId,
      ),
    );
    for (const row of operations) if (mine(row)) await this.data.deleteOperation(row.id);
    for (const row of stations) if (mine(row)) await this.data.deleteStation(row.id);
    for (const row of instructions) if (mine(row)) await this.data.deleteInstruction(row.id);
    for (const row of checks) if (mine(row)) await this.data.deleteCheck(row.id);
    for (const row of dependencies) {
      if (
        row.routingId === routingId &&
        (row.stepId === stepId || row.predecessorStepId === stepId)
      ) {
        await this.data.deleteDependency(row.id);
      }
    }
    return { stepId };
  }

  /**
   * WMS-003 AC-1 / rule 5: a standard edit (cycle time, speed, setup time,
   * shrinkage, yield range, hold time, a station override) closes the current
   * row the day before and opens a new one in the same version; AC-4: never a gap.
   */
  async changeStandard(currentId: string, input: ChangeStandard): Promise<Operation> {
    const current = (await this.data.readOperations()).find((o) => o.id === currentId);
    if (!current) throw refusal(404, "not_found");
    const routing = await this.routing(current.routingId);
    if (routing.status === "retired") throw refuse({ kind: "not_draft", status: routing.status });
    const value = input.cycleTimeValue ?? input.standardSpeedValue;
    if (value === null || !(value > 0)) throw refuse({ kind: "cycle_not_positive" });
    const change = versionChange(current, input.validFrom);
    if ("gap" in change) throw refuse({ kind: "gap", ...change.gap });
    if ("tooEarly" in change) throw refuse({ kind: "too_early" });
    const { overrides, ...standard } = input;
    const next: Operation = {
      ...current,
      ...standard,
      uomId: input.uomId ?? current.uomId,
      timeConversionId: input.timeConversionId ?? current.timeConversionId,
      setupTimeConversionId:
        input.setupTimeConversionId !== undefined
          ? input.setupTimeConversionId
          : current.setupTimeConversionId,
      plannedShrinkage:
        input.plannedShrinkage !== undefined ? input.plannedShrinkage : current.plannedShrinkage,
      yieldMinPct: input.yieldMinPct !== undefined ? input.yieldMinPct : current.yieldMinPct,
      yieldMaxPct: input.yieldMaxPct !== undefined ? input.yieldMaxPct : current.yieldMaxPct,
      maxHoldTime: input.maxHoldTime !== undefined ? input.maxHoldTime : current.maxHoldTime,
      holdTimeConversionId:
        input.holdTimeConversionId !== undefined
          ? input.holdTimeConversionId
          : current.holdTimeConversionId,
      cycleTimeValue: rounded(input.cycleTimeValue),
      standardSpeedValue: rounded(input.standardSpeedValue),
      id: ulid(),
      validFrom: input.validFrom,
      validTo: null,
    };
    const error = stepError(next);
    if (error) throw refuse({ kind: error });
    if (next.cycleTimeValue !== null)
      await this.checkUnit(routing.productId, next.uomId, input.validFrom);
    // Station overrides: only a changed value opens a dated row.
    const plans: Array<{ row: OperationWorkUnit; closeAt: string; value: number | null }> = [];
    const stations = await this.data.readStations();
    for (const o of overrides ?? []) {
      if (o.cycleTimeValue !== null && !(o.cycleTimeValue > 0)) {
        throw refuse({ kind: "cycle_not_positive" });
      }
      const row = inEffect(
        stations.filter(
          (w) =>
            w.routingId === routing.id &&
            w.stepId === current.stepId &&
            w.workUnitId === o.workUnitId,
        ),
        input.validFrom,
      );
      if (!row) throw refuse({ kind: "station_not_in_class", workUnitId: o.workUnitId });
      if (row.cycleTimeValue === rounded(o.cycleTimeValue)) continue;
      const c = versionChange(row, input.validFrom);
      if ("gap" in c) throw refuse({ kind: "gap", ...c.gap });
      if ("tooEarly" in c) throw refuse({ kind: "too_early" });
      plans.push({ row, closeAt: c.closeAt, value: rounded(o.cycleTimeValue) });
    }
    current.validTo = change.closeAt;
    await this.data.saveOperation(current);
    await this.data.saveOperation(next);
    for (const p of plans) {
      p.row.validTo = p.closeAt;
      await this.data.saveStation(p.row);
      await this.data.saveStation({
        ...p.row,
        id: ulid(),
        cycleTimeValue: p.value,
        validFrom: input.validFrom,
        validTo: null,
      });
    }
    return next;
  }

  /**
   * WMS-003 rules 5, 17, 18 / AC-29 / AC-30: a step's instructions and
   * checks. Adding, removing or re-ordering an instruction, or adding or
   * removing a check, is structural — a draft only. Text, confirmation flag
   * and check values are standard: dated rows inside the version.
   */
  async saveDetail(
    routingId: string,
    stepId: string,
    input: DetailInput,
  ): Promise<{ instructions: Array<OperationInstruction>; checks: Array<OperationCheck> }> {
    const routing = await this.routing(routingId);
    if (routing.status === "retired") throw refuse({ kind: "not_draft", status: routing.status });
    const draft = routing.status === "draft";
    const date = draft ? routing.validFrom : input.validFrom;
    const mine = <
      T extends { routingId: string; stepId: string; validFrom: string; validTo: string | null },
    >(
      rows: Array<T>,
    ) =>
      rows
        .filter((r) => r.routingId === routingId && r.stepId === stepId)
        .filter((r) => r.validFrom <= date && (r.validTo === null || r.validTo > date));
    const [storedInstructions, storedChecks] = await Promise.all([
      this.data.readInstructions(),
      this.data.readChecks(),
    ]);
    const curInstr = mine(storedInstructions).sort((a, b) => a.sequence - b.sequence);
    const curChecks = mine(storedChecks).sort((a, b) => a.sequence - b.sequence);

    // Rule 17: every instruction has text.
    if (input.instructions.some((i) => i.instructionText.trim() === "")) {
      throw refuse({ kind: "instruction_empty" });
    }
    // Rule 18: each check, against the others of the step.
    const checks = input.checks.map((c) => cleanCheck({ ...c, sampleCount: c.sampleCount || 1 }));
    checks.forEach((c, i) => {
      const error = checkError(
        c,
        checks.filter((_, j) => j !== i),
      );
      if (error === "check_name_required") throw refuse({ kind: error });
      if (error) throw refuse({ kind: error, checkName: c.checkName });
    });

    const pick = (c: Record<string, unknown>) =>
      Object.fromEntries(CHECK_KEYS.map((k) => [k, c[k] ?? null]));
    const change = detailChange(
      {
        instructions: curInstr,
        checks: curChecks.map((c, k) => ({ checkId: c.checkId, sequence: k + 1, ...pick(c) })),
      },
      {
        instructions: input.instructions.map((i) => ({
          ...i,
          instructionText: i.instructionText.trim(),
        })),
        checks: checks.map((c, k) => ({ checkId: c.checkId ?? null, sequence: k + 1, ...pick(c) })),
      },
    );
    const result = async () => {
      const [instructions, checks] = await Promise.all([
        this.data.readInstructions(),
        this.data.readChecks(),
      ]);
      return {
        instructions: mine(instructions).sort((a, b) => a.sequence - b.sequence),
        checks: mine(checks).sort((a, b) => a.sequence - b.sequence),
      };
    };
    if (change === "none") return result();
    if (change === "structural") this.draftOnly(routing);

    const instrRows = input.instructions.map((i, k): OperationInstruction => ({
      id: ulid(),
      instructionId: i.instructionId ?? ulid(),
      routingId,
      stepId,
      sequence: k + 1,
      instructionText: i.instructionText.trim(),
      requiresConfirmation: i.requiresConfirmation,
      validFrom: date,
      validTo: null,
    }));
    const checkRows = checks.map((c, k): OperationCheck => ({
      ...(pick(c) as Omit<
        OperationCheck,
        "id" | "checkId" | "routingId" | "stepId" | "sequence" | "validFrom" | "validTo"
      >),
      id: ulid(),
      checkId: c.checkId ?? ulid(),
      routingId,
      stepId,
      sequence: k + 1,
      validFrom: date,
      validTo: null,
    }));

    if (draft) {
      // A draft is edited in place.
      for (const row of storedInstructions) {
        if (row.routingId === routingId && row.stepId === stepId) {
          await this.data.deleteInstruction(row.id);
        }
      }
      for (const row of storedChecks) {
        if (row.routingId === routingId && row.stepId === stepId)
          await this.data.deleteCheck(row.id);
      }
      for (const row of instrRows) await this.data.saveInstruction(row);
      for (const row of checkRows) await this.data.saveCheck(row);
      return result();
    }

    // Released: only changed rows close the day before and reopen (AC-29).
    const dated = async <T extends { id: string; validFrom: string; validTo: string | null }>(
      cur: T,
      nextRow: T,
      same: boolean,
      save: (row: T) => Promise<T>,
    ) => {
      if (same) return;
      const c = versionChange(cur, date);
      if ("gap" in c) throw refuse({ kind: "gap", ...c.gap });
      if ("tooEarly" in c) throw refuse({ kind: "too_early" });
      cur.validTo = c.closeAt;
      await save(cur);
      await save(nextRow);
    };
    for (const [k, n] of instrRows.entries()) {
      const cur = curInstr[k];
      const same =
        cur.instructionText === n.instructionText &&
        cur.requiresConfirmation === n.requiresConfirmation;
      await dated(cur, { ...n, instructionId: cur.instructionId }, same, (row) =>
        this.data.saveInstruction(row),
      );
    }
    for (const n of checkRows) {
      const cur = curChecks.find((c) => c.checkId === n.checkId)!;
      const same = CHECK_KEYS.every((k) => cur[k] === n[k]) && cur.sequence === n.sequence;
      await dated(cur, n, same, (row) => this.data.saveCheck(row));
    }
    return result();
  }
}

export { WorkMasterService };
export type { WorkMasterService as TWorkMasterService, WorkMasterServiceDeps };
