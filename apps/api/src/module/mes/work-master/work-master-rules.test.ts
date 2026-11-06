import { describe, expect, it } from "vite-plus/test";

import {
  bomDepth,
  bomDraftError,
  checkError,
  cleanCheck,
  detailChange,
  cycleTimeIdeal,
  endSteps,
  expectedYield,
  findCycle,
  findLoop,
  flowOrder,
  holdSuccessors,
  inEffect,
  percentOfBatch,
  performanceFor,
  plannedInput,
  qtyPerTop,
  releasePlan,
  shrinkageOk,
  shrinkagesFrom,
  stepError,
  stepYield,
  toleranceError,
  toleranceRange,
  unitWeights,
  versionChange,
  weightLeavingStep,
  yieldRangeOk,
  yieldWarning,
} from "./work-master-rules.js";

import type { BomLineDraft, CheckDraft, StepDraft } from "./work-master-rules.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

describe("Work Master rules", () => {
  it("plans input from the net recipe, scrap and shrinkage (WMS-002 AC-12)", () => {
    // Mix recipe per 1,000 kg: A 700 kg (scrap 0.02), B 300 kg; Mixer 1 shrinkage 0.05.
    expect(round2(100 * plannedInput({ qtyPerUnit: 700, scrapFactor: 0.02 }, 1000, [0.05]))).toBe(
      75.16,
    );
    expect(round2(100 * plannedInput({ qtyPerUnit: 300, scrapFactor: 0 }, 1000, [0.05]))).toBe(
      31.58,
    );
    // Same BOM on Mixer 2 (0.03).
    expect(round2(100 * plannedInput({ qtyPerUnit: 700, scrapFactor: 0.02 }, 1000, [0.03]))).toBe(
      73.61,
    );
    expect(round2(100 * plannedInput({ qtyPerUnit: 300, scrapFactor: 0 }, 1000, [0.03]))).toBe(
      30.93,
    );
  });

  it("charges a line only the shrinkage of its entry step and later ones (WMS-002 §4)", () => {
    const steps = [
      { stepId: "s1", plannedShrinkage: 0.1 },
      { stepId: "s2", plannedShrinkage: 0.05 },
    ];
    expect(shrinkagesFrom(steps, null)).toEqual([0.1, 0.05]);
    expect(shrinkagesFrom(steps, "s2")).toEqual([0.05]);
  });

  it("works out the dispensing range (WMS-002 AC-16, AC-17)", () => {
    expect(toleranceRange(75.16, "percent", 1)).toEqual({ min: 74.4084, max: 75.9116 });
    expect(round2(toleranceRange(75.16, "percent", 1).min)).toBe(74.41);
    expect(round2(toleranceRange(75.16, "percent", 1).max)).toBe(75.91);
    expect(toleranceRange(75.16, "absolute", 0.2)).toEqual({ min: 74.96, max: 75.36 });
  });

  it("refuses a bad dispensing tolerance (WMS-002 AC-18)", () => {
    expect(toleranceError("percent", 100)).toBe("tolerance_percent");
    expect(toleranceError("percent", null)).toBe("tolerance_value");
    expect(toleranceError("absolute", 0)).toBe("tolerance_absolute");
    expect(toleranceError("percent", 1)).toBeNull();
    expect(toleranceError(null, null)).toBeNull();
  });

  it("keeps planned shrinkage from 0 to below 100% (WMS-003 AC-20)", () => {
    expect(shrinkageOk(1)).toBe(false);
    expect(shrinkageOk(-0.01)).toBe(false);
    expect(shrinkageOk(0.04)).toBe(true);
    expect(shrinkageOk(null)).toBe(true);
  });

  it("works out a step's yield (WMS-003 AC-24)", () => {
    const result = stepYield(100, [
      { actualQty: 73.5, netRatio: 0.7 },
      { actualQty: 31.5, netRatio: 0.3 },
    ]);
    expect(result).toEqual({ kind: "value", theoretical: 105, yieldPct: 95.2 });
    expect(expectedYield(0.05)).toBe(95);
    expect(stepYield(100, [{ actualQty: 0, netRatio: 0.7 }])).toEqual({
      kind: "cannot_calculate",
    });
    // W-16: out of recipe ratio stays TBD, never a guessed figure.
    expect(
      stepYield(100, [
        { actualQty: 73.5, netRatio: 0.7 },
        { actualQty: 30, netRatio: 0.3 },
      ]).kind,
    ).toBe("out_of_ratio");
  });

  it("warns, never blocks, when the yield range leaves out the expected yield (WMS-003 AC-25)", () => {
    expect(yieldWarning(0.05, 96, 99)).toEqual({ expected: 95 });
    expect(yieldWarning(0.05, 93, 97)).toBeNull();
    expect(yieldWarning(0.05, null, null)).toBeNull();
  });

  it("refuses a yield min above max (WMS-003 AC-26)", () => {
    expect(yieldRangeOk(98, 95)).toBe(false);
    expect(yieldRangeOk(-1, null)).toBe(false);
    expect(yieldRangeOk(93, 105)).toBe(true);
    expect(yieldRangeOk(null, 97)).toBe(true);
  });

  it("applies the hold time to every step that waits (WMS-003 AC-27)", () => {
    const steps = [{ stepId: "bake" }, { stepId: "glaze" }, { stepId: "print" }];
    const deps = [
      { stepId: "glaze", predecessorStepId: "bake" },
      { stepId: "print", predecessorStepId: "bake" },
    ];
    expect(holdSuccessors("bake", steps, deps)).toEqual(["glaze", "print"]);
    expect(holdSuccessors("print", steps, deps)).toEqual([]);
    // Straight line: the next step; the last step has none.
    expect(holdSuccessors("bake", steps, [])).toEqual(["glaze"]);
    expect(holdSuccessors("print", steps, [])).toEqual([]);
  });

  it("finds the end steps: the ones no step waits for (WMS-003 AC-37)", () => {
    const steps = [
      { stepId: "bake", stepNumber: 10, stepName: "Bake" },
      { stepId: "glaze", stepNumber: 20, stepName: "Glaze" },
      { stepId: "print", stepNumber: 30, stepName: "Print" },
    ];
    const waits = [
      { stepId: "glaze", predecessorStepId: "bake" },
      { stepId: "print", predecessorStepId: "bake" },
    ];
    expect(endSteps(steps, waits).map((s) => s.stepName)).toEqual(["Glaze", "Print"]);
    expect(
      endSteps(steps, [...waits, { stepId: "pack", predecessorStepId: "glaze" }]).map(
        (s) => s.stepId,
      ),
    ).toEqual(["print"]);
    // No "Waits for" rows: the steps run in step order, so the highest step ends it.
    expect(endSteps(steps, []).map((s) => s.stepName)).toEqual(["Print"]);
  });

  it("finds steps that wait for each other in a loop (WMS-003 AC-21)", () => {
    expect(
      findLoop([
        { stepId: "B", predecessorStepId: "A" },
        { stepId: "A", predecessorStepId: "B" },
      ])?.sort(),
    ).toEqual(["A", "B"]);
    expect(findLoop([{ stepId: "B", predecessorStepId: "A" }])).toBeNull();
  });

  it("derives the weight of one unit per step, wet then dry (WMS-003 AC-22)", () => {
    const weights = unitWeights(0.96, [0, 0.04, 0]);
    expect(weights.map((w) => round2(w.weight))).toEqual([1, 0.96, 0.96]);
    expect(weights.map((w) => w.wet)).toEqual([true, false, false]);
  });

  it("pre-fills steps in the work center's flow order (WMS-003 AC-19)", () => {
    const units = [
      { id: "cool", code: "WU_3" },
      { id: "mold", code: "WU_1" },
      { id: "oven", code: "WU_2" },
    ];
    const flows = [
      { fromWorkUnitId: "oven", toWorkUnitId: "cool" },
      { fromWorkUnitId: "mold", toWorkUnitId: "oven" },
    ];
    expect(flowOrder(units, flows).map((u) => u.id)).toEqual(["mold", "oven", "cool"]);
  });

  it("uses a station's own override, else the class default (WMS-003 AC-18)", () => {
    const overrides = [
      { workUnitId: "mixer-2", cycleTimeValue: 540, validFrom: "2026-01-01", validTo: null },
    ];
    expect(cycleTimeIdeal({ cycleTimeValue: 600 }, overrides, "mixer-1", "2026-05-12")).toBe(600);
    expect(cycleTimeIdeal({ cycleTimeValue: 600 }, overrides, "mixer-2", "2026-05-12")).toBe(540);
  });

  it("refuses a check that breaks the rules (WMS-003 AC-30)", () => {
    const base: CheckDraft = {
      checkName: "Tablet weight",
      valueType: "numeric",
      targetValue: 250,
      minValue: 245,
      maxValue: 255,
      uomId: "uom-mg",
      frequencyType: "interval",
      frequencyIntervalValue: 15,
      frequencyIntervalConversionId: "tc-2",
      isCritical: true,
    };
    expect(checkError(base, [])).toBeNull();
    expect(checkError({ ...base, minValue: null, maxValue: null }, [])).toBe("check_no_limit");
    expect(checkError({ ...base, targetValue: 260 }, [])).toBe("check_range");
    expect(checkError({ ...base, uomId: null }, [])).toBe("check_unit");
    expect(checkError({ ...base, frequencyIntervalValue: 0 }, [])).toBe("check_interval");
    expect(checkError({ ...base, valueType: "text", minValue: null, maxValue: null }, [])).toBe(
      "check_critical_note",
    );
    expect(checkError(base, [{ checkName: "tablet weight" }])).toBe("check_duplicate");
  });

  it("finds a circular BOM chain (WMS-002 AC-3)", () => {
    const boms: Record<string, Array<string>> = { B: ["C"], C: ["A"] };
    expect(findCycle("A", ["B"], (id) => boms[id] ?? [])).toEqual(["A", "B", "C", "A"]);
    expect(findCycle("A", ["X"], (id) => boms[id] ?? [])).toBeNull();
  });

  it("measures BOM depth", () => {
    const boms: Record<string, Array<string>> = { A: ["B"], B: ["C"] };
    expect(bomDepth("A", (id) => boms[id] ?? [])).toBe(2);
  });

  it("closes the old standard on the new one's start, half-open (WMS-003 AC-1)", () => {
    expect(versionChange({ validFrom: "2026-01-01", validTo: null }, "2026-07-01")).toEqual({
      closeAt: "2026-07-01",
    });
  });

  it("refuses a gap with no standard (WMS-003 AC-4)", () => {
    expect(versionChange({ validFrom: "2026-01-01", validTo: "2026-06-30" }, "2026-07-05")).toEqual(
      {
        gap: { from: "2026-06-30", to: "2026-07-04" },
      },
    );
  });

  it("uses the standard in effect on the date (WMS-003 AC-2)", () => {
    const rows = [
      { validFrom: "2026-01-01", validTo: "2026-07-01", cycleTimeValue: 20 },
      { validFrom: "2026-07-01", validTo: null, cycleTimeValue: 18 },
    ];
    const may = inEffect(rows, "2026-05-12");
    expect(may?.cycleTimeValue).toBe(20);
    const p = performanceFor(may?.cycleTimeValue, 1000, 378);
    expect(p.kind === "value" && Math.round(p.performance * 1000) / 10).toBe(88.2);
  });

  it("cannot compute without a standard (WMS-003 AC-5)", () => {
    expect(performanceFor(undefined, 1000, 378)).toEqual({ kind: "cannot_compute" });
  });
  it("shows quantities per base and per top unit (WMS-002 AC-11)", () => {
    // Mix per 1,000 kg, A 700 kg → 70% of batch and 0.7 kg per kg of mix.
    expect(percentOfBatch(700, 1000, true)).toBe(70);
    expect(percentOfBatch(700, 1000, false)).toBeNull();
    expect(qtyPerTop([{ qtyPerUnit: 700, baseQty: 1000, perParentLineUnit: 1 }])).toBe(0.7);
    // Biscuit pack base 1: 40 pcs; biscuit base 1 pc: 0.96 g dough → 38.4 g per pack.
    expect(
      qtyPerTop([
        { qtyPerUnit: 40, baseQty: 1, perParentLineUnit: 1 },
        { qtyPerUnit: 0.96, baseQty: 1, perParentLineUnit: 1 },
      ]),
    ).toBe(38.4);
    expect(
      qtyPerTop([
        { qtyPerUnit: 40, baseQty: 1, perParentLineUnit: 1 },
        { qtyPerUnit: 0.96, baseQty: 1, perParentLineUnit: null },
      ]),
    ).toBeNull();
  });

  const line: BomLineDraft = {
    componentProductId: "rm",
    stepId: null,
    lineUse: "consumed",
    isPrimaryOutput: null,
    qtyPerUnit: 700,
    scrapFactor: 0.02,
    dispenseToleranceType: null,
    dispenseToleranceValue: null,
  };
  const types: Record<string, string> = {
    rm: "raw_material",
    sf: "semi_finished",
    cs: "consumable",
  };
  const typeOf = (id: string) => types[id];
  const draft = { productType: "finished_good", baseQty: 1000, isPhantom: false, lines: [line] };

  it("refuses a zero quantity or recipe base (WMS-002 AC-2, rule 6)", () => {
    expect(bomDraftError(draft, typeOf, new Set())).toBeNull();
    expect(
      bomDraftError({ ...draft, lines: [{ ...line, qtyPerUnit: 0 }] }, typeOf, new Set()),
    ).toEqual({
      kind: "qty_not_positive",
    });
    expect(bomDraftError({ ...draft, baseQty: 0 }, typeOf, new Set())).toEqual({
      kind: "base_qty_not_positive",
    });
  });

  it("allows phantom only on a semi-finished product (WMS-002 AC-13)", () => {
    expect(bomDraftError({ ...draft, isPhantom: true }, typeOf, new Set())).toEqual({
      kind: "phantom_not_semi",
    });
    expect(
      bomDraftError({ ...draft, productType: "semi_finished", isPhantom: true }, typeOf, new Set()),
    ).toBeNull();
  });

  it("checks entry steps and produced lines (WMS-002 rule 8)", () => {
    expect(
      bomDraftError({ ...draft, lines: [{ ...line, stepId: "s9" }] }, typeOf, new Set(["s1"])),
    ).toEqual({ kind: "entry_step_unknown" });
    const produced = { ...line, lineUse: "produced" as const, componentProductId: "sf" };
    expect(
      bomDraftError(
        { ...draft, lines: [{ ...produced, componentProductId: "rm" }] },
        typeOf,
        new Set(),
      ),
    ).toEqual({ kind: "produced_not_semi" });
    expect(bomDraftError({ ...draft, lines: [produced] }, typeOf, new Set())).toEqual({
      kind: "primary_output_count",
      stepId: "",
    });
    expect(
      bomDraftError(
        { ...draft, lines: [{ ...produced, isPrimaryOutput: true }] },
        typeOf,
        new Set(),
      ),
    ).toBeNull();
  });

  it("refuses a tolerance on a consumable or bad values (WMS-002 AC-18)", () => {
    const tol = { dispenseToleranceType: "percent" as const, dispenseToleranceValue: 1 };
    expect(
      bomDraftError(
        { ...draft, lines: [{ ...line, ...tol, componentProductId: "cs" }] },
        typeOf,
        new Set(),
      ),
    ).toEqual({ kind: "tolerance_not_allowed" });
    expect(
      bomDraftError(
        { ...draft, lines: [{ ...line, ...tol, dispenseToleranceValue: 100 }] },
        typeOf,
        new Set(),
      ),
    ).toEqual({ kind: "tolerance_percent" });
    expect(
      bomDraftError(
        { ...draft, lines: [{ ...line, ...tol, dispenseToleranceValue: null }] },
        typeOf,
        new Set(),
      ),
    ).toEqual({ kind: "tolerance_value" });
  });

  it("retires the version a release follows and refuses other overlaps (WMS-002 AC-4, AC-5)", () => {
    const v2 = { id: "v2", status: "released", validFrom: "2026-01-01", validTo: null };
    expect(releasePlan({ validFrom: "2026-07-01", validTo: null }, [v2])).toEqual({
      retire: [{ id: "v2", validTo: "2026-07-01" }],
    });
    expect(releasePlan({ validFrom: "2025-12-01", validTo: null }, [v2])).toEqual({
      overlap: { validFrom: "2026-01-01", validTo: null },
    });
    expect(
      releasePlan({ validFrom: "2026-07-01", validTo: null }, [{ ...v2, status: "draft" }]),
    ).toEqual({ retire: [] });
  });

  it("refuses a step that breaks the step rules (WMS-003 rules 4, 12, AC-20, AC-26, AC-28)", () => {
    const step: StepDraft = {
      stepName: "Mix",
      workUnitId: null,
      requiredWorkUnitClassId: "mixer",
      cycleTimeValue: 600,
      standardSpeedValue: null,
      standardSetupTime: null,
      setupTimeConversionId: null,
      plannedShrinkage: 0.04,
      yieldMinPct: 93,
      yieldMaxPct: 97,
      maxHoldTime: 2,
      holdTimeConversionId: "tc-3",
    };
    expect(stepError(step)).toBeNull();
    expect(stepError({ ...step, stepName: " " })).toBe("step_name_required");
    expect(stepError({ ...step, workUnitId: "wu-1" })).toBe("station_or_class");
    expect(stepError({ ...step, requiredWorkUnitClassId: null })).toBe("station_or_class");
    expect(stepError({ ...step, cycleTimeValue: 0 })).toBe("cycle_not_positive");
    expect(stepError({ ...step, standardSetupTime: 15 })).toBe("setup_unit_required");
    expect(stepError({ ...step, plannedShrinkage: 1 })).toBe("shrinkage_range");
    expect(stepError({ ...step, yieldMinPct: 98, yieldMaxPct: 95 })).toBe("yield_range");
    expect(stepError({ ...step, holdTimeConversionId: null })).toBe("hold_time");
  });

  it("tells structural from dated detail edits (WMS-003 AC-29)", () => {
    const current = {
      instructions: [
        { instructionId: "i1", instructionText: "Add water", requiresConfirmation: false },
        { instructionId: "i2", instructionText: "Add flour", requiresConfirmation: false },
      ],
      checks: [{ checkId: "c1", minValue: 245 }],
    };
    expect(detailChange(current, current)).toBe("none");
    const corrected = [
      current.instructions[0],
      { ...current.instructions[1], instructionText: "Add flour and fat" },
    ];
    expect(detailChange(current, { ...current, instructions: corrected })).toBe("standard");
    expect(
      detailChange(current, { ...current, instructions: [...current.instructions].reverse() }),
    ).toBe("structural");
    expect(
      detailChange(current, {
        ...current,
        instructions: [
          ...current.instructions,
          { instructionText: "Scrape", requiresConfirmation: true },
        ],
      }),
    ).toBe("structural");
    expect(detailChange(current, { ...current, checks: [{ checkId: "c1", minValue: 240 }] })).toBe(
      "standard",
    );
    expect(detailChange(current, { ...current, checks: [] })).toBe("structural");
  });

  it("clears range and unit on pass/fail and note checks (WMS-003 rule 18)", () => {
    const check: CheckDraft = {
      checkName: " Seal ",
      valueType: "pass_fail",
      targetValue: 1,
      minValue: 0,
      maxValue: 2,
      uomId: "uom-1",
      frequencyType: "once",
      frequencyIntervalValue: 15,
      frequencyIntervalConversionId: "tc-2",
      isCritical: true,
    };
    expect(cleanCheck(check)).toEqual({
      ...check,
      checkName: "Seal",
      targetValue: null,
      minValue: null,
      maxValue: null,
      uomId: null,
      frequencyIntervalValue: null,
      frequencyIntervalConversionId: null,
    });
  });

  it("has one unit-weight formula for steps and rejects (WMS-003 AC-22)", () => {
    expect(round2(weightLeavingStep(0.96, [0.04, 0])!)).toBe(1);
    expect(weightLeavingStep(0.96, [1])).toBeNull();
  });
});
