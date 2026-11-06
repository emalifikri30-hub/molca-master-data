import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { ReferenceDataStore } from "../reference-data/reference-data-store.js";
import { WorkMasterService } from "../work-master/work-master-service.js";
import { WorkMasterStore } from "../work-master/work-master-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { PlanningClient } from "../../planning/planning-client.js";
import { ProductsService } from "./products-service.js";
import { ProductsStore } from "./products-store.js";

/** Planning's `/job-orders/executions`, stubbed. Every work order carries the contract's siteId. */
function planning(
  workOrders: Array<{ id: string; woNumber: string; productId: string; status: string }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              workOrders: workOrders.map((w) => ({ siteId: "site-1", ...w })),
              jobOrders: [],
              executions: [],
            },
            error: null,
          }),
        ),
    ),
  );
}

function refusalOf(err: unknown): Record<string, unknown> {
  if (!(err instanceof HTTPException)) throw err;
  return JSON.parse(err.message.replace(/^REFUSAL:/, ""));
}

// Seed: uom-3 = g (mass), uom-5 = pack (count), uom-6 = carton (count).
const detail = {
  productId: "prod-3",
  weightUomId: "uom-3",
  isBatchTracked: true,
};
// PRO-002 AC-1: each unit's envelope is its own row.
const packRow = { uomId: "uom-5", minWeight: 495, standardWeight: 500, maxWeight: 505 };

