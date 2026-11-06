// PRD-003 US-FND-SIT-002 — deactivate a site, area, work center or work unit
// without breaking history. The node and everything below it get
// `validTo = effective date`; nothing is deleted.
//
// Blockers (§4): active asset placements (rule 5) and open jobs —
// `WORK_ORDER_OPERATION` rows in pending / scheduled / in_progress / on_hold,
// read from the Production Planning API. SIT-002 is 🟢 Ready; two blocker
// counts stay unbuilt because their data can't be read here (raised with the
// PO as a docs issue):
// - open downtime: no repo serves `ASSET_STATE_LOG` (B5) — no store or API.
// Open shifts count only when the node is a SITE (PO 2026-10-02,
// prd-molcadx#24 item 12, F-01 §9): SHIFT_INSTANCE rows of the site with
// status `open`.
import { HTTPException } from "hono/http-exception";

import { planningUnreachable } from "../../planning/planning-error.js";

import type { PlanningClientContract } from "@molca/contract-client";
import type { AreasStore } from "../areas/areas-store.js";
import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { AssetsStore } from "../assets/assets-store.js";
import type { ShiftsStore } from "../shifts/shifts-store.js";
import type { SitesStore } from "../sites/sites-store.js";
import type { WorkCentersStore } from "../work-centers/work-centers-store.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";

type DeactivatableKind = "site" | "area" | "work-center" | "work-unit";

type Blocker = {
  type: "asset_placement" | "work_order_operation" | "shift_instance";
  label: string;
};

/**
 * The part of Planning's `/job-orders/executions` this check reads: the Job Orders,
 * not the executions. A pending Job Order has no execution yet and still blocks.
 */
type PlanningJobs = {
  workOrders: Array<{ id: string; woNumber: string }>;
  jobOrders: Array<{ id: string; workOrderId: string; workUnitId: string | null; status: string }>;
};

// SIT-002 §4: a job blocks while it is waiting, scheduled, running or on hold.
const OPEN_JOB = new Set(["pending", "scheduled", "in_progress", "on_hold"]);

type DeactivationImpact = {
  kind: DeactivatableKind;
  id: string;
  name: string;
  /** Items below the node that will be deactivated with it. */
  descendantCount: number;
  blockers: Blocker[];
  /** Modules that use this item (§3 impact list). */
  modules: string[];
};

type DeactivationResult = {
  deactivatedIds: string[];
  validTo: string;
};

type HierarchyDeactivationDeps = {
  planningClient: PlanningClientContract;
  sitesStore: SitesStore;
  shiftsStore: ShiftsStore;
  areasStore: AreasStore;
  workCentersStore: WorkCentersStore;
  workUnitsStore: WorkUnitsStore;
  assetPlacementsStore: AssetPlacementsStore;
  assetsStore: AssetsStore;
};

const PAST_DATE_MESSAGE =
  "The effective date cannot be in the past — corrections to the past are handled as flagged adjustments.";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function active(row: { validTo?: string | null }): boolean {
  return row.validTo === undefined || row.validTo === null;
}

class HierarchyDeactivationService {
  private sites: SitesStore;
  private shifts: ShiftsStore;
  private areas: AreasStore;
  private workCenters: WorkCentersStore;
  private workUnits: WorkUnitsStore;
  private placements: AssetPlacementsStore;
  private assets: AssetsStore;
  private planning: PlanningClientContract;

  constructor(deps: HierarchyDeactivationDeps) {
    this.planning = deps.planningClient;
    this.sites = deps.sitesStore;
    this.shifts = deps.shiftsStore;
    this.areas = deps.areasStore;
    this.workCenters = deps.workCentersStore;
    this.workUnits = deps.workUnitsStore;
    this.placements = deps.assetPlacementsStore;
    this.assets = deps.assetsStore;
  }

  async impact(kind: DeactivatableKind, id: string): Promise<DeactivationImpact> {
    const { name, areaIds, workCenterIds, workUnitIds } = await this.subtree(kind, id);
    const descendantCount =
      (kind === "site" ? areaIds.length : 0) +
      (kind === "site" || kind === "area" ? workCenterIds.length : 0) +
      (kind === "work-unit" ? 0 : workUnitIds.length);
    const activePlacements = (await this.placements.active()).filter((p) =>
      workUnitIds.includes(p.workUnitId),
    );
    const blockers: Blocker[] = await Promise.all(
      activePlacements.map(async (p) => {
        const asset = await this.assets.get(p.assetId);
        const unit = await this.workUnits.get(p.workUnitId);
        return {
          type: "asset_placement" as const,
          label: `${asset?.assetTag ?? p.assetId} on ${unit?.code ?? p.workUnitId}`,
        };
      }),
    );
    if (workUnitIds.length > 0) {
      const jobs = await this.planningJobs();
      const woNumber = new Map(jobs.workOrders.map((w) => [w.id, w.woNumber]));
      for (const job of jobs.jobOrders) {
        if (!job.workUnitId || !workUnitIds.includes(job.workUnitId) || !OPEN_JOB.has(job.status))
          continue;
        const unit = await this.workUnits.get(job.workUnitId);
        blockers.push({
          type: "work_order_operation",
          label: `${woNumber.get(job.workOrderId) ?? job.workOrderId} on ${unit?.code ?? job.workUnitId}`,
        });
      }
    }
    // F-01 §9: open shifts block only a SITE (item 12).
    if (kind === "site") {
      for (const shift of await this.shifts.listInstances(id)) {
        if (shift.status !== "open") continue;
        blockers.push({ type: "shift_instance", label: `shift ${shift.businessDate}` });
      }
    }
    const modules = [
      "Asset Placement",
      "KPI bindings",
      "Production Planning",
      "Production Monitoring",
    ];
    return { kind, id, name, descendantCount, blockers, modules };
  }

