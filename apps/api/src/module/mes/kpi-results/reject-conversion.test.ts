import { describe, expect, it } from "vite-plus/test";

import {
  convertReject,
  qualityFromManualReject,
  rejectExceedsOutput,
  rollUpRejectTime,
  weightOfOneUnit,
} from "./reject-conversion.js";

import type { RejectStep } from "./reject-conversion.js";

// Biscuit line example data (PRD-003 KPI-003, F-07, per-unit measurement
// 2026-10-05): Mold wet in punches (the `punch` measurement row = 20 g,
// 1 s / punch), Oven dry in pieces (the `pcs` row = 0.96 g, 0.05 s / pc).
const MASS = new Set(["kg", "g"]);
const GRAMS: Record<string, number> = { kg: 1000, g: 1 };
const base = {
  businessDate: "2026-10-01",
  isMass: (u: string) => MASS.has(u),
  convertMass: (qty: number, from: string, to: string) =>
    GRAMS[from] && GRAMS[to] ? (qty * GRAMS[from]) / GRAMS[to] : null,
  laterShrinkage: [],
  weightUomId: "g",
  finishedUomId: "pcs",
};

const mold: RejectStep = {
  ...base,
  product: { id: "biscuit", baseUomId: "pcs" },
  conversions: [],
  operationUomId: "punch",
  // AC-14: the `punch` unit's measurement row declares the weight of one punch.
  measurements: [{ uomId: "punch", standardWeight: 20 }],
  cycleTimeSeconds: 1,
};

const oven: RejectStep = {
  ...base,
  product: { id: "biscuit", baseUomId: "pcs" },
  conversions: [],
  operationUomId: "pcs",
  measurements: [{ uomId: "pcs", standardWeight: 0.96 }],
  cycleTimeSeconds: 0.05,
};

describe("Reject entered manually, in any unit (KPI-003 rule 12)", () => {
  it("converts 2 kg to 100 punches and 100 s lost (KPI-003 AC-14)", () => {
    expect(convertReject({ qty: 2, uomId: "kg" }, mold)).toEqual({
      kind: "value",
      units: 100,
      seconds: 100,
    });
  });

  it("weighs a count unit from its own measurement row, never the shrinkage derivation (2026-10-05)", () => {
    // The `punch` row stays 20 g at a step before a shrinkage step: a count
    // unit produced at one step only is weighed at that step (WMS-003).
    expect(weightOfOneUnit({ ...mold, laterShrinkage: [0.04] })).toEqual({
      value: 20,
      uomId: "g",
    });
  });

  it("converts 0.5 kg at the Oven to 521 pcs and 26 s (KPI-003 F-07 example)", () => {
    const r = convertReject({ qty: 0.5, uomId: "kg" }, oven);
    expect(r.kind).toBe("value");
    if (r.kind !== "value") return;
    expect(r.units).toBeCloseTo(520.83, 2);
    expect(r.seconds).toBeCloseTo(26.04, 2);
  });

  it("derives the wet weight before a shrinkage step (F-08 finished row ÷ Π(1 − shrinkage))", () => {
    expect(weightOfOneUnit({ ...oven, laterShrinkage: [0.2] })).toEqual({ value: 1.2, uomId: "g" });
  });

  it("reads 'Weight per unit missing' with no measurement row (KPI-003 AC-15)", () => {
    expect(convertReject({ qty: 2, uomId: "kg" }, { ...oven, measurements: [] })).toEqual({
      kind: "cannot_compute",
      reason: "weight_per_unit_missing",
    });
  });

  it("refuses a reject larger than the shift's counted output (KPI-003 AC-16)", () => {
    expect(rejectExceedsOutput(3_700, 3_600)).toBe(true);
    expect(rejectExceedsOutput(100, 3_600)).toBe(false);
  });

  it("adds reject time across work units, never kg: 100 s + 26 s = 126 s (KPI-003 AC-17)", () => {
    const parts = [
      convertReject({ qty: 2, uomId: "kg" }, mold),
      convertReject({ qty: 0.5, uomId: "kg" }, oven),
    ];
    const r = rollUpRejectTime(parts);
    expect(Math.round(r.seconds)).toBe(126);
    expect(r.partial).toBe(false);
  });

  it("machine total 3,600 + manual reject 100 punches → 97.2%, source_tier manual (KPI-003 AC-18)", () => {
    const q = qualityFromManualReject(3_600, [convertReject({ qty: 100, uomId: "punch" }, mold)]);
    expect(q.result).toMatchObject({ kind: "value", value: 97.2 });
    expect(q.sourceTier).toBe("manual");
  });

  it("converts 5 packs to 50 pcs → 97.5% (KPI-003 AC-19)", () => {
    const step: RejectStep = {
      ...oven,
      conversions: [
        {
          productId: "biscuit",
          fromUomId: "pack",
          toUomId: "pcs",
          conversionValue: 10,
          validFrom: "2026-01-01",
        },
      ],
    };
    const r = convertReject({ qty: 5, uomId: "pack" }, step);
    expect(r).toMatchObject({ kind: "value", units: 50 });
    expect(qualityFromManualReject(2_000, [r]).result).toMatchObject({
      kind: "value",
      value: 97.5,
    });
  });

  it("reads 'No conversion for this unit' naming both units and the product (KPI-003 AC-20)", () => {
    const r = convertReject({ qty: 5, uomId: "carton" }, oven);
    expect(r).toEqual({
      kind: "cannot_compute",
      reason: "no_conversion_for_unit",
      fromUomId: "carton",
      toUomId: "pcs",
      productId: "biscuit",
    });
    expect(qualityFromManualReject(2_000, [r]).result).toEqual({
      kind: "cannot_compute",
      reason: "no_conversion_for_unit",
    });
  });

  it("shows reject units but no time when the step has no cycle time (F-07 'Cycle time missing')", () => {
    expect(
      convertReject({ qty: 2, uomId: "kg" }, { ...mold, cycleTimeSeconds: undefined }),
    ).toEqual({
      kind: "value",
      units: 100,
      seconds: null,
    });
    const r = rollUpRejectTime([
      convertReject({ qty: 2, uomId: "kg" }, { ...mold, cycleTimeSeconds: undefined }),
    ]);
    expect(r.partial).toBe(true);
  });

  it("divides by batch size when the standard is per cycle", () => {
    expect(
      convertReject({ qty: 100, uomId: "punch" }, { ...mold, cycleTimeSeconds: 4, batchSize: 4 }),
    ).toMatchObject({
      seconds: 100,
    });
  });
});
