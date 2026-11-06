// PRD-003 Work Master (WMS-002 BOM, WMS-003 routing & operations) — pure
// rules, kept apart from the store so they can be tested. All dates are ISO
// `YYYY-MM-DD`; `validTo` is the last day a row is in effect (inclusive),
// null = open-ended.
//
// Copied to apps/web/src/features/work-master/rules.ts. Keep the copies in step.

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

interface Dated {
  validFrom: string;
  validTo: string | null;
}

/** Half-open ranges, `[valid_from, valid_to)` (F-00, PO 2026-10-02): touching rows don't overlap. */
export function overlaps(a: Dated, b: Dated): boolean {
  const aEnd = a.validTo ?? "9999-12-31";
  const bEnd = b.validTo ?? "9999-12-31";
  return a.validFrom < bEnd && b.validFrom < aEnd;
}

/** The row in effect on `date` (WMS-003 §4): `valid_from ≤ date < valid_to` (half-open). */
export function inEffect<T extends Dated>(rows: ReadonlyArray<T>, date: string): T | undefined {
  return rows.find((r) => r.validFrom <= date && (r.validTo === null || r.validTo > date));
}

const round = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * WMS-002 §4 planned input (PO 2026-09-30): the net quantity of a component
 * per 1 unit of the product, grown by its scrap factor, then divided by
 * (1 − shrinkage) of the line's entry step and each later step.
 * `shrinkages` are those steps' planned shrinkage, in order (null = 0).
 * Example (AC-12): base 1,000 kg, A 700 kg, scrap 0.02, Mixer 1 0.05 →
 * 0.751579 kg per kg of mix, 75.16 kg for 100 kg.
 */
export function plannedInput(
  line: { qtyPerUnit: number; scrapFactor: number },
  baseQty: number,
  shrinkages: ReadonlyArray<number | null>,
): number {
  const kept = shrinkages.reduce<number>((acc, s) => acc * (1 - (s ?? 0)), 1);
  return round(((line.qtyPerUnit / baseQty) * (1 + line.scrapFactor)) / kept);
}

/**
 * The steps whose shrinkage a line pays for: its entry step and every later
 * used step, in step order. No entry step → the first step, so all of them.
 */
export function shrinkagesFrom<S extends { stepId: string; plannedShrinkage: number | null }>(
  stepsInOrder: ReadonlyArray<S>,
  entryStepId: string | null,
): Array<number | null> {
  const at = entryStepId === null ? 0 : stepsInOrder.findIndex((s) => s.stepId === entryStepId);
  return stepsInOrder.slice(Math.max(at, 0)).map((s) => s.plannedShrinkage);
}

export type ToleranceError = "tolerance_value" | "tolerance_percent" | "tolerance_absolute";

/** WMS-002 rule 10: value required with a type; percent in (0, 100); absolute above 0. */
export function toleranceError(
  type: "percent" | "absolute" | null,
  value: number | null,
): ToleranceError | null {
  if (type === null) return null;
  if (value === null || !Number.isFinite(value)) return "tolerance_value";
  if (type === "percent" && !(value > 0 && value < 100)) return "tolerance_percent";
  if (type === "absolute" && !(value > 0)) return "tolerance_absolute";
  return null;
}

/**
 * WMS-002 §4 dispensing tolerance: target ± tolerance, symmetric (W-12).
 * AC-16: 75.16 kg, ±1% → 74.41–75.91 kg. AC-17: ±0.2 kg → 74.96–75.36 kg.
 */
export function toleranceRange(
  target: number,
  type: "percent" | "absolute",
  value: number,
): { min: number; max: number } {
  const delta = type === "percent" ? (target * value) / 100 : value;
  return { min: round(target - delta), max: round(target + delta) };
}

/** WMS-003 rule 13: from 0 to less than 1 (stored as a fraction). */
export function shrinkageOk(value: number | null): boolean {
  return value === null || (value >= 0 && value < 1);
}

/** WMS-003 §4: expected yield at standard = 100 × (1 − planned shrinkage). */
export function expectedYield(plannedShrinkage: number | null): number {
  return round(100 * (1 - (plannedShrinkage ?? 0)), 4);
}

/** WMS-003 rule 19: `0 ≤ min ≤ max`; either may be set alone. */
export function yieldRangeOk(min: number | null, max: number | null): boolean {
  if (min !== null && min < 0) return false;
  if (max !== null && max < 0) return false;
  return min === null || max === null || min <= max;
}

