import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { ShiftsStore } from "../shifts/shifts-store.js";
import { SitesStore } from "../sites/sites-store.js";
import { AreasStore } from "../areas/areas-store.js";
import { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import { AssetsStore } from "../assets/assets-store.js";
import { WorkCentersStore } from "../work-centers/work-centers-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { PlanningClient } from "../../planning/planning-client.js";
import { HierarchyDeactivationService, PAST_DATE_MESSAGE } from "./hierarchy-deactivation.js";

async function caught(fn: () => Promise<unknown>): Promise<HTTPException | undefined> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return err;
    throw err;
  }
  return undefined;
}

type Op = { id: string; workOrderId: string; workUnitId: string | null; status: string };

/** Planning's `/job-orders/executions`, stubbed. Job Order rows carry every field the contract requires. */
function planningReturns(jobOrders: Op[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          workOrders: [
            {
              id: "wo-1",
              woNumber: "WO-0001",
              productId: "prod-1",
              siteId: "site-1",
              status: "released",
            },
          ],
          jobOrders: jobOrders.map((j) => ({
            operationId: "step-10",
            plannedQty: null,
            ...j,
          })),
          executions: [],
        },
        error: null,
      }),
    ),
  );
}

describe("hierarchy deactivation (PRD-003 SIT-002)", () => {
  let sites: SitesStore;
  let shifts: ShiftsStore;
  let areas: AreasStore;
  let workCenters: WorkCentersStore;
  let workUnits: WorkUnitsStore;
  let placements: AssetPlacementsStore;
  let service: HierarchyDeactivationService;

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    planningReturns([]);
    areas = new AreasStore();
    workCenters = new WorkCentersStore();
    workUnits = new WorkUnitsStore();
    placements = new AssetPlacementsStore();
    sites = new SitesStore();
    shifts = new ShiftsStore();
    service = new HierarchyDeactivationService({
      planningClient: new PlanningClient({
        planningBaseUrl: "http://planning.test",
        planningTimeoutMs: 5_000,
      }),
      sitesStore: sites,
      shiftsStore: shifts,
      areasStore: areas,
      workCentersStore: workCenters,
      workUnitsStore: workUnits,
      assetPlacementsStore: placements,
      assetsStore: new AssetsStore(),
    });
  });

  async function freshLine() {
    const area = await areas.create({ code: "NEW", name: "New Area", siteId: "site-1" });
    const line = await workCenters.create({
      code: "L99",
      name: "Line 99",
      areaId: area.id,
      type: "production_line",
    });
    const s1 = await workUnits.create({ code: "S01", name: "Station 1", workCenterId: line.id });
    const s2 = await workUnits.create({ code: "S02", name: "Station 2", workCenterId: line.id });
    return { area, line, s1, s2 };
  }

  it("deactivates a line and all its stations as of today (AC-1)", async () => {
    const { line, s1, s2 } = await freshLine();
    expect(await service.impact("work-center", line.id)).toMatchObject({
      descendantCount: 2,
      blockers: [],
    });
    const result = await service.deactivate("work-center", line.id);
    expect(result.deactivatedIds.toSorted()).toEqual([line.id, s1.id, s2.id].toSorted());
    expect((await workUnits.get(s1.id))?.validTo).toBe(result.validTo);
  });

  it("cascades from an area to its lines and stations (rule 3)", async () => {
    const { area } = await freshLine();
    expect((await service.impact("area", area.id)).descendantCount).toBe(3);
    expect((await service.deactivate("area", area.id)).deactivatedIds).toHaveLength(4);
  });

  it("refuses while a machine is still placed, naming it (AC-2, rule 5)", async () => {
    const { line, s1 } = await freshLine();
    await placements.create({
      assetId: "asset-1",
      workUnitId: s1.id,
      placementRole: "primary",
      validFrom: "2026-01-01",
    });
    const err = await caught(() => service.deactivate("work-center", line.id));
    expect(err?.status).toBe(409);
    expect(err?.message).toMatch(/^Can't deactivate Line 99\. Still in use: .+ on S01\.$/);
    expect((await workCenters.get(line.id))?.validTo ?? null).toBeNull();
  });

  it("refuses an effective date in the past (AC-3)", async () => {
    const { s1 } = await freshLine();
    const err = await caught(() => service.deactivate("work-unit", s1.id, "2000-01-01"));
    expect(err?.status).toBe(422);
    expect(err?.message).toBe(PAST_DATE_MESSAGE);
  });

  it("refuses while a job is running on a station, naming the work order (AC-2)", async () => {
    const { line, s1, s2 } = await freshLine();
    planningReturns([
      { id: "op-1", workOrderId: "wo-1", workUnitId: s1.id, status: "in_progress" },
      { id: "op-2", workOrderId: "wo-1", workUnitId: s2.id, status: "completed" },
    ]);
    const impact = await service.impact("work-center", line.id);
    expect(impact.blockers).toEqual([{ type: "work_order_operation", label: "WO-0001 on S01" }]);
    const err = await caught(() => service.deactivate("work-center", line.id));
    expect(err?.status).toBe(409);
    expect(err?.message).toBe("Can't deactivate Line 99. Still in use: WO-0001 on S01.");
  });

  it("counts waiting, scheduled and on-hold jobs, not finished ones (§4)", async () => {
    const { line, s1 } = await freshLine();
    const ops = ["pending", "scheduled", "on_hold", "completed", "cancelled"].map((status, i) => ({
      id: `op-${i}`,
      workOrderId: "wo-1",
      workUnitId: s1.id,
      status,
    }));
    planningReturns(ops);
    expect((await service.impact("work-center", line.id)).blockers).toHaveLength(3);
  });

  it("refuses rather than deactivating when Planning can't be reached", async () => {
    const { line } = await freshLine();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const err = await caught(() => service.deactivate("work-center", line.id));
    expect(err?.status).toBe(503);
    expect(err?.message).toContain("planning_unreachable");
    expect((await workCenters.get(line.id))?.validTo ?? null).toBeNull();
  });

  it("a site cascades to its areas, work centers and work units (SIT-002, item 12)", async () => {
    const site = (await sites.paginate({ limit: 1, offset: 0 })).items[0];
    const impact = await service.impact("site", site.id);
    expect(impact.kind).toBe("site");
    expect(impact.blockers.filter((b) => b.type === "shift_instance")).toEqual([]);
  });

  it("an open shift blocks a site, never an area (F-01 §9, item 12)", async () => {
    const site = (await sites.paginate({ limit: 1, offset: 0 })).items[0];
    await shifts.insertInstance({
      id: "si-x",
      siteShiftId: "ss-x",
      siteId: site.id,
      enterpriseShiftId: "es-x",
      businessDate: "2026-10-03",
      startDatetime: "2026-10-03T00:00:00Z",
      endDatetime: "2026-10-03T08:00:00Z",
      status: "open",
    });
    const impact = await service.impact("site", site.id);
    expect(impact.blockers).toContainEqual({ type: "shift_instance", label: "shift 2026-10-03" });
    await expect(service.deactivate("site", site.id)).rejects.toMatchObject({ status: 409 });
    const area = (await areas.all()).find((a) => a.siteId === site.id);
    if (area) {
      const areaImpact = await service.impact("area", area.id);
      expect(areaImpact.blockers.some((b) => b.type === "shift_instance")).toBe(false);
    }
  });
});
