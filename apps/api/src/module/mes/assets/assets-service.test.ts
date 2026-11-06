import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import { AssetsService } from "./assets-service.js";
import { AssetsStore } from "./assets-store.js";

import type { CreateAssets } from "./assets.js";
import type { CreateAssetTags } from "../asset-tags/asset-tags.js";

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

const floorTag: CreateAssetTags = {
  assetId: "",
  dataSourceId: "ds-1",
  tagName: "Seq_Count",
  node: "PLC1.DB10.DBW8",
  kind: "cumulative_counter",
  tagRole: "total",
  rejectReasonId: "",
  downtimeReasonId: "",
  uomId: "pcs",
  countBasis: "unit",
  validFrom: "2026-01-01",
};

/** The REFUSAL body of a refused call (apps/api/src/shared/errors/refusal.ts). */
async function refusalOf(
  fn: () => Promise<unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) {
      return {
        status: err.status,
        body: JSON.parse(err.message.slice("REFUSAL:".length)) as Record<string, unknown>,
      };
    }
    throw err;
  }
  throw new Error("expected a refusal");
}

function onDay(day: string): void {
  vi.setSystemTime(new Date(`${day}T09:00:00Z`));
}

describe("AssetsService floor tag (US-FND-AST-002)", () => {
  let assets: AssetsStore;
  let tags: AssetTagsStore;
  let placements: AssetPlacementsStore;
  let service: AssetsService;

  beforeEach(() => {
    // Only Date is faked, so the store and the service keep their real async timing.
    vi.useFakeTimers({ toFake: ["Date"] });
    onDay("2026-10-22");
    assets = new AssetsStore();
    tags = new AssetTagsStore();
    placements = new AssetPlacementsStore();
    service = new AssetsService({
      assetsStore: assets,
      assetTagsStore: tags,
      assetPlacementsStore: placements,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC-2: a tag held by an active placed machine refuses a new machine with 409 asset_tag_taken", async () => {
    const holder = await assets.create(assetInput({ assetTag: "IM-003" }), "2026-01-01", null);
    await placements.create({
      assetId: holder.id,
      workUnitId: "JKT1",
      placementRole: "primary",
      validFrom: "2026-01-01",
    });

    const refusal = await refusalOf(() => service.create(assetInput({ assetTag: "IM-003" })));

    expect(refusal.status).toBe(409);
    expect(refusal.body).toMatchObject({
      code: "asset_tag_taken",
      holderTag: "IM-003",
      holderAssetId: holder.id,
      holderName: "IM-003",
    });
  });

  it("AST-002 rule 1: editing a machine onto a tag another active machine holds is refused", async () => {
    await assets.create(assetInput({ assetTag: "IM-003" }), "2026-01-01", null);
    const other = await assets.create(assetInput({ assetTag: "IM-004" }), "2026-01-01", null);

    const refusal = await refusalOf(() => service.update(other.id, { assetTag: "im-003" }));

    expect(refusal.status).toBe(409);
    expect(refusal.body.code).toBe("asset_tag_taken");
  });

  it("AC-14: a tag whose holder was deactivated on 2026-10-01 can be registered on 2026-10-02", async () => {
    const holder = await assets.create(assetInput({ assetTag: "IM-003" }), "2026-01-01", null);
    onDay("2026-10-01");
    await service.update(holder.id, { lifecycleStatus: "decommissioned" });

    onDay("2026-10-02");
    const replacement = await service.create(assetInput({ assetTag: "IM-003" }));

    expect(replacement.assetTag).toBe("IM-003");
    expect(replacement.id).not.toBe(holder.id);
  });

  it("AC-15: a decommissioned machine with valid_to empty still holds its tag (case and spaces ignored)", async () => {
    await assets.create(
      assetInput({ assetTag: "IM-003", lifecycleStatus: "decommissioned" }),
      "2026-01-01",
      null,
    );

    const refusal = await refusalOf(() => service.create(assetInput({ assetTag: " im-003 " })));

    expect(refusal.status).toBe(409);
    expect(refusal.body.code).toBe("asset_tag_taken");
    expect(refusal.body.holderTag).toBe("IM-003");
  });

  it("AC-16: deactivating ends the machine's open tags with the same date and keeps ended ones", async () => {
    const machine = await assets.create(assetInput({ assetTag: "IM-005" }), "2026-01-01", null);
    for (let i = 0; i < 6; i += 1) {
      await tags.create({ ...floorTag, assetId: machine.id, tagName: `Count_${i}` });
    }
    const old = await tags.create({ ...floorTag, assetId: machine.id, tagName: "Old_Count" });
    await tags.deactivate(old.id, "2026-09-01");

    onDay("2026-10-01");
    await service.update(machine.id, { lifecycleStatus: "decommissioned" });

    const { items } = await tags.paginate({ limit: 100, offset: 0, assetId: machine.id });
    const open = items.filter((t) => t.id !== old.id);
    expect(open).toHaveLength(6);
    expect(open.every((t) => t.validTo === "2026-10-01")).toBe(true);
    expect((await tags.get(old.id))?.validTo).toBe("2026-09-01");
  });

  it("AST-002 rule 1: placement and other edits never re-check the floor tag", async () => {
    const machine = await assets.create(assetInput({ assetTag: "IM-006" }), "2026-01-01", null);
    await placements.create({
      assetId: machine.id,
      workUnitId: "JKT1",
      placementRole: "primary",
      validFrom: "2026-01-01",
    });
    const check = vi.spyOn(assets, "findActiveByAssetTag");

    await service.update(machine.id, { assetName: "Packer 6" });
    await service.update(machine.id, { assetTag: "IM-006" });

    expect(check).not.toHaveBeenCalled();
  });
});
