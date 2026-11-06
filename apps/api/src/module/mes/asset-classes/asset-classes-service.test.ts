import { describe, it, expect, beforeEach } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AssetClassesService } from "./asset-classes-service.js";
import { AssetClassesStore } from "./asset-classes-store.js";
import { AssetTypesService } from "../asset-types/asset-types-service.js";
import { AssetTypesStore } from "../asset-types/asset-types-store.js";
import { AssetsStore } from "../assets/assets-store.js";
import { AssetsService } from "../assets/assets-service.js";

async function caught(fn: () => unknown): Promise<HTTPException> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return err;
    throw err;
  }
  throw new Error("expected an HTTPException");
}

describe("asset taxonomy services", () => {
  let classesStore: AssetClassesStore;
  let typesStore: AssetTypesStore;
  let assetsStore: AssetsStore;
  let classes: AssetClassesService;
  let types: AssetTypesService;
  let assets: AssetsService;

  beforeEach(() => {
    classesStore = new AssetClassesStore();
    typesStore = new AssetTypesStore();
    assetsStore = new AssetsStore();
    classes = new AssetClassesService({
      assetClassesStore: classesStore,
      assetTypesStore: typesStore,
    });
    types = new AssetTypesService({ assetTypesStore: typesStore, assetsStore });
    assets = new AssetsService({ assetsStore });
  });

  it("AC-1: class → sub-class → type saves with parent relations and an open validity", async () => {
    const sub = await classes.create({
      code: "IM",
      name: "Injection Molding",
      parentClassId: "class-1",
    });
    const type = await types.create({
      assetClassId: sub.id,
      code: "IM250X",
      name: "IM 250T brand X",
      manufacturer: "X",
      model: "250",
      attributes: { tonnage: "250" },
    });
    expect(sub.parentClassId).toBe("class-1");
    expect(sub.validTo).toBeNull();
    expect(type.assetClassId).toBe(sub.id);
  });

  it("AC-2: a duplicate type code is rejected (409) naming the holder", async () => {
    const err = await caught(() =>
      types.create({
        assetClassId: "class-1",
        code: "IM-250T",
        name: "Other",
        manufacturer: "",
        model: "",
        attributes: {},
      }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toContain("Injection Molding 250T");
  });

  // docs-molcadx#142: a case or space variant of an existing code is a duplicate.
  it("refuses a class code that differs only by case, naming the holder (docs-molcadx#142)", async () => {
    const err = await caught(() =>
      classes.create({ code: " utility ", name: "U2", parentClassId: "" }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toContain("Utility");
  });

  it("refuses a type code that differs only by case, naming the holder (docs-molcadx#142)", async () => {
    const err = await caught(() =>
      types.create({
        assetClassId: "class-1",
        code: "im-250t",
        name: "Other",
        manufacturer: "",
        model: "",
        attributes: {},
      }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toContain("Injection Molding 250T");
  });

  it("allows a class to keep its own code with different case, saved as typed (docs-molcadx#142)", async () => {
    const updated = await classes.update("class-1", { code: "prod-machine" });
    expect(updated.code).toBe("prod-machine");
  });

  it("a duplicate class code is rejected (409) naming the holder, also on update", async () => {
    expect(
      (await caught(() => classes.create({ code: "UTILITY", name: "U2", parentClassId: "" })))
        .status,
    ).toBe(409);
    const err = await caught(() => classes.update("class-1", { code: "UTILITY" }));
    expect(err.status).toBe(409);
    expect(err.message).toContain("Utility");
    // Keeping its own code is not a conflict.
    expect((await classes.update("class-1", { code: "PROD-MACHINE" })).code).toBe("PROD-MACHINE");
  });

  it("AC-4: deactivating a class with 2 active types is rejected naming both", async () => {
    await types.create({
      assetClassId: "class-1",
      code: "IM-350T",
      name: "Injection Molding 350T",
      manufacturer: "",
      model: "",
      attributes: {},
    });
    const err = await caught(() => classes.deactivate("class-1", {}));
    expect(err.status).toBe(409);
    expect(err.message).toContain("Injection Molding 250T");
    expect(err.message).toContain("Injection Molding 350T");
    expect((await classesStore.get("class-1"))?.validTo).toBeNull();
  });

  it("a class with an active sub-class can't be deactivated before it", async () => {
    await classes.create({ code: "SUB", name: "Sub", parentClassId: "class-2" });
    await typesStore.update("type-2", { validTo: "2026-02-01" });
    const err = await caught(() => classes.deactivate("class-2", {}));
    expect(err.message).toContain("Sub");
  });

  it("deactivating a type used by active machines is rejected naming them", async () => {
    const err = await caught(() => types.deactivate("type-1", {}));
    expect(err.status).toBe(409);
    expect(err.message).toContain("IM-03");
  });

  it("deactivation sets validTo and never removes the row", async () => {
    await assets.update("asset-4", { lifecycleStatus: "decommissioned" });
    const type = await types.deactivate("type-2", { validTo: "2026-09-01" });
    expect(type.validTo).toBe("2026-09-01");
    const cls = await classes.deactivate("class-2", { validTo: "2026-09-02" });
    expect(cls.validTo).toBe("2026-09-02");
    expect(await classesStore.get("class-2")).toBeDefined();
  });

  it("asset decommission sets lifecycle status and validTo", async () => {
    const row = await assets.update("asset-4", { lifecycleStatus: "decommissioned" });
    expect(row.lifecycleStatus).toBe("decommissioned");
    expect(row.validTo).not.toBeNull();
  });

  it("AC-4 (asset): a part-level asset can't be a parent", async () => {
    const err = await caught(() =>
      assets.create({
        assetTag: "X-1",
        assetName: "",
        assetTypeId: "",
        serialNumber: "",
        parentAssetId: "asset-3",
        componentLevel: "part",
        lifecycleStatus: "operational",
        commissioningDate: "",
        attributes: {},
      }),
    );
    expect(err.status).toBe(422);
    expect(err.message).toContain("last ISO 14224 layer");
  });

  // PRD-003 AST-001 rule 1 / AC-8 (PO 2026-10-21): a deactivated type frees its code; codes are per tenant.
  it("AST-001 AC-8: a type deactivated on 2026-10-01 frees IM250X for a new type on 2026-10-02", async () => {
    const sub = await classes.create({
      code: "IM",
      name: "Injection Molding",
      parentClassId: "class-1",
    });
    const old = await types.create({
      assetClassId: sub.id,
      code: "IM250X",
      name: "IM 250T brand X",
      manufacturer: "X",
      model: "M",
      attributes: {},
    });
    await typesStore.update(old.id, { validTo: "2026-10-01" });
    const saved = await types.create({
      assetClassId: sub.id,
      code: "IM250X",
      name: "IM 250T brand Y",
      manufacturer: "X",
      model: "M",
      attributes: {},
    });
    expect(saved.code).toBe("IM250X");
    expect(saved.id).not.toBe(old.id);
  });

  it("AST-001 AC-8: an active type still refuses the same code", async () => {
    const sub = await classes.create({
      code: "IM",
      name: "Injection Molding",
      parentClassId: "class-1",
    });
    await types.create({
      assetClassId: sub.id,
      code: "IM250X",
      name: "IM 250T brand X",
      manufacturer: "X",
      model: "M",
      attributes: {},
    });
    const err = await caught(() =>
      types.create({
        assetClassId: sub.id,
        code: "IM250X",
        name: "Again",
        manufacturer: "X",
        model: "M",
        attributes: {},
      }),
    );
    expect(err.status).toBe(409);
  });
});