/** WMS-003 rule 19 / AC-25: a range that leaves out the expected yield warns, never blocks. */
export function yieldWarning(
  plannedShrinkage: number | null,
  min: number | null,
  max: number | null,
): { expected: number } | null {
  const expected = expectedYield(plannedShrinkage);
  if (min === null && max === null) return null;
  const outside = (min !== null && expected < min) || (max !== null && expected > max);
  return outside ? { expected } : null;
}

export type YieldResult =
  | { kind: "value"; yieldPct: number; theoretical: number }
  | { kind: "cannot_calculate" }
  /** W-16: lines dispensed out of recipe ratio — `TBD`, needs PO confirmation. */
  | { kind: "out_of_ratio"; perLine: Array<number> };

/**
 * WMS-003 §4 yield of a step. `inputs` are the actual quantities in, each
 * with its net ratio (line qty ÷ recipe base, already in the step's output
 * unit). AC-24: A 73.5 kg at 0.7, B 31.5 kg at 0.3 → 105 kg; 100 kg out →
 * 95.2%. Measured by PRODUCTION; FOUNDATION only holds the range.
 */
export function stepYield(
  actualOutput: number,
  inputs: ReadonlyArray<{ actualQty: number; netRatio: number }>,
): YieldResult {
  const perLine = inputs.map((i) => i.actualQty / i.netRatio);
  if (perLine.length === 0 || perLine.some((x) => !(x > 0) || !Number.isFinite(x))) {
    return { kind: "cannot_calculate" };
  }
  if (perLine.some((x) => Math.abs(x - perLine[0]) > 1e-6)) {
    return { kind: "out_of_ratio", perLine: perLine.map((x) => round(x)) };
  }
  const theoretical = round(perLine[0]);
  return { kind: "value", theoretical, yieldPct: round((100 * actualOutput) / theoretical, 1) };
}

/**
 * WMS-003 §4 hold time: the steps the limit applies to. With any "Waits
 * for" row in the version, every step waiting for this one (AC-27);
 * otherwise the next used step in step order. The last step has none.
 */
export function holdSuccessors(
  stepId: string,
  stepsInOrder: ReadonlyArray<{ stepId: string }>,
  dependencies: ReadonlyArray<{ stepId: string; predecessorStepId: string }>,
): Array<string> {
  if (dependencies.length > 0) {
    return dependencies.filter((d) => d.predecessorStepId === stepId).map((d) => d.stepId);
  }
  const at = stepsInOrder.findIndex((s) => s.stepId === stepId);
  const next = stepsInOrder[at + 1];
  return at >= 0 && next ? [next.stepId] : [];
}

/**
 * WMS-003 rule 21 / AC-37: the end steps of a version — the steps no other
 * step waits for, in step order. With any "Waits for" row, computed from the
 * rows; with none, the steps run in step order and only the last one ends.
 * A version must have exactly one (refused on save, never on read).
 */
export function endSteps<S extends { stepId: string; stepNumber: number }>(
  steps: ReadonlyArray<S>,
  dependencies: ReadonlyArray<{ stepId: string; predecessorStepId: string }>,
): Array<S> {
  const inOrder = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  if (dependencies.length === 0) return inOrder.slice(-1);
  const waitedFor = new Set(dependencies.map((d) => d.predecessorStepId));
  return inOrder.filter((s) => !waitedFor.has(s.stepId));
}

/**
 * WMS-003 rule 14 / AC-21: the steps that wait for each other in a loop,
 * or null. Steps are returned in the order the loop is walked.
 */
export function findLoop(
  dependencies: ReadonlyArray<{ stepId: string; predecessorStepId: string }>,
): Array<string> | null {
  const waitsFor = (id: string) =>
    dependencies.filter((d) => d.stepId === id).map((d) => d.predecessorStepId);
  const done = new Set<string>();
  const walk = (id: string, path: Array<string>): Array<string> | null => {
    const at = path.indexOf(id);
    if (at >= 0) return path.slice(at);
    if (done.has(id)) return null;
    for (const next of waitsFor(id)) {
      const found = walk(next, [...path, id]);
      if (found) return found;
    }
    done.add(id);
    return null;
  };
  for (const d of dependencies) {
    const found = walk(d.stepId, []);
    if (found) return found;
  }
  return null;
}

