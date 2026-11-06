import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AssetsStore } from "../assets/assets-store.js";
import { ProductsStore } from "../products/products-store.js";
import { WorkMasterStore } from "../work-master/work-master-store.js";
import { ReferenceDataService } from "./reference-data-service.js";
import { ReferenceDataStore } from "./reference-data-store.js";

function catchError(fn: () => unknown): HTTPException | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof HTTPException) return err;
    throw err;
  }
  return undefined;
}

describe("ReferenceDataService", () => {
  let svc: ReferenceDataService;
  let workMaster: WorkMasterStore;
  beforeEach(() => {
    workMaster = new WorkMasterStore();
    svc = new ReferenceDataService({
      referenceDataStore: new ReferenceDataStore(),
      assetsStore: new AssetsStore(),
      productsReaderRepository: new ProductsStore(),
      workMasterStore: workMaster,
    });
  });

  it("refuses a duplicate code, naming the holder (REF-001 AC-2)", () => {
    expect(() =>
      svc.upsert(svc.data.downtimeReasons, {
        code: "jam",
        name: "Again",
        downtimeCategory: "unplanned",
      }),
    ).toThrow(HTTPException);
  });

  // docs-molcadx#142: a case or space variant of an existing code is a duplicate.
  it("refuses a code that differs only by case, naming the holder (docs-molcadx#142)", () => {
    const err = catchError(() =>
      svc.upsert(svc.data.downtimeReasons, {
        code: " JAM ",
        name: "Again",
        downtimeCategory: "unplanned",
      }),
    );
    expect(err?.status).toBe(409);
    expect(err?.message).toContain("Machine jam");
  });

  it("allows a row to keep its own code with different case (docs-molcadx#142)", async () => {
    const row = await svc.saveDowntime({
      id: "dr-2",
      code: "JAM",
      name: "Machine jam",
      downtimeCategory: "unplanned",
    });
    expect(row.code).toBe("JAM");
    expect(svc.data.downtimeReasons.find((r) => r.id === "dr-2")?.code).toBe("JAM");
  });

  it("keeps one active tick per reason per machine (REF-003 rule 4)", async () => {
    await svc.setTick("downtime", "dr-1", "asset-1", true);
    await svc.setTick("downtime", "dr-1", "asset-1", true);
    expect(
      svc.data.ticks.filter((t) => t.reasonId === "dr-1" && t.deletedAt === null),
    ).toHaveLength(1);
  });

  it("cascades a reason's deactivation to its ticks (REF-006 AC-5)", async () => {
    await svc.setTick("downtime", "dr-1", "asset-1", true);
    expect((await svc.impact("downtime", "dr-1")).ticks).toBe(1);
    expect(await svc.deactivate("downtime", "dr-1", "2099-01-01")).toEqual({ cascaded: 1 });
    expect(svc.data.ticks.find((t) => t.reasonId === "dr-1")?.deletedAt).toBe("2099-01-01");
  });

  it("refuses a past effective date (REF-006 AC-6)", async () => {
    await expect(svc.deactivate("reject", "rr-1", "2000-01-01")).rejects.toThrow(HTTPException);
  });

  it("restores a deactivated reason (reactivate)", async () => {
    await svc.deactivate("downtime", "dr-1", "2099-01-01");
    const restored = await svc.reactivate("downtime", "dr-1");
    expect(restored.deletedAt).toBeNull();
  });

  it("refuses reactivating an already-active reason", async () => {
    await expect(svc.reactivate("reject", "rr-1")).rejects.toThrow(HTTPException);
  });

  it("refuses reactivating a missing reason", async () => {
    await expect(svc.reactivate("downtime", "nonexistent")).rejects.toThrow(HTTPException);
  });

  // PRD-003 REF-006 (PO, 2026-10-21, F-05 T-9): units and time conversions deactivate like reasons.
  describe("units and time conversions (REF-006)", () => {
    it("refuses a past effective date for a unit (422 past_date)", async () => {
      await expect(svc.deactivateUnit("uom-1", "2000-01-01")).rejects.toThrow(HTTPException);
    });

    it("blocks deactivating a unit that an active product still uses (409 blocked)", async () => {
      // prod-1 (Wheat Flour) has base unit uom-2 (kg) and no validTo: active.
      const err = await svc.deactivateUnit("uom-2", "2099-01-01").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(409);
      expect(svc.data.units.find((u) => u.id === "uom-2")?.deletedAt).toBeUndefined();
    });

    it("adds a measurement group and refuses a case variant of an active code (REF-004 AC-10)", async () => {
      const row = await svc.saveGroup({ code: "density", name: "Density" });
      expect(row).toMatchObject({ code: "density", name: "Density", validTo: null });
      const err = await svc.saveGroup({ code: " MASS ", name: "Mass 2" }).catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(409);
    });

    it("refuses ending a group that still has units, naming them (REF-004 rule 5)", async () => {
      const err = await svc.endGroup("mg-mass").catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(409);
      expect((err as HTTPException).message).toContain("Kilogram");
      expect(svc.data.groups.find((g) => g.id === "mg-mass")?.validTo).toBeUndefined();
    });

    it("ends an empty group, frees its code, and keeps units out of it (REF-004 AC-11)", async () => {
      const ended = await svc.endGroup("mg-area");
      expect(ended.validTo).toBe(new Date().toISOString().slice(0, 10));
      const again = await svc.endGroup("mg-area").catch((e: unknown) => e);
      expect((again as HTTPException).status).toBe(422);
      const reused = await svc.saveGroup({ code: "area", name: "Area" });
      expect(reused.id).not.toBe("mg-area");
      const unit = await svc
        .saveUnit({ code: "M2", name: "Square metre", unit: "m²", measurementGroupId: "mg-area" })
        .catch((e: unknown) => e);
      expect((unit as HTTPException).status).toBe(422);
    });

    it("names each blocker, not only the count (REF-006 rule 2, AC-3)", async () => {
      const { blockers } = await svc.unitImpact("uom-2");
      expect(blockers.length).toBeGreaterThan(0);
      const product = blockers.find((b) => b.kind === "product");
      expect(product?.label).toContain("Wheat Flour");
      expect(blockers.every((b) => b.label.length > 0)).toBe(true);
    });

    it("deactivates a unit, refuses a second deactivation, and reactivates it", async () => {
      const row = await svc.deactivateUnit("uom-1", "2099-01-01");
      expect(row.deletedAt).toBe("2099-01-01");
      const again = await svc.deactivateUnit("uom-1", "2099-01-01").catch((e: unknown) => e);
      expect((again as HTTPException).status).toBe(422);
      const restored = await svc.reactivateUnit("uom-1");
      expect(restored.deletedAt).toBeNull();
    });

    it("refuses reactivating an already-active unit (422)", async () => {
      const err = await svc.reactivateUnit("uom-1").catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(422);
    });

    it("refuses a past effective date for a time conversion (422 past_date)", async () => {
      await expect(svc.deactivateTime("tc-3", "2000-01-01")).rejects.toThrow(HTTPException);
    });

    it("blocks deactivating a time conversion an active operation uses (409 blocked)", async () => {
      const impact = await svc.timeImpact("tc-1");
      expect(impact.references).toBeGreaterThan(0);
      const err = await svc.deactivateTime("tc-1", "2099-01-01").catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(409);
    });

    it("deactivates and reactivates an unused time conversion", async () => {
      const row = await svc.deactivateTime("tc-3", "2099-01-01");
      expect(row.deletedAt).toBe("2099-01-01");
      expect((await svc.reactivateTime("tc-3")).deletedAt).toBeNull();
    });

    it("saves a new unit PCS once the old PCS is deactivated (REF-004 AC-11)", async () => {
      await svc.deactivateUnit("uom-1", new Date().toISOString().slice(0, 10));
      const created = await svc.saveUnit({
        code: "PCS",
        name: "Pieces",
        unit: "pcs",
        measurementGroupId: "mg-count",
      });
      expect(created.code).toBe("PCS");
    });

    it("saves a new STD-CHG once the old one is deactivated (REF-005 AC-12)", async () => {
      const old = await svc.saveTime({
        code: "STD-CHG",
        name: "Standard change",
        secondsPerUnit: 60,
      });
      await svc.deactivateTime(old.id, new Date().toISOString().slice(0, 10));
      const created = await svc.saveTime({
        code: "STD-CHG",
        name: "Standard change",
        secondsPerUnit: 120,
      });
      expect(created.id).not.toBe(old.id);
    });

    it("refuses reactivating STD-CHG while a newer STD-CHG holds the code (409 code_taken)", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const old = await svc.saveTime({ code: "STD-CHG", name: "Old", secondsPerUnit: 60 });
      await svc.deactivateTime(old.id, today);
      await svc.saveTime({ code: "std-chg", name: "New", secondsPerUnit: 120 });
      const err = await svc.reactivateTime(old.id).catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(409);
    });

    it("blocks deactivating a time conversion a live step uses as its setup time", async () => {
      const tc = await svc.saveTime({ code: "SETUP-MIN", name: "Setup", secondsPerUnit: 60 });
      const [step] = (await workMaster.readOperations()).filter((o) => o.validTo === null);
      await workMaster.saveOperation({ ...step!, setupTimeConversionId: tc.id });
      const impact = await svc.timeImpact(tc.id);
      expect(impact.references).toBe(0);
      const err = await svc.deactivateTime(tc.id, "2099-01-01").catch((e: unknown) => e);
      expect((err as HTTPException).status).toBe(409);
    });
  });

  // PRD-003 REF-001 AC-10 / REF-002 AC-9 (PO 2026-10-21): a retired reason frees its code.
  it("REF-001 AC-10: a reason retired on 2026-10-01 frees BRK-01 for a new reason", async () => {
    const old = await svc.saveDowntime({
      code: "BRK-01",
      name: "Breakdown",
      downtimeCategory: "unplanned",
    });
    const row = svc.data.downtimeReasons.find((r) => r.id === old.id);
    if (!row) throw new Error("seeded reason missing");
    row.deletedAt = "2026-10-01";
    const saved = await svc.saveDowntime({
      code: "BRK-01",
      name: "Breakdown 2",
      downtimeCategory: "unplanned",
    });
    expect(saved.code).toBe("BRK-01");
    expect(saved.id).not.toBe(old.id);
  });

  it("a reason whose deletedAt is still in the future keeps its code", async () => {
    const old = await svc.saveDowntime({
      code: "BRK-02",
      name: "Breakdown",
      downtimeCategory: "unplanned",
    });
    const row = svc.data.downtimeReasons.find((r) => r.id === old.id);
    if (!row) throw new Error("seeded reason missing");
    row.deletedAt = "2999-01-01";
    const err = catchError(() =>
      svc.upsert(svc.data.downtimeReasons, {
        code: "BRK-02",
        name: "Again",
        downtimeCategory: "unplanned",
      }),
    );
    expect(err?.status).toBe(409);
  });
});