  async deactivate(
    kind: DeactivatableKind,
    id: string,
    validTo?: string,
  ): Promise<DeactivationResult> {
    const effective = validTo ?? today();
    if (effective < today()) throw new HTTPException(422, { message: PAST_DATE_MESSAGE });
    const impact = await this.impact(kind, id);
    if (impact.blockers.length > 0) {
      const list = impact.blockers.map((b) => b.label).join(", ");
      throw new HTTPException(409, {
        message: `Can't deactivate ${impact.name}. Still in use: ${list}.`,
      });
    }
    const { areaIds, workCenterIds, workUnitIds } = await this.subtree(kind, id);
    for (const unitId of workUnitIds) await this.workUnits.update(unitId, { validTo: effective });
    for (const wcId of workCenterIds) await this.workCenters.update(wcId, { validTo: effective });
    for (const areaId of areaIds) await this.areas.update(areaId, { validTo: effective });
    const siteIds = kind === "site" ? [id] : [];
    for (const siteId of siteIds) await this.sites.update(siteId, { validTo: effective });
    return {
      deactivatedIds: [...siteIds, ...areaIds, ...workCenterIds, ...workUnitIds],
      validTo: effective,
    };
  }

  /** Jobs can't be checked → refused, never treated as "nothing running". */
  private async planningJobs(): Promise<PlanningJobs> {
    // MolcaDx MAM installs run without MES Production Planning: PLANNING_OPTIONAL=true reads "no open jobs"
    // instead of refusing, since no job order can sit on a work unit there.
    if (process.env.PLANNING_OPTIONAL === "true") {
      const optional = await this.planning.executions().catch(() => null);
      if (!optional) return { workOrders: [], jobOrders: [] };
      return this.toJobs(optional);
    }
    const payload = await this.planning.executions().catch((err: unknown) => {
      throw planningUnreachable(err);
    });
    return this.toJobs(payload);
  }

  private toJobs(payload: Awaited<ReturnType<typeof this.planning.executions>>): PlanningJobs {
    return {
      workOrders: payload.workOrders.map(({ id, woNumber }) => ({ id, woNumber })),
      jobOrders: payload.jobOrders.map(({ id, workOrderId, workUnitId, status }) => ({
        id,
        workOrderId,
        workUnitId,
        status,
      })),
    };
  }

  /** The node plus its active descendants, by level. */
  private async subtree(kind: DeactivatableKind, id: string) {
    let areaIds: string[] = [];
    let workCenterIds: string[] = [];
    let workUnitIds: string[] = [];
    let name: string;
    if (kind === "site") {
      const site = await this.sites.get(id);
      if (!site) throw new HTTPException(404, { message: "sites not found" });
      if (!active(site))
        throw new HTTPException(422, { message: `${site.name} is already inactive.` });
      name = site.name;
      areaIds = (await this.areas.all())
        .filter((a) => a.siteId === id && active(a))
        .map((a) => a.id);
      workCenterIds = (await this.workCenters.all())
        .filter((wc) => areaIds.includes(wc.areaId) && active(wc))
        .map((wc) => wc.id);
    } else if (kind === "area") {
      const area = await this.areas.get(id);
      if (!area) throw new HTTPException(404, { message: "areas not found" });
      if (!active(area))
        throw new HTTPException(422, { message: `${area.name} is already inactive.` });
      name = area.name;
      areaIds.push(id);
      workCenterIds = (await this.workCenters.all())
        .filter((wc) => wc.areaId === id && active(wc))
        .map((wc) => wc.id);
    } else if (kind === "work-center") {
      const wc = await this.workCenters.get(id);
      if (!wc) throw new HTTPException(404, { message: "work-centers not found" });
      if (!active(wc)) throw new HTTPException(422, { message: `${wc.name} is already inactive.` });
      name = wc.name;
      workCenterIds = [id];
    } else {
      const unit = await this.workUnits.get(id);
      if (!unit) throw new HTTPException(404, { message: "work-units not found" });
      if (!active(unit))
        throw new HTTPException(422, { message: `${unit.name} is already inactive.` });
      name = unit.name;
      workUnitIds = [id];
    }
    if (kind !== "work-unit") {
      workUnitIds = (await this.workUnits.all())
        .filter((u) => workCenterIds.includes(u.workCenterId) && active(u))
        .map((u) => u.id);
    }
    return { name, areaIds, workCenterIds, workUnitIds };
  }
}

export { HierarchyDeactivationService, PAST_DATE_MESSAGE };
export type {
  DeactivatableKind,
  DeactivationImpact,
  DeactivationResult,
  HierarchyDeactivationDeps,
};