/**
 * WMS-003 §4 weight of one unit leaving step k = the finished unit's
 * PRODUCT_UOM_MEASUREMENT.standard_weight (per-unit gross, 2026-10-05) ÷
 * Π (1 − shrinkage of each later step). "Wet" while a later step still
 * loses mass, "dry" after. AC-22: 0.96 g, Oven 0.04 → Mold 1.00 g (wet),
 * Oven and Cooling 0.96 g (dry). A step whose own unit is a count unit
 * produced at one step only (like `punch`) is weighed at that step, from
 * that unit's own measurement row — not from this derivation.
 */
export function unitWeights(
  standardWeight: number,
  shrinkagesInOrder: ReadonlyArray<number | null>,
): Array<{ weight: number; wet: boolean }> {
  return shrinkagesInOrder.map((_, k) => {
    const later = shrinkagesInOrder.slice(k + 1);
    const weight = weightLeavingStep(standardWeight, later);
    return { weight: weight === null ? NaN : round(weight), wet: later.some((s) => (s ?? 0) > 0) };
  });
}

/**
 * The one unit-weight formula (F-08 line across work centers), also read by
 * the KPI reject conversion: `PRODUCT_UOM_MEASUREMENT.standard_weight
 * (finished unit's row) ÷ Π (1 − shrinkage of each later step)`, not
 * rounded. null when the later steps keep nothing.
 */
export function weightLeavingStep(
  standardWeight: number,
  laterShrinkages: ReadonlyArray<number | null>,
): number | null {
  const kept = laterShrinkages.reduce<number>((acc, s) => acc * (1 - (s ?? 0)), 1);
  return kept > 0 ? standardWeight / kept : null;
}

/**
 * WMS-003 AC-19: pre-fill one step per work unit of the work center, in
 * EQUIPMENT_FLOW order (from → to chains). Work units outside any flow
 * follow, by code.
 */
export function flowOrder<U extends { id: string; code: string }>(
  units: ReadonlyArray<U>,
  flows: ReadonlyArray<{ fromWorkUnitId: string; toWorkUnitId: string }>,
): Array<U> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const inFlow = flows.filter((f) => byId.has(f.fromWorkUnitId) && byId.has(f.toWorkUnitId));
  const hasPredecessor = new Set(inFlow.map((f) => f.toWorkUnitId));
  const ordered: Array<U> = [];
  const visit = (id: string) => {
    if (ordered.some((u) => u.id === id)) return;
    ordered.push(byId.get(id)!);
    for (const f of inFlow.filter((x) => x.fromWorkUnitId === id)) visit(f.toWorkUnitId);
  };
  const starts = [...new Set(inFlow.map((f) => f.fromWorkUnitId))].filter(
    (id) => !hasPredecessor.has(id),
  );
  for (const id of starts) visit(id);
  const rest = units
    .filter((u) => !ordered.includes(u))
    .sort((a, b) => a.code.localeCompare(b.code));
  return [...ordered, ...rest];
}

/**
 * WMS-003 §4 cycle_time_ideal: the station the job ran on uses its
 * override in effect on the business date, else the step's default
 * (AC-18: Mixer 1 600 s, Mixer 2 540 s).
 */
export function cycleTimeIdeal(
  step: { cycleTimeValue: number | null },
  overrides: ReadonlyArray<{ workUnitId: string; cycleTimeValue: number | null } & Dated>,
  workUnitId: string,
  date: string,
): number | null {
  const own = inEffect(
    overrides.filter((o) => o.workUnitId === workUnitId),
    date,
  );
  return own?.cycleTimeValue ?? step.cycleTimeValue;
}

export type CheckDraft = {
  checkName: string;
  valueType: "numeric" | "pass_fail" | "text";
  targetValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  uomId: string | null;
  frequencyType: "once" | "start_middle_end" | "interval";
  frequencyIntervalValue: number | null;
  frequencyIntervalConversionId: string | null;
  isCritical: boolean;
};

export type CheckError =
  | "check_name_required"
  | "check_duplicate"
  | "check_no_limit"
  | "check_range"
  | "check_unit"
  | "check_interval"
  | "check_critical_note";

