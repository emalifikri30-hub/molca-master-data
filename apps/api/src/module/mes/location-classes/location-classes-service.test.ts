import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { LocationClassesService } from "./location-classes-service.js";
import { LocationClassesStore } from "./location-classes-store.js";

describe("LocationClassesService", () => {
  let svc: LocationClassesService;
  beforeEach(() => {
    svc = new LocationClassesService({
      locationClassesStore: new LocationClassesStore(),
    });
  });

  it("deactivate sets the end date; reactivate clears it (rule 5)", async () => {
    const row = await svc.save({ level: "area", code: "LINE_A", name: "Line A" });
    const retired = await svc.deactivate(row.id);
    expect(retired.validTo).not.toBeNull();
    const restored = await svc.reactivate(row.id);
    expect(restored.validTo).toBeNull();
  });

  it("refuses reactivating an already-active class", async () => {
    const row = await svc.save({ level: "site", code: "PLANT", name: "Plant" });
    await expect(svc.reactivate(row.id)).rejects.toThrow(HTTPException);
  });

  it("refuses reactivating a missing class", async () => {
    await expect(svc.reactivate("nonexistent")).rejects.toThrow(HTTPException);
  });

  // docs-molcadx#142: a case or space variant of a code at the same level is a duplicate.
  it("refuses a code that differs only by case, naming the holder (docs-molcadx#142)", async () => {
    await svc.save({ level: "area", code: "LINE_A", name: "Line A" });
    const err = await svc
      .save({ level: "area", code: " line_a ", name: "Again" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    expect(JSON.parse((err as HTTPException).message.replace(/^REFUSAL:/, ""))).toEqual({
      code: "code_taken",
      holderCode: "LINE_A",
      name: "Line A",
    });
  });

  it("allows a class to keep its own code with different case, saved as typed (docs-molcadx#142)", async () => {
    const row = await svc.save({ level: "area", code: "LINE_A", name: "Line A" });
    const updated = await svc.save({ id: row.id, level: "area", code: "line_A", name: "Line A" });
    expect(updated.code).toBe("line_A");
  });

  // PRD-003 SIT-004 rule 1 / AC-7 (PO 2026-10-21): only active classes hold a code.
  it("SIT-004 AC-7: a class retired on 2026-10-01 frees its code for a new class on 2026-10-02", async () => {
    const store = new LocationClassesStore();
    const retiredSvc = new LocationClassesService({ locationClassesStore: store });
    const old = await retiredSvc.save({ level: "work-center", code: "PKG", name: "Packing" });
    await store.update(old.id, "work-center", { validTo: "2026-10-01" });
    const saved = await retiredSvc.save({ level: "work-center", code: "PKG", name: "Packing 2" });
    expect(saved.code).toBe("PKG");
    expect(saved.id).not.toBe(old.id);
  });

  it("SIT-004 AC-7: an active PKG still refuses ' pkg ' (case and spaces)", async () => {
    await svc.save({ level: "work-center", code: "PKG", name: "Packing" });
    const err = await svc
      .save({ level: "work-center", code: " pkg ", name: "Again" })
      .catch((e: unknown) => e);
    expect((err as HTTPException).status).toBe(409);
  });
});
