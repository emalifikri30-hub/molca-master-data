import { describe, it, expect, beforeEach } from "vite-plus/test";
import { AreasStore } from "../areas/areas-store.js";
import { SitesStore } from "../sites/sites-store.js";
import { WorkCentersStore } from "../work-centers/work-centers-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { HTTPException } from "hono/http-exception";

import { AssetPlacementsService } from "./asset-placements-service.js";
import { AssetPlacementsStore } from "./asset-placements-store.js";
import { AssetsStore } from "../assets/assets-store.js";

import type { CreateAssets } from "../assets/assets.js";

function assetInput(overrides: Partial<CreateAssets> = {}): CreateAssets {
  return {
    assetTag: "IM-99",
    assetName: "",
    assetTypeId: "",
    serialNumber: "",
    parentAssetId: "",
    componentLevel: "equipment_unit",
    lifecycleStatus: "operational",
    commissioningDate: "",
    attributes: {},
    ...overrides,
  };
}

async function statusOf(fn: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return err.status;
    throw err;
  }
  return undefined;
}

async function messageOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Error) return err.message;
  }
  return "";
}

describe("AssetPlacementsService", () => {
  let placements: AssetPlacementsStore;
  let assets: AssetsStore;
  let service: AssetPlacementsService;

  beforeEach(() => {
    placements = new AssetPlacementsStore();
    assets = new AssetsStore();
    service = new AssetPlacementsService({
      assetPlacementsStore: placements,
      assetsStore: assets,
      workUnitsStore: new WorkUnitsStore(),
      workCentersStore: new WorkCentersStore(),
      areasStore: new AreasStore(),
      sitesStore: new SitesStore(),
    });
  });

  it("AC-1: moving a machine closes its previous active row at the new validFrom", async () => {
    // Seed: asset-1 (IM-03) is primary on wu-1 from 2026-01-01.
    const moved = await service.create({
      assetId: "asset-1",
      workUnitId: "wu-7",
      placementRole: "primary",
      validFrom: "2026-07-01",
      mode: "move",
    });
    expect(moved.validTo).toBeNull();
    const old = await placements.get("ap-1");
    expect(old?.validTo).toBe("2026-07-01");
    expect((await placements.byAsset("asset-1")).filter((r) => r.validTo === null)).toHaveLength(1);
  });

  it("AC-7: a machine active elsewhere needs a move-or-add-lane choice", async () => {
    const fn = () =>
      service.create({
        assetId: "asset-1",
        workUnitId: "wu-3",
        placementRole: "secondary",
        validFrom: "2026-07-01",
      });
    expect(await statusOf(fn)).toBe(409);
    expect(await messageOf(fn)).toBe("LANE_CHOICE:wu-1");
    expect((await placements.get("ap-1"))?.validTo).toBeNull();
  });

  it("AC-7: add a lane keeps the old row, so the machine has two active placements", async () => {
    await service.create({
      assetId: "asset-1",
      workUnitId: "wu-3",
      placementRole: "secondary",
      validFrom: "2026-07-01",
      mode: "add_lane",
    });
    expect((await placements.get("ap-1"))?.validTo).toBeNull();
    expect((await placements.byAsset("asset-1")).filter((r) => r.validTo === null)).toHaveLength(2);
  });

  it("AC-8: a lane in another site is refused, naming the site", async () => {
    const fn = () =>
      service.create({
        assetId: "asset-1",
        workUnitId: "wu-7",
        placementRole: "secondary",
        validFrom: "2026-07-01",
        mode: "add_lane",
      });
    expect(await statusOf(fn)).toBe(422);
    expect(await messageOf(fn)).toBe(
      "WU_07 is in Karawang Plant. All lanes of a machine must be in one site.",
    );
  });

  it("AC-4: rejects a date colliding with the same machine's placement, naming the range", async () => {
    const fn = () =>
      service.create({
        assetId: "asset-1",
        workUnitId: "wu-7",
        placementRole: "primary",
        validFrom: "2025-12-01",
      });
    expect(await statusOf(fn)).toBe(409);
    expect(await messageOf(fn)).toContain("2026-01-01 → open");
    expect((await placements.get("ap-1"))?.validTo).toBeNull();
  });

  it("AC-4: rejects a date inside a closed historical range of the same machine", async () => {
    await service.close("ap-1", { validTo: "2026-06-30" });
    const fn = () =>
      service.create({
        assetId: "asset-1",
        workUnitId: "wu-7",
        placementRole: "secondary",
        validFrom: "2026-03-01",
      });
    expect(await statusOf(fn)).toBe(409);
    expect(await messageOf(fn)).toContain("2026-01-01 → 2026-06-30");
  });

  it("rule 5: rejects a decommissioned machine", async () => {
    const retired = await assets.create(
      assetInput({ assetTag: "OLD-1", lifecycleStatus: "decommissioned" }),
      "2026-01-01",
      "2026-02-01",
    );
    const fn = () =>
      service.create({
        assetId: retired.id,
        workUnitId: "wu-2",
        placementRole: "primary",
        validFrom: "2026-03-01",
      });
    expect(await statusOf(fn)).toBe(422);
    expect(await messageOf(fn)).toContain("decommissioned");
  });

  it("F-04 §9.4: rejects a machine that isn't operational, naming its status", async () => {
    for (const status of ["planned", "installed", "under_maintenance", "idle"] as const) {
      const machine = await assets.create(
        assetInput({ assetTag: `M-${status}`, lifecycleStatus: status }),
        "2026-01-01",
        null,
      );
      const fn = () =>
        service.create({
          assetId: machine.id,
          workUnitId: "wu-2",
          placementRole: "secondary",
          validFrom: "2026-03-01",
        });
      expect(await statusOf(fn)).toBe(422);
      expect(await messageOf(fn)).toBe(
        `M-${status} is ${status} — only an operational machine can be placed.`,
      );
      expect(await placements.byAsset(machine.id)).toEqual([]);
    }
  });

  it("rules 1 & 6: rejects a component (asset with a parent)", async () => {
    const fn = () =>
      service.create({
        assetId: "asset-2",
        workUnitId: "wu-2",
        placementRole: "secondary",
        validFrom: "2026-03-01",
      });
    expect(await statusOf(fn)).toBe(422);
  });

  it("SIT-002 rule 4: refuses a placement on a work unit inactive on the date, names its end", async () => {
    const units = new WorkUnitsStore();
    await units.update("wu-2", { validTo: "2026-02-01" });
    const local = new AssetPlacementsService({
      assetPlacementsStore: placements,
      assetsStore: assets,
      workUnitsStore: units,
      workCentersStore: new WorkCentersStore(),
      areasStore: new AreasStore(),
      sitesStore: new SitesStore(),
    });
    const machine = await assets.create(assetInput(), "2026-01-01", null);
    const onto = (validFrom: string) =>
      local.create({
        assetId: machine.id,
        workUnitId: "wu-2",
        placementRole: "primary",
        validFrom,
      });
    expect(await statusOf(() => onto("2026-03-01"))).toBe(422);
    expect(await messageOf(() => onto("2026-03-01"))).toBe(
      "WU_02 is inactive since 2026-02-01 — pick an active work unit.",
    );
    // validTo is exclusive: the work unit still takes a placement dated before it ends.
    await expect(onto("2026-01-15")).resolves.toMatchObject({ workUnitId: "wu-2" });
  });

  it("SIT-002 rule 4: a placement onto an unknown work unit is a 404", async () => {
    const machine = await assets.create(assetInput(), "2026-01-01", null);
    expect(
      await statusOf(() =>
        service.create({
          assetId: machine.id,
          workUnitId: "wu-missing",
          placementRole: "primary",
          validFrom: "2026-03-01",
        }),
      ),
    ).toBe(404);
  });

  it("AC-3: a second primary is rejected with the incumbent; AC-3b: secondary succeeds", async () => {
    const machine = await assets.create(assetInput(), "2026-01-01", null);
    const fn = () =>
      service.create({
        assetId: machine.id,
        workUnitId: "wu-1",
        placementRole: "primary",
        validFrom: "2026-03-01",
      });
    expect(await messageOf(fn)).toBe("CONFLICT:asset-1");
    const secondary = await service.create({
      assetId: machine.id,
      workUnitId: "wu-1",
      placementRole: "secondary",
      validFrom: "2026-03-01",
    });
    expect(secondary.placementRole).toBe("secondary");
    expect((await placements.get("ap-1"))?.validTo).toBeNull();
  });

  it("swap closes the incumbent primary at the new validFrom", async () => {
    const machine = await assets.create(assetInput(), "2026-01-01", null);
    await service.create({
      assetId: machine.id,
      workUnitId: "wu-1",
      placementRole: "primary",
      validFrom: "2026-03-01",
      replace: true,
    });
    expect((await placements.get("ap-1"))?.validTo).toBe("2026-03-01");
  });

  it("AC-5: close unplaces without a destination and keeps the row", async () => {
    const closed = await service.close("ap-1", { validTo: "2026-05-01" });
    expect(closed.validTo).toBe("2026-05-01");
    expect(await placements.get("ap-1")).toBeDefined();
    expect(await placements.activePrimary("wu-1")).toBeUndefined();
  });

  it("close rejects an already-closed row and an end date not after the start", async () => {
    expect(await statusOf(() => service.close("ap-1", { validTo: "2026-01-01" }))).toBe(422);
    await service.close("ap-1", { validTo: "2026-05-01" });
    expect(await statusOf(() => service.close("ap-1", { validTo: "2026-06-01" }))).toBe(422);
  });
  it("AST-003 AC-10: placing a machine whose floor tag cleans like a neighbour's is refused", async () => {
    const first = await assets.create(assetInput({ assetTag: "MITSUM-1" }), "2026-01-01", null);
    const second = await assets.create(assetInput({ assetTag: "MITSUM 1" }), "2026-01-01", null);
    await service.create({
      assetId: first.id,
      workUnitId: "wu-7",
      placementRole: "secondary",
      validFrom: "2026-07-01",
    });
    const fn = () =>
      service.create({
        assetId: second.id,
        workUnitId: "wu-7",
        placementRole: "secondary",
        validFrom: "2026-07-01",
      });
    expect(await messageOf(fn)).toBe(
      "MITSUM-1 and MITSUM 1 both become MITSUM_1 in the tag address. Change one of them.",
    );
  });

  it("AST-002 AC-11: renaming a floor tag to clean like a neighbour's is refused", async () => {
    const { AssetsService } = await import("../assets/assets-service.js");
    const assetsService = new AssetsService({
      assetsStore: assets,
      assetPlacementsStore: placements,
    });
    const first = await assets.create(assetInput({ assetTag: "MITSUM-1" }), "2026-01-01", null);
    const second = await assets.create(assetInput({ assetTag: "MITSUM2" }), "2026-01-01", null);
    for (const a of [first, second]) {
      await service.create({
        assetId: a.id,
        workUnitId: "wu-7",
        placementRole: "secondary",
        validFrom: "2026-07-01",
      });
    }
    expect(await messageOf(() => assetsService.update(second.id, { assetTag: "MITSUM 1" }))).toBe(
      "MITSUM-1 and MITSUM 1 both become MITSUM_1 in the tag address. Change one of them.",
    );
    // A floor tag with a space or dash is accepted as typed (A-13).
    expect((await assetsService.update(second.id, { assetTag: "ANRITSU 57-1" })).assetTag).toBe(
      "ANRITSU 57-1",
    );
  });
});