/** WMS-003 rule 18 / AC-30: the first thing wrong with one check of a step, or null. */
export function checkError(
  check: CheckDraft,
  others: ReadonlyArray<{ checkName: string }>,
): CheckError | null {
  const name = check.checkName.trim();
  if (name === "") return "check_name_required";
  if (others.some((o) => o.checkName.trim().toLowerCase() === name.toLowerCase())) {
    return "check_duplicate";
  }
  if (check.valueType === "numeric") {
    const { minValue: min, targetValue: target, maxValue: max } = check;
    if (min === null && max === null) return "check_no_limit";
    if (
      (min !== null && target !== null && min > target) ||
      (target !== null && max !== null && target > max) ||
      (min !== null && max !== null && min > max)
    ) {
      return "check_range";
    }
    if (!check.uomId) return "check_unit";
  }
  if (
    check.frequencyType === "interval" &&
    !(
      check.frequencyIntervalValue !== null &&
      check.frequencyIntervalValue > 0 &&
      check.frequencyIntervalConversionId
    )
  ) {
    return "check_interval";
  }
  if (check.valueType === "text" && check.isCritical) return "check_critical_note";
  return null;
}

/**
 * WMS-003 rule 18: range and unit stay empty for pass/fail and text checks,
 * and the interval fields only belong to "Every …". Cleared, never refused
 * (no screen text exists for that), so a hidden field can't linger.
 */
export function cleanCheck<C extends CheckDraft>(check: C): C {
  const numeric = check.valueType === "numeric";
  const interval = check.frequencyType === "interval";
  return {
    ...check,
    checkName: check.checkName.trim(),
    targetValue: numeric ? check.targetValue : null,
    minValue: numeric ? check.minValue : null,
    maxValue: numeric ? check.maxValue : null,
    uomId: numeric ? check.uomId : null,
    frequencyIntervalValue: interval ? check.frequencyIntervalValue : null,
    frequencyIntervalConversionId: interval ? check.frequencyIntervalConversionId : null,
  };
}

export type StepDraft = {
  stepName: string;
  workUnitId: string | null;
  requiredWorkUnitClassId: string | null;
  cycleTimeValue: number | null;
  standardSpeedValue: number | null;
  standardSetupTime: number | null;
  setupTimeConversionId: string | null;
  plannedShrinkage: number | null;
  yieldMinPct: number | null;
  yieldMaxPct: number | null;
  maxHoldTime: number | null;
  holdTimeConversionId: string | null;
};

export type StepError =
  | "step_name_required"
  | "station_or_class"
  | "cycle_not_positive"
  | "setup_unit_required"
  | "shrinkage_range"
  | "yield_range"
  | "hold_time";

/**
 * WMS-003 rules 4, 12, 13, 19, 20 and AC-3: the first thing wrong with one
 * step, or null. A missing cycle time is not checked here: a step pre-filled
 * from the flow has none yet ("Cycle time missing" on the product list).
 */
export function stepError(step: StepDraft): StepError | null {
  if (step.stepName.trim() === "") return "step_name_required";
  if ((step.workUnitId === null) === (step.requiredWorkUnitClassId === null)) {
    return "station_or_class";
  }
  for (const v of [step.cycleTimeValue, step.standardSpeedValue]) {
    if (v !== null && !(v > 0)) return "cycle_not_positive";
  }
  if (step.standardSetupTime !== null && !step.setupTimeConversionId) return "setup_unit_required";
  if (!shrinkageOk(step.plannedShrinkage)) return "shrinkage_range";
  if (!yieldRangeOk(step.yieldMinPct, step.yieldMaxPct)) return "yield_range";
  if (step.maxHoldTime !== null && !(step.maxHoldTime > 0 && step.holdTimeConversionId)) {
    return "hold_time";
  }
  return null;
}

/**
 * WMS-003 rule 5 / AC-29: adding, removing or re-ordering an instruction, or
 * adding or removing a check, is structural (a new version on a released
 * routing). Changing a text, the confirmation flag or a check's values is a
 * standard edit: a dated row inside the version.
 */
export function detailChange(
  current: {
    instructions: ReadonlyArray<{
      instructionId: string;
      instructionText: string;
      requiresConfirmation: boolean;
    }>;
    checks: ReadonlyArray<{ checkId: string } & Record<string, unknown>>;
  },
  next: {
    instructions: ReadonlyArray<{
      instructionId?: string | null;
      instructionText: string;
      requiresConfirmation: boolean;
    }>;
    checks: ReadonlyArray<{ checkId?: string | null } & Record<string, unknown>>;
  },
): "none" | "standard" | "structural" {
  const ids = (rows: ReadonlyArray<{ instructionId?: string | null }>) =>
    rows.map((r) => r.instructionId ?? "new").join("|");
  const checkIds = (rows: ReadonlyArray<{ checkId?: string | null }>) =>
    rows
      .map((r) => r.checkId ?? "new")
      .sort()
      .join("|");
  if (ids(current.instructions) !== ids(next.instructions)) return "structural";
  if (checkIds(current.checks) !== checkIds(next.checks)) return "structural";
  const textChanged = next.instructions.some((n, i) => {
    const c = current.instructions[i];
    return (
      c.instructionText !== n.instructionText || c.requiresConfirmation !== n.requiresConfirmation
    );
  });
  const checkChanged = next.checks.some((n) => {
    const c = current.checks.find((x) => x.checkId === n.checkId);
    return !c || Object.keys(n).some((k) => k !== "checkId" && n[k] !== c[k]);
  });
  return textChanged || checkChanged ? "standard" : "none";
}

