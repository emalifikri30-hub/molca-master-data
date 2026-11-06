// Server copy of apps/web/src/features/kpi/reject-conversion.ts (same rules).
// Keep the two in step.
// PRD-003 KPI-003 "Reject entered manually, in any unit" (F-07, PO 2026-09-30
// and 2026-10-01, Q-28): a manual reject row (WORK_ORDER_OPERATION_DEFECT.qty
// in its uom_id) is brought to the step's OPERATION.uom_id, then to reject
// time with that step's cycle time. Rejects of several work units add up in
// time, never in kg (KPI-003 rule 13 / KPI-004 rule 8). Pure, no store access.
//
// Not wired into KPI_RESULT yet: Planning's defect rows carry no uom_id.

import { conversionPath } from "../products/uom-conversion.js";
import { weightLeavingStep } from "../work-master/work-master-rules.js";
import { quality, unitsToSeconds } from "./kpi-engine.js";

import type { ConversionRow } from "../products/uom-conversion.js";
import type { ResolvedQuality } from "./kpi-engine.js";

/** Why a manual reject can't be converted — never a guessed number (F-07 edge cases). */
export type RejectCannotCompute =
  | { reason: "weight_per_unit_missing" }
  | { reason: "no_conversion_for_unit"; fromUomId: string; toUomId: string; productId: string };

/** One PRODUCT_UOM_MEASUREMENT row (F-06 §9.2.1, per-unit gross, 2026-10-05). */
export interface MeasurementRow {
  uomId: string;
  /** Gross mass of one unit in `uom_id`, in `PRODUCT_DETAIL.weight_uom_id`. */
  standardWeight: number;
  validFrom?: string;
  validTo?: string | null;
}

export interface RejectStep {
  businessDate: string;
  product: { id: string; baseUomId: string };
  /** The product's PRODUCT_UOM_CONVERSION rows (the conversion path for counts). */
  conversions: ReadonlyArray<ConversionRow>;
  /** OPERATION.uom_id — Quality calculates in this unit. */
  operationUomId: string;
  /** True for a unit in the mass measurement group. */
  isMass: (uomId: string) => boolean;
  /**
   * Mass → mass (kg → g). F-05 has no factor between mass units, so the
   * caller supplies it; null = not convertible.
   */
  convertMass: (qty: number, fromUomId: string, toUomId: string) => number | null;
  /**
   * The product's PRODUCT_UOM_MEASUREMENT rows in force on `business_date`
   * (KPI-003, per-unit gross mass since 2026-10-05 — a count unit such as
   * `punch` declares its own row, e.g. `punch` = 20 g).
   */
  measurements: ReadonlyArray<MeasurementRow>;
  /** PRODUCT_DETAIL.weight_uom_id — the mass unit the measurement rows are in. */
  weightUomId: string;
  /**
   * The unit the routing outputs at its end (the finished unit). Its row is
   * where the shrinkage derivation starts; any other unit is weighed at its
   * own step, from its own row.
   */
  finishedUomId: string;
  /** OPERATION.planned_shrinkage (0–1) of each step after this one. */
  laterShrinkage: ReadonlyArray<number>;
  /** OPERATION cycle time in seconds — per unit, or per cycle when batchSize > 1. */
  cycleTimeSeconds?: number;
  batchSize?: number | null;
}

/** The measurement row of one unit in force on `date`; null = none. */
function rowOn(
  measurements: ReadonlyArray<MeasurementRow>,
  uomId: string,
  date: string,
): MeasurementRow | undefined {
  return measurements.find(
    (m) =>
      m.uomId === uomId && (m.validFrom ?? "") <= date && (m.validTo == null || m.validTo > date),
  );
}

/**
 * Weight of one OPERATION.uom_id unit leaving this step, in a mass unit
 * (KPI-003, per-unit measurement 2026-10-05): the `standard_weight` of that
 * unit's own `PRODUCT_UOM_MEASUREMENT` row. For the routing's own output unit
 * at an earlier step it is derived from the finished weight and the planned
 * shrinkage of the later steps (F-08 line across work centers) — wet before
 * the shrinkage step, dry after. A count unit produced at one step only (like
 * `punch`) is weighed at that step, from its own row. null = missing — never
 * a guessed number.
 */