describe("ProductsService", () => {
  let svc: ProductsService;
  let workMaster: WorkMasterService;
  let reference: ReferenceDataStore;
  beforeEach(() => {
    const productsStore = new ProductsStore();
    reference = new ReferenceDataStore();
    workMaster = new WorkMasterService({
      workMasterStore: new WorkMasterStore(),
      productsReaderRepository: productsStore,
      workUnitsStore: new WorkUnitsStore(),
    });
    svc = new ProductsService({
      planningClient: new PlanningClient({
        planningBaseUrl: "http://planning.test",
        planningTimeoutMs: 5_000,
      }),
      productsReaderRepository: productsStore,
      productsWriterRepository: productsStore,
      workMasterService: workMaster,
      referenceDataStore: reference,
    });
    planning([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses closing a product an active BOM uses, naming it (PRO-001 AC-6)", async () => {
    const err = await svc.close("prod-2", "2099-01-01").catch((e: unknown) => e);
    const body = refusalOf(err);
    expect(body.code).toBe("closure_blocked");
    expect(JSON.stringify(body.blockers)).toContain("bom-1");
  });

  it("refuses closing a product an active routing or work order references (PRO-001 rule 5)", async () => {
    workMaster.data.boms = [];
    const routing = refusalOf(await svc.close("prod-3", "2099-01-01").catch((e: unknown) => e));
    expect(JSON.stringify(routing.blockers)).toContain("rt-1");
    workMaster.data.routings = [];
    planning([{ id: "wo-1", woNumber: "WO-2026-00184", productId: "prod-3", status: "released" }]);
    const wo = refusalOf(await svc.close("prod-3", "2099-01-01").catch((e: unknown) => e));
    expect(JSON.stringify(wo.blockers)).toContain("WO-2026-00184");
    planning([{ id: "wo-1", woNumber: "WO-2026-00184", productId: "prod-3", status: "completed" }]);
    expect((await svc.close("prod-3", "2099-01-01")).validTo).toBe("2099-01-01");
  });

  it("refuses closing a product a saved BOM or routing uses when the seed arrays do not (PRO-001 rule 5)", async () => {
    workMaster.data.boms = [];
    workMaster.data.routings = [];
    vi.spyOn(workMaster.data, "readBoms").mockResolvedValue([
      {
        id: "bom-db",
        productId: "prod-9",
        flowId: "flow-1",
        version: 2,
        status: "released",
        baseQty: 1,
        baseUomId: "uom-5",
        isPhantom: false,
        validFrom: "2026-09-01",
        validTo: null,
        lines: [
          {
            id: "line-db",
            componentProductId: "prod-3",
            stepId: null,
            lineUse: "consumed",
            isPrimaryOutput: null,
            qtyPerUnit: 1,
            uomId: "uom-5",
            scrapFactor: 0,
            dispenseToleranceType: null,
            dispenseToleranceValue: null,
          },
        ],
      },
    ]);
    vi.spyOn(workMaster.data, "readRoutings").mockResolvedValue([
      {
        id: "rt-db",
        productId: "prod-3",
        workCenterId: "wc-1",
        flowId: "flow-1",
        version: 1,
        status: "released",
        isPrimary: true,
        enforceSequence: false,
        validFrom: "2026-09-01",
        validTo: null,
      },
    ]);
    const body = refusalOf(await svc.close("prod-3", "2099-01-01").catch((e: unknown) => e));
    expect(body).toEqual({
      code: "closure_blocked",
      blockers: [
        { type: "bom", bomId: "bom-db", productId: "prod-9", version: 2, validFrom: "2026-09-01" },
        {
          type: "routing",
          routingId: "rt-db",
          workCenterId: "wc-1",
          version: 1,
          validFrom: "2026-09-01",
        },
      ],
    });
  });

  it("versions a measurement row instead of overwriting (PRO-002 AC-6)", async () => {
    await svc.upsertMeasurements("prod-3", [{ ...packRow, minWeight: 490, maxWeight: 510 }]);
    const versions = (await svc.measurementVersions("prod-3")).filter((m) => m.uomId === "uom-5");
    expect(versions).toHaveLength(2);
    expect((await svc.measurements("prod-3")).find((m) => m.uomId === "uom-5")?.minWeight).toBe(
      490,
    );
    expect(versions.find((m) => m.validTo != null)?.minWeight).toBe(480);
  });

  it("keeps one row per unit the product is handled in, base unit included (PRO-002 AC-10)", async () => {
    // prod-3: base unit pack (uom-5) and one conversion unit, carton (uom-6).
    expect((await svc.measurements("prod-3")).map((m) => m.uomId).sort()).toEqual([
      "uom-5",
      "uom-6",
    ]);
  });

  it("re-versions only a row whose values moved (rule 5)", async () => {
    await svc.upsertMeasurements("prod-3", [
      { uomId: "uom-5", minWeight: 480, standardWeight: 500, maxWeight: 520 },
    ]);
    expect(
      (await svc.measurementVersions("prod-3")).filter((m) => m.uomId === "uom-5"),
    ).toHaveLength(1);
  });

  it("refuses an envelope out of order, naming all three numbers (PRO-002 AC-2, AC-3)", async () => {
    const order = refusalOf(
      await svc
        .upsertMeasurements("prod-3", [{ ...packRow, minWeight: 505, maxWeight: 495 }])
        .catch((e: unknown) => e),
    );
    expect(order).toMatchObject({ code: "weight_order", min: 505, standard: 500, max: 495 });
    await expect(
      svc.upsertMeasurements("prod-3", [{ ...packRow, standardWeight: 520 }]),
    ).rejects.toThrow(HTTPException);
  });

  it("stores a divergent carton gross with no warning and no block (PRO-002 AC-12)", async () => {
    // AC-12 worked example: pcs standard 50 g, ctn standard 12,500 g at
    // 240 pcs/ctn (240 × 50 = 12,000 g — the 500 g difference is the box).
    // The divergence is correct (rule 7): the save just works.
    const [row] = await svc.upsertMeasurements("prod-3", [
      { uomId: "uom-6", minWeight: 12000, standardWeight: 12500, maxWeight: 13000 },
    ]);
    expect(row).toMatchObject({ uomId: "uom-6", standardWeight: 12500 });
  });

  it("derives volume and takes no volume input (PRO-002 AC-13)", async () => {
    reference.groups.push({ id: "mg-length", code: "length", name: "Length" });
    reference.units.push({
      id: "uom-cm",
      code: "CM",
      name: "Centimeter",
      unit: "cm",
      measurementGroupId: "mg-length",
    });
    await svc.upsertDetail({
      ...detail,
      dimensionUomId: "uom-cm",
    });
    const [row] = await svc.upsertMeasurements("prod-3", [
      {
        uomId: "uom-6",
        minWeight: 6000,
        standardWeight: 12500,
        maxWeight: 13000,
        length: 40,
        width: 30,
        height: 25,
      },
    ]);
    expect(row.volume).toBe(30000);
  });

  it("refuses dimensions while the product has no dimension unit (PRO-002 rule 2)", async () => {
    const body = refusalOf(
      await svc.upsertMeasurements("prod-3", [{ ...packRow, length: 25 }]).catch((e: unknown) => e),
    );
    expect(body.code).toBe("dimension_unit_required");
  });

  it("needs a mass unit for the envelope (PRO-002 AC-9)", async () => {
    // prod-3 has measurement rows, so the weight unit is required.
    await expect(svc.upsertDetail({ ...detail, weightUomId: "" })).rejects.toThrow(HTTPException);
    await expect(svc.upsertDetail({ ...detail, weightUomId: null })).rejects.toThrow(HTTPException);
    // An unknown unit is refused even with no measurement row.
    await expect(
      svc.upsertDetail({ ...detail, productId: "prod-2", weightUomId: "uom-x" }),
    ).rejects.toThrow(HTTPException);
    await expect(svc.upsertDetail({ ...detail, weightUomId: "uom-5" })).rejects.toThrow(
      HTTPException,
    );
    expect((await svc.upsertDetail(detail)).weightUomId).toBe("uom-3");
  });

  it("accepts a mass unit the unit list returns when the seed array does not (PRO-002 rule 2)", async () => {
    reference.units = [];
    vi.spyOn(reference, "listUnits").mockResolvedValue([
      { id: "uom-g-db", code: "G", name: "Gram", unit: "g", measurementGroupId: "mg-mass" },
    ]);
    expect((await svc.upsertDetail({ ...detail, weightUomId: "uom-g-db" })).weightUomId).toBe(
      "uom-g-db",
    );
  });

  it("closes the old factor the day the new one starts (PRO-003 AC-8)", async () => {
    const next = await svc.updateConversion("conv-1", 10);
    const old = (await svc.conversions("prod-3")).find((c) => c.id === "conv-1");
    expect(old?.validTo).toBe(next.validFrom);
  });

  it("refuses a same-unit or zero conversion (PRO-003 AC-2/3)", async () => {
    await expect(
      svc.createConversion({
        productId: "prod-3",
        fromUomId: "uom-1",
        toUomId: "uom-1",
        conversionValue: 2,
      }),
    ).rejects.toThrow(HTTPException);
    await expect(
      svc.createConversion({
        productId: "prod-3",
        fromUomId: "uom-1",
        toUomId: "uom-5",
        conversionValue: 0,
      }),
    ).rejects.toThrow(HTTPException);
  });

  it("needs a packaging level for packaging only (PRO-001 AC-10, AC-11)", async () => {
    const base = {
      code: "PK-01",
      name: "Carton",
      productType: "packaging" as const,
      baseUomId: "uom-5",
    };
    await expect(svc.create(base)).rejects.toThrow(HTTPException);
    const created = await svc.create({ ...base, packagingLevel: "secondary" });
    expect(created).toMatchObject({ productType: "packaging", packagingLevel: "secondary" });
    const fg = await svc.create({
      code: "FG-9",
      name: "Snack",
      productType: "finished_good",
      baseUomId: "uom-5",
    });
    expect(fg.packagingLevel).toBeNull();
  });

  // docs-molcadx#142: a case or space variant of an existing product code is a duplicate.
  it("refuses a product code that differs only by case or spaces (docs-molcadx#142)", async () => {
    const err = await svc
      .create({
        code: " fg-bread-500 ",
        name: "Copy",
        productType: "finished_good",
        baseUomId: "uom-5",
      })
      .catch((e: unknown) => e);
    const body = refusalOf(err);
    expect(body.name).toBe("White Bread 500g");
  });

  it("saves a new product code as typed, in its own case (docs-molcadx#142)", async () => {
    const created = await svc.create({
      code: "fg-new-7",
      name: "Snack",
      productType: "finished_good",
      baseUomId: "uom-5",
    });
    expect(created.code).toBe("fg-new-7");
  });

  // PRO-002 (PO 2026-10-10, docs-molcadx#125): batch tracked, barcode and shelf
  // life are saved by the product Edit modal, with the product, in one save.
  describe("product details in the Edit modal (PRO-002 AC-17)", () => {
    // prod-3's seeded detail: batch tracked on, barcode 8991234500031, 5 days.
    const seeded = { isBatchTracked: true, barcode: "8991234500031", shelfLifeDays: 5 };

    it("closes the detail row and opens a new one when batch tracked changes", async () => {
      await svc.update("prod-3", { name: "Renamed" }, { ...seeded, isBatchTracked: false });
      const versions = await svc.detailVersions("prod-3");
      expect(versions).toHaveLength(2);
      const [next, old] = versions;
      expect(old?.validTo).toBe(next?.validFrom);
      expect(next).toMatchObject({ isBatchTracked: false, validTo: null });
      // The units are set only in the per-unit drawer: they carry over.
      expect(next).toMatchObject({ weightUomId: "uom-3", barcode: "8991234500031" });
      expect((await svc.get("prod-3")).name).toBe("Renamed");
    });

    it("opens a new row for a barcode or shelf-life change too", async () => {
      await svc.update("prod-3", {}, { ...seeded, barcode: "8990000000001" });
      await svc.update("prod-3", {}, { ...seeded, barcode: "8990000000001", shelfLifeDays: 7 });
      expect(await svc.detailVersions("prod-3")).toHaveLength(3);
      expect(await svc.detail("prod-3")).toMatchObject({
        barcode: "8990000000001",
        shelfLifeDays: 7,
      });
    });

    it("keeps the detail row when none of the three changed", async () => {
      await svc.update("prod-3", { name: "Renamed" }, seeded);
      expect(await svc.detailVersions("prod-3")).toHaveLength(1);
    });

    it("refuses a taken barcode before the product is written (PRO-002 AC-7)", async () => {
      await svc.upsertDetail({ ...detail, productId: "prod-2", barcode: "8990000000002" });
      const err = await svc
        .update("prod-3", { name: "Renamed" }, { ...seeded, barcode: "8990000000002" })
        .catch((e: unknown) => e);
      expect(refusalOf(err).code).toBe("barcode_taken");
      expect((await svc.get("prod-3")).name).not.toBe("Renamed");
      expect(await svc.detailVersions("prod-3")).toHaveLength(1);
    });

    it("opens the first detail row with no weight unit before any unit is measured", async () => {
      // prod-2 has no PRODUCT_DETAIL row and no measurement row.
      await svc.update("prod-2", { name: "Renamed" }, { isBatchTracked: true });
      expect(await svc.detail("prod-2")).toMatchObject({
        isBatchTracked: true,
        weightUomId: null,
        validTo: null,
      });
      expect((await svc.get("prod-2")).name).toBe("Renamed");
      // Unchanged defaults on such a product open no row.
      await svc.update("prod-1", { name: "Renamed" }, { isBatchTracked: false });
      expect(await svc.detail("prod-1")).toBeNull();
    });

    it("still needs the weight unit before a unit's measurement saves (PRO-002 rule 2)", async () => {
      await svc.update("prod-2", {}, { isBatchTracked: true });
      const err = await svc.upsertMeasurements("prod-2", [packRow]).catch((e: unknown) => e);
      expect(refusalOf(err).code).toBe("weight_unit_required");
      // The unit's drawer sets it, and keeps the Edit modal's values.
      await svc.upsertDetail({ productId: "prod-2", weightUomId: "uom-3", isBatchTracked: true });
      expect(await svc.upsertMeasurements("prod-2", [packRow])).toHaveLength(1);
    });

    it("stores an empty weight unit as null, never as an empty string", async () => {
      // prod-2 has no measurement row, so no weight unit is allowed yet.
      await svc.upsertDetail({ productId: "prod-2", weightUomId: "", isBatchTracked: false });
      expect((await svc.detail("prod-2"))?.weightUomId).toBeNull();
    });

    // PO 2026-10-10: units in the Edit modal, checked like the unit drawer.
    it("opens a new row carrying the weight unit saved from the Edit modal", async () => {
      await svc.update("prod-2", {}, { isBatchTracked: true, weightUomId: "uom-3" });
      expect(await svc.detail("prod-2")).toMatchObject({ weightUomId: "uom-3", validTo: null });
    });

    it("refuses a non-mass weight unit from the Edit modal and writes nothing", async () => {
      const err = await svc
        .update("prod-3", { name: "Renamed" }, { ...seeded, weightUomId: "uom-5" })
        .catch((e: unknown) => e);
      expect(refusalOf(err).code).toBe("weight_unit_not_mass");
      expect((await svc.get("prod-3")).name).not.toBe("Renamed");
      expect(await svc.detailVersions("prod-3")).toHaveLength(1);
    });

    it("refuses clearing the weight unit while the product has measurement rows", async () => {
      const err = await svc
        .update("prod-3", {}, { ...seeded, weightUomId: null })
        .catch((e: unknown) => e);
      expect(refusalOf(err).code).toBe("weight_unit_required");
      expect(await svc.detailVersions("prod-3")).toHaveLength(1);
    });
  });

  // PRD-003 P-8 / PRO-001 AC-15 (PO 2026-10-21): a retired product frees its code.
  it("PRO-001 AC-15: a product retired on 2026-10-01 frees FG-1001 for a new product", async () => {
    const productsStore = new ProductsStore();
    const workMasterSvc = new WorkMasterService({
      workMasterStore: new WorkMasterStore(),
      productsReaderRepository: productsStore,
      workUnitsStore: new WorkUnitsStore(),
    });
    const service = new ProductsService({
      planningClient: new PlanningClient({
        planningBaseUrl: "http://planning.test",
        planningTimeoutMs: 5_000,
      }),
      productsReaderRepository: productsStore,
      productsWriterRepository: productsStore,
      workMasterService: workMasterSvc,
      referenceDataStore: new ReferenceDataStore(),
    });
    const base = { name: "Burger", productType: "finished_good" as const, baseUomId: "uom-5" };
    const old = await service.create({ ...base, code: "FG-1001" });
    await productsStore.updateProduct(old.id, { validTo: "2026-10-01" });
    const saved = await service.create({ ...base, code: "FG-1001", name: "Burger v2" });
    expect(saved.code).toBe("FG-1001");
    expect(saved.id).not.toBe(old.id);
  });
});