/**
 * WMS-002 rule 2 / WMS-003 rule 7 ("Release"): at most one released version
 * of a flow's BOM (or of a flow's routing per work center) is in force on a
 * date. Releasing `candidate` closes the released version it follows the day
 * before it starts (that one becomes `retired`); any other overlap is
 * refused, naming the range (WMS-002 AC-5).
 */
export function releasePlan<V extends Dated & { id: string; status: string }>(
  candidate: Dated,
  siblings: ReadonlyArray<V>,
):
  | { retire: Array<{ id: string; validTo: string }> }
  | { overlap: { validFrom: string; validTo: string | null } } {
  const retire: Array<{ id: string; validTo: string }> = [];
  for (const s of siblings) {
    if (s.status === "draft" || !overlaps(candidate, s)) continue;
    if (s.status === "released" && s.validFrom < candidate.validFrom) {
      // Half-open: the old version ends on the new one's start (PO 2026-10-02).
      retire.push({ id: s.id, validTo: candidate.validFrom });
    } else {
      return { overlap: { validFrom: s.validFrom, validTo: s.validTo } };
    }
  }
  return { retire };
}

export type BomLineDraft = {
  componentProductId: string;
  stepId: string | null;
  lineUse: "consumed" | "produced";
  isPrimaryOutput: boolean | null;
  qtyPerUnit: number;
  scrapFactor: number;
  dispenseToleranceType: "percent" | "absolute" | null;
  dispenseToleranceValue: number | null;
};

export type BomDraftError =
  | { kind: "base_qty_not_positive" }
  | { kind: "phantom_not_semi" }
  | { kind: "qty_not_positive" }
  | { kind: "scrap_negative" }
  | { kind: "entry_step_unknown" }
  | { kind: "produced_not_semi" }
  | { kind: "tolerance_not_allowed" }
  | { kind: ToleranceError }
  | { kind: "primary_output_count"; stepId: string };

/**
 * WMS-002 rules 5–8 and 10 for one BOM version, or null. `typeOf` gives a
 * component's product type; `stepIds` are the steps of the product's
 * routings (rule 8: an entry step must be one of them). The recipe base
 * unit's conversion path (rule 6) and circular chains (rule 3) need the
 * stores and are checked by the caller.
 */
export function bomDraftError(
  draft: {
    productType: string;
    baseQty: number;
    isPhantom: boolean;
    lines: ReadonlyArray<BomLineDraft>;
  },
  typeOf: (productId: string) => string | undefined,
  stepIds: ReadonlySet<string>,
): BomDraftError | null {
  if (!(draft.baseQty > 0)) return { kind: "base_qty_not_positive" };
  if (draft.isPhantom && draft.productType !== "semi_finished") return { kind: "phantom_not_semi" };
  for (const l of draft.lines) {
    if (!(l.qtyPerUnit > 0)) return { kind: "qty_not_positive" };
    if (l.scrapFactor < 0) return { kind: "scrap_negative" };
    if (l.stepId !== null && !stepIds.has(l.stepId)) return { kind: "entry_step_unknown" };
    const type = typeOf(l.componentProductId);
    if (l.lineUse === "produced" && type !== "semi_finished") return { kind: "produced_not_semi" };
    if (l.dispenseToleranceType !== null && (l.lineUse === "produced" || type === "consumable")) {
      return { kind: "tolerance_not_allowed" };
    }
    const tol = toleranceError(l.dispenseToleranceType, l.dispenseToleranceValue);
    if (tol) return { kind: tol };
  }
  const producedAt = new Map<string, number>();
  for (const l of draft.lines.filter((x) => x.lineUse === "produced")) {
    const key = l.stepId ?? "";
    producedAt.set(key, (producedAt.get(key) ?? 0) + (l.isPrimaryOutput ? 1 : 0));
  }
  for (const [stepId, primaries] of producedAt) {
    if (primaries !== 1) return { kind: "primary_output_count", stepId };
  }
  return null;
}