export function weightOfOneUnit(step: RejectStep): { value: number; uomId: string } | null {
  const { measurements, operationUomId, businessDate, finishedUomId } = step;
  const row = rowOn(measurements, operationUomId, businessDate);
  if (!row || !(row.standardWeight > 0)) return null;
  if (operationUomId !== finishedUomId) {
    return { value: row.standardWeight, uomId: step.weightUomId };
  }
  // The one unit-weight formula, shared with the routing's derived weight (WMS-003 AC-22).
  const leaving = weightLeavingStep(row.standardWeight, step.laterShrinkage);
  return leaving === null ? null : { value: leaving, uomId: step.weightUomId };
}

export type ConvertedReject =
  | {
      kind: "value";
      /** The reject in OPERATION.uom_id. */
      units: number;
      /** Reject time in seconds; null = "Cycle time missing" (units still shown). */
      seconds: number | null;
    }
  | ({ kind: "cannot_compute" } & RejectCannotCompute);

/**
 * KPI-003 rule 12: same unit → none; another count/pack unit → the product's
 * conversion on business_date; a weight → ÷ weight of one unit at THIS step
 * (the unit's own `PRODUCT_UOM_MEASUREMENT` row, per-unit gross 2026-10-05).
 * Then `reject time = units × cycle time (÷ batch_size when per cycle)`.
 */
export function convertReject(
  entry: { qty: number; uomId: string },
  step: RejectStep,
): ConvertedReject {
  let units: number;
  if (entry.uomId === step.operationUomId) {
    units = entry.qty;
  } else if (step.isMass(entry.uomId) && !step.isMass(step.operationUomId)) {
    const w = weightOfOneUnit(step);
    if (!w) return { kind: "cannot_compute", reason: "weight_per_unit_missing" };
    const qtyInW = step.convertMass(entry.qty, entry.uomId, w.uomId);
    if (qtyInW === null) return noConversion(entry.uomId, step);
    units = qtyInW / w.value;
  } else {
    const path = conversionPath(
      step.conversions,
      step.product,
      entry.uomId,
      step.operationUomId,
      step.businessDate,
    );
    if (!path) return noConversion(entry.uomId, step);
    units = entry.qty * path.factor;
  }
  return {
    kind: "value",
    units,
    seconds: unitsToSeconds(units, step.cycleTimeSeconds, step.batchSize),
  };
}

function noConversion(fromUomId: string, step: RejectStep): ConvertedReject {
  return {
    kind: "cannot_compute",
    reason: "no_conversion_for_unit",
    fromUomId,
    toUomId: step.operationUomId,
    productId: step.product.id,
  };
}

/**
 * KPI-003 rule 12 / AC-16: a converted reject larger than the step's counted
 * output for the period is refused ("Reject is more than this shift's output" —
 * no UX 07 key yet). The refusal belongs where the reject is entered.
 */
export function rejectExceedsOutput(rejectUnits: number, countedOutput: number): boolean {
  return rejectUnits > countedOutput;
}

/**
 * KPI-003 path 3 (Q-28): the machine's (or job's) total with manual reject
 * rows, each already converted to OPERATION.uom_id. Any manual input marks the
 * result `source_tier = manual`, the lowest tier (AC-18).
 */
export function qualityFromManualReject(
  total: number,
  rejects: ReadonlyArray<ConvertedReject>,
): ResolvedQuality & { sourceTier: "manual" } {
  const failed = rejects.find((r) => r.kind === "cannot_compute");
  if (failed) {
    return {
      result: { kind: "cannot_compute", reason: failed.reason },
      total,
      sourceTier: "manual",
    };
  }
  const reject = rejects.reduce((n, r) => n + (r.kind === "value" ? r.units : 0), 0);
  const q = quality({ total, reject });
  if (q.result.kind === "value") q.result.note = "path_manual_reject";
  return { ...q, sourceTier: "manual" };
}

/**
 * KPI-003 rule 13 / KPI-004 rule 8: rejects of several work units combine in reject
 * time, each from its own step — never kg. A part without a time leaves the
 * sum partial; it is not dropped silently.
 */
export function rollUpRejectTime(parts: ReadonlyArray<ConvertedReject>): {
  seconds: number;
  partial: boolean;
} {
  let seconds = 0;
  let partial = false;
  for (const p of parts) {
    if (p.kind === "value" && p.seconds !== null) seconds += p.seconds;
    else partial = true;
  }
  return { seconds, partial };
}
