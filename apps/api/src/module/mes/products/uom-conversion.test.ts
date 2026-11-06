import { describe, expect, it } from "vite-plus/test";

import { conversionPath, convertibleUnits, round6 } from "./uom-conversion.js";

import type { ConversionRow } from "./uom-conversion.js";

const fg1001 = { id: "FG-1001", baseUomId: "pcs" };
const fg2002 = { id: "FG-2002", baseUomId: "pcs" };
const row = (productId: string, from: string, to: string, value: number): ConversionRow => ({
  productId,
  fromUomId: from,
  toUomId: to,
  conversionValue: value,
  validFrom: "2026-01-01",
  validTo: null,
});
const rows = [row("FG-1001", "case", "pcs", 24), row("FG-2002", "case", "pcs", 36)];
const D = "2026-05-12";

describe("product unit conversion (PRO-003 §4, F-08 §9.2.1)", () => {
  it("multiplies read forward, per product (AC-5)", () => {
    expect(40 * conversionPath(rows, fg1001, "case", "pcs", D)!.factor).toBe(960);
    expect(40 * conversionPath(rows, fg2002, "case", "pcs", D)!.factor).toBe(1440);
  });

  it("divides read backward — no reverse row needed (AC-6)", () => {
    expect(960 * conversionPath(rows, fg1001, "pcs", "case", D)!.factor).toBe(40);
  });

  it("prefers the forward row when both directions exist (AC-6b)", () => {
    const both = [...rows, row("FG-1001", "pcs", "case", 0.0417)];
    expect(960 * conversionPath(both, fg1001, "pcs", "case", D)!.factor).toBeCloseTo(40.032, 6);
  });

  it("joins two rows through the base unit", () => {
    const packs = { id: "P", baseUomId: "pack" };
    const r = [row("P", "carton", "pack", 12), row("P", "pallet", "pack", 480)];
    expect(conversionPath(r, packs, "pallet", "carton", D)!.factor).toBe(40);
  });

  it("counts only rows active on the date (valid_to exclusive)", () => {
    const closed = [{ ...row("FG-1001", "case", "pcs", 24), validTo: "2026-05-12" }];
    expect(conversionPath(closed, fg1001, "case", "pcs", "2026-05-11")).not.toBeNull();
    expect(conversionPath(closed, fg1001, "case", "pcs", D)).toBeNull();
  });

  it("lists the base unit plus convertible units (WMS-003 AC-9)", () => {
    const packs = { id: "FG-1001", baseUomId: "pack" };
    const r = [row("FG-1001", "carton", "pack", 12)];
    expect(convertibleUnits(r, packs, ["pack", "carton", "kg"], D)).toEqual(["pack", "carton"]);
  });

  it("rounds half-up to 6 decimals (WMS-003 AC-15)", () => {
    expect(round6(1 / 700)).toBe(0.001429);
    expect(round6(1 / 500)).toBe(0.002);
  });
});