/**
 * WMS-002 §4 / AC-11, shown on a tree node: the line as a share of its
 * parent's recipe base quantity, only when both are in the same
 * measurement group (after conversion, so `lineQtyInBaseUnit` is in the
 * base quantity's unit). null = not shown.
 */
export function percentOfBatch(
  lineQtyInBaseUnit: number | null,
  baseQty: number,
  sameGroup: boolean,
): number | null {
  if (!sameGroup || lineQtyInBaseUnit === null || !(baseQty > 0)) return null;
  return round((lineQtyInBaseUnit / baseQty) * 100, 4);
}

/**
 * WMS-002 §4 qty_per_top: the quantity per 1 unit of the top product, each
 * line quantity divided by its parent's recipe base quantity, multiplied
 * down the branch. `branch` runs top → node; `perParentLineUnit` is how
 * many of this BOM's base unit make one unit of the line above it (1 for the
 * top line, or when the units match). null anywhere = "No unit conversion".
 * Example: pack base 1: 40 biscuits; biscuit base 1 pc: 0.96 g → 38.4 g.
 */
export function qtyPerTop(
  branch: ReadonlyArray<{ qtyPerUnit: number; baseQty: number; perParentLineUnit: number | null }>,
): number | null {
  let qty = 1;
  for (const b of branch) {
    if (b.perParentLineUnit === null || !(b.baseQty > 0)) return null;
    qty *= b.perParentLineUnit * (b.qtyPerUnit / b.baseQty);
  }
  return round(qty);
}

/**
 * WMS-002 rule 3: the circular chain a new BOM for `productId` with these
 * components would create, e.g. ["A", "B", "A"]; null when there is none.
 * `componentsOf` returns the components of each product's BOM in effect.
 */
export function findCycle(
  productId: string,
  components: ReadonlyArray<string>,
  componentsOf: (productId: string) => ReadonlyArray<string>,
): Array<string> | null {
  const walk = (current: string, path: Array<string>): Array<string> | null => {
    if (current === productId) return [...path, current];
    if (path.includes(current)) return null;
    for (const next of componentsOf(current)) {
      const found = walk(next, [...path, current]);
      if (found) return found;
    }
    return null;
  };
  for (const c of components) {
    const found = walk(c, [productId]);
    if (found) return found;
  }
  return null;
}

/** How many BOM levels sit below `productId` (a warning past 5, WMS-002 §4). */
export function bomDepth(
  productId: string,
  componentsOf: (id: string) => ReadonlyArray<string>,
  seen = new Set<string>(),
): number {
  if (seen.has(productId)) return 0;
  seen.add(productId);
  const children = componentsOf(productId);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => bomDepth(c, componentsOf, new Set(seen))));
}

/**
 * WMS-003 AC-1/AC-4: changing a standard closes the current row on the day
 * the new one starts (half-open, `[valid_from, valid_to)`, PO 2026-10-02). A
 * new row starting after the current row's end would leave dates with no
 * standard — refused, naming the gap (shown as inclusive dates).
 */
export function versionChange(
  current: Dated,
  newValidFrom: string,
): { closeAt: string } | { gap: { from: string; to: string } } | { tooEarly: true } {
  if (newValidFrom <= current.validFrom) return { tooEarly: true };
  if (current.validTo !== null && newValidFrom > current.validTo) {
    return { gap: { from: current.validTo, to: addDays(newValidFrom, -1) } };
  }
  return { closeAt: newValidFrom };
}

export type PerformanceResult = { kind: "value"; performance: number } | { kind: "cannot_compute" };

/**
 * WMS-003 §4: `Performance = (cycle_time_ideal × total_output) / APT`, with
 * the standard in effect on the business date — never the latest one. No
 * standard that day → "cannot be computed", not 0% (AC-5).
 */
export function performanceFor(
  standardSeconds: number | undefined,
  totalOutput: number,
  aptMinutes: number,
): PerformanceResult {
  if (standardSeconds === undefined || standardSeconds <= 0 || aptMinutes <= 0) {
    return { kind: "cannot_compute" };
  }
  return { kind: "value", performance: (standardSeconds * totalOutput) / 60 / aptMinutes };
}
