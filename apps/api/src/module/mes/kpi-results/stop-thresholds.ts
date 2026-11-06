// PRD-003 US-FND-KPI-006 step 2 / CFG-001 "stop thresholds" (K-6, PO
// 2026-10-01): how long a stalled `total` counter has paused decides what it
// is — no stop, a small stop (Performance loss) or real downtime
// (Availability loss). Two whole-second values, each effective-dated and
// looked up on its own: work unit → work center → site → global default.
// Pure, no store access.
//
// Not wired yet: where the values are stored is open (Q-32, F-12 has no
// entity model), so nothing saves or reads them, and stall detection itself
// (KPI-006 steps 1, 3–5) needs ASSET_STATE_LOG, which no repo serves (B5).
// Do not add threshold columns to WORK_CENTER or WORK_UNIT (F-12).

/** The two stop thresholds, in whole seconds. */
export interface StopThresholds {
  /** `min_stop_seconds` — a shorter stall is not a stop event. */
  minStopSeconds: number;
  /** `small_stop_max_seconds` — a longer stall is real downtime. */
  smallStopMaxSeconds: number;
}

/** KPI-006 rule 2 / CFG-001: the global defaults (60 s / 300 s). */
export const DEFAULT_STOP_THRESHOLDS: StopThresholds = {
  minStopSeconds: 60,
  smallStopMaxSeconds: 300,
};

/**
 * `none` — no event, the time stays inside APT as speed loss;
 * `small_stop` — Performance loss, does not reduce PBT;
 * `downtime` — real downtime, Availability loss (planned or unplanned from
 * the matched reason; unlabelled = unplanned).
 */
export type StallBucket = "none" | "small_stop" | "downtime";

/**
 * KPI-006 step 2 / rule 3: bucket a stall by its duration.
 *   stall < min_stop_seconds                          → none
 *   min_stop_seconds ≤ stall ≤ small_stop_max_seconds → small_stop
 *   stall > small_stop_max_seconds                    → downtime
 * Exactly at either threshold is a small stop ("from … up to", F-12).
 */
export function bucketStall(stallSeconds: number, thresholds: StopThresholds): StallBucket {
  if (stallSeconds < thresholds.minStopSeconds) return "none";
  if (stallSeconds <= thresholds.smallStopMaxSeconds) return "small_stop";
  return "downtime";
}

/** The levels a stop threshold can be set at (F-12: only these four). */
export type StopThresholdLevel = "work_unit" | "work_center" | "site" | "default";

export type StopThresholdKey = "min_stop_seconds" | "small_stop_max_seconds";

/** One recorded value at one level, in force from `validFrom` (a business date). */
export interface StopThresholdValue {
  key: StopThresholdKey;
  level: Exclude<StopThresholdLevel, "default">;
  /** The work unit, work center or site id. */
  scopeId: string;
  /** Whole seconds. */
  value: number;
  /** ISO date; the latest one on or before the business date is in force. */
  validFrom: string;
}

/** Where to look, most specific first. Leave out the levels below the one being resolved. */
export interface StopThresholdScope {
  workUnitId?: string;
  workCenterId?: string;
  siteId?: string;
}

export interface ResolvedThreshold {
  value: number;
  /** CFG-001 rule 1: the value in force shows which level it came from. */
  from: StopThresholdLevel;
}

export interface ResolvedStopThresholds {
  minStopSeconds: ResolvedThreshold;
  smallStopMaxSeconds: ResolvedThreshold;
}

/** The value one level has in force on `businessDate`, or undefined when it sets none. */
function valueAt(
  values: ReadonlyArray<StopThresholdValue>,
  key: StopThresholdKey,
  level: StopThresholdValue["level"],
  scopeId: string | undefined,
  businessDate: string,
): number | undefined {
  if (scopeId === undefined) return undefined;
  let best: StopThresholdValue | undefined;
  for (const v of values) {
    if (v.key !== key || v.level !== level || v.scopeId !== scopeId) continue;
    if (v.validFrom > businessDate) continue;
    if (best === undefined || v.validFrom >= best.validFrom) best = v;
  }
  return best?.value;
}

function resolveOne(
  values: ReadonlyArray<StopThresholdValue>,
  key: StopThresholdKey,
  scope: StopThresholdScope,
  businessDate: string,
  fallback: number,
): ResolvedThreshold {
  const chain: Array<[StopThresholdValue["level"], string | undefined]> = [
    ["work_unit", scope.workUnitId],
    ["work_center", scope.workCenterId],
    ["site", scope.siteId],
  ];
  for (const [level, scopeId] of chain) {
    const value = valueAt(values, key, level, scopeId, businessDate);
    if (value !== undefined) return { value, from: level };
  }
  return { value: fallback, from: "default" };
}

/**
 * KPI-006 rule 2 / CFG-001: the thresholds in force for a work unit on the
 * shift's `business_date`. Each value is looked up on its own, first match
 * wins: work unit → work center → site → global default — so a work unit may
 * override one value and inherit the other (AC-11). Effective-dated: a shift
 * uses the values valid on its business date, so a later change never
 * recalculates a closed shift (AC-12).
 */
export function resolveStopThresholds(
  values: ReadonlyArray<StopThresholdValue>,
  scope: StopThresholdScope,
  businessDate: string,
): ResolvedStopThresholds {
  return {
    minStopSeconds: resolveOne(
      values,
      "min_stop_seconds",
      scope,
      businessDate,
      DEFAULT_STOP_THRESHOLDS.minStopSeconds,
    ),
    smallStopMaxSeconds: resolveOne(
      values,
      "small_stop_max_seconds",
      scope,
      businessDate,
      DEFAULT_STOP_THRESHOLDS.smallStopMaxSeconds,
    ),
  };
}

/** The plain pair, for `bucketStall`. */
export function thresholdValues(resolved: ResolvedStopThresholds): StopThresholds {
  return {
    minStopSeconds: resolved.minStopSeconds.value,
    smallStopMaxSeconds: resolved.smallStopMaxSeconds.value,
  };
}

/** CFG-001 save refusal text, word for word. */
export const INVALID_STOP_THRESHOLDS_MESSAGE =
  "Minimum stop must be more than 0 and less than the small-stop limit.";

export type StopThresholdSaveCheck =
  | { ok: true }
  | { ok: false; code: "not_whole_seconds" | "invalid_pair"; message?: string };

/**
 * CFG-001: on save, the pair that will apply at that level (its own values
 * plus what it inherits) must satisfy `0 < min_stop_seconds <
 * small_stop_max_seconds`. Values are whole seconds. `scope` names the level
 * being saved and the levels above it (e.g. a work center save passes its
 * work center and site, no work unit).
 */
export function checkStopThresholdSave(
  existing: ReadonlyArray<StopThresholdValue>,
  candidate: StopThresholdValue,
  scope: StopThresholdScope,
): StopThresholdSaveCheck {
  if (!Number.isInteger(candidate.value)) return { ok: false, code: "not_whole_seconds" };
  const pair = thresholdValues(
    resolveStopThresholds([...existing, candidate], scope, candidate.validFrom),
  );
  if (pair.minStopSeconds > 0 && pair.minStopSeconds < pair.smallStopMaxSeconds) {
    return { ok: true };
  }
  return { ok: false, code: "invalid_pair", message: INVALID_STOP_THRESHOLDS_MESSAGE };
}
