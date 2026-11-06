import { describe, it, expect, beforeEach } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AssetsService } from "./assets-service.js";
import { AssetsStore } from "./assets-store.js";

import type { CreateAssets } from "./assets.js";

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

async function messageOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return err.message;
    throw err;
  }
  throw new Error("expected a refusal");
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

describe("AssetsService — AST-002 component depth", () => {
  let service: AssetsService;
  beforeEach(() => {
    service = new AssetsService({ assetsStore: new AssetsStore() });
  });

  // Seed: asset-1 Equipment unit (IM-03) → asset-2 Subunit (IM-03-HYD) → asset-3 Part (IM-03-HYD-PUMP)

  it("refuses a top-level Part", async () => {
    expect(
      await messageOf(() =>
        service.create(assetInput({ assetTag: "PUMP-9", componentLevel: "part" })),
      ),
    ).toBe("PUMP-9 is a Part — only an Equipment unit can stand on its own. Pick its parent.");
  });

  it("refuses a top-level Subunit and Maintainable item", async () => {
    expect(await statusOf(() => service.create(assetInput({ componentLevel: "subunit" })))).toBe(
      422,
    );
    expect(
      await statusOf(() => service.create(assetInput({ componentLevel: "maintainable_item" }))),
    ).toBe(422);
  });

  it("refuses an Equipment unit under a Subunit", async () => {
    expect(
      await messageOf(() =>
        service.create(assetInput({ assetTag: "EU-1", parentAssetId: "asset-2" })),
      ),
    ).toBe(
      "EU-1 is an Equipment unit — it can't sit under IM-03-HYD, a Subunit. Layers run Equipment unit → Subunit → Maintainable item → Part.",
    );
  });

  it("refuses a Subunit under a Subunit (blocks the depth-6 chain)", async () => {
    expect(
      await messageOf(() =>
        service.create(
          assetInput({ assetTag: "SU-2", componentLevel: "subunit", parentAssetId: "asset-2" }),
        ),
      ),
    ).toBe(
      "SU-2 is a Subunit — it can't sit under IM-03-HYD, a Subunit. Layers run Equipment unit → Subunit → Maintainable item → Part.",
    );
  });

  it("accepts a Subunit under an Equipment unit", async () => {
    const su = await service.create(
      assetInput({ assetTag: "SU-1", componentLevel: "subunit", parentAssetId: "asset-1" }),
    );
    expect(su).toMatchObject({ parentAssetId: "asset-1", componentLevel: "subunit" });
  });

  it("accepts a Maintainable item under a Subunit, then a Part under it (full 4-layer chain)", async () => {
    const su = await service.create(
      assetInput({ assetTag: "SU-1", componentLevel: "subunit", parentAssetId: "asset-1" }),
    );
    const mi = await service.create(
      assetInput({ assetTag: "MI-1", componentLevel: "maintainable_item", parentAssetId: su.id }),
    );
    const part = await service.create(
      assetInput({ assetTag: "PT-1", componentLevel: "part", parentAssetId: mi.id }),
    );
    expect(part).toMatchObject({ parentAssetId: mi.id, componentLevel: "part" });
  });

  it("accepts a Part under a Subunit", async () => {
    const part = await service.create(
      assetInput({ assetTag: "PT-2", componentLevel: "part", parentAssetId: "asset-2" }),
    );
    expect(part).toMatchObject({ parentAssetId: "asset-2", componentLevel: "part" });
  });

  it("refuses any child under a Part (existing message)", async () => {
    expect(
      await messageOf(() =>
        service.create(
          assetInput({ assetTag: "PT-3", componentLevel: "part", parentAssetId: "asset-3" }),
        ),
      ),
    ).toBe("IM-03-HYD-PUMP is a Part — the last ISO 14224 layer. Nothing can nest under it.");
  });

  it("refuses an update that moves an Equipment unit under a Subunit", async () => {
    expect(await statusOf(() => service.update("asset-4", { parentAssetId: "asset-2" }))).toBe(422);
  });

  it("refuses a level change that would leave a component above its parent's new level", async () => {
    const su = await service.create(
      assetInput({ assetTag: "SU-1", componentLevel: "subunit", parentAssetId: "asset-1" }),
    );
    await service.create(
      assetInput({ assetTag: "MI-1", componentLevel: "maintainable_item", parentAssetId: su.id }),
    );
    expect(await messageOf(() => service.update(su.id, { componentLevel: "part" }))).toBe(
      "SU-1 has components at Maintainable item level — it must stay above them.",
    );
  });

  it("refuses a level change that makes an asset without a parent non-Equipment unit", async () => {
    expect(await messageOf(() => service.update("asset-4", { componentLevel: "subunit" }))).toBe(
      "COMP-01 is a Subunit — only an Equipment unit can stand on its own. Pick its parent.",
    );
  });
});
