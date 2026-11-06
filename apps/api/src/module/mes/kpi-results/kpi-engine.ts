// Server copy of apps/web/src/features/kpi/engine.ts (same rules); the API
// serves KPI_RESULT to the Production apps. Keep the two in step.
// PRD-003 KPI calculations (F-07, ISO 22400-2) for the stories that can be
// built now: KPI-002 Performance, 003 Quality, 009 Scrap, 010 Rework, 011
// Throughput, 012 Production process ratio, 013 Fall-off. Pure functions:
// a result is a value, "no data" (an input is missing) or "cannot compute"
// (the inputs exist but the maths is undefined). Never 0% in their place.
//
// Availability, OEE and MTTR/MTBF (KPI-001/004/005) wait on ASSET_STATE_LOG
// (B5) and aren't computed here; APT is an input the caller supplies. When that
// branch lands, `break-minutes.ts` is its K-28 input: a stop's minutes inside a
// break are planned, the log is never rewritten.

export type KpiResult =
  | {
      kind: "value";
      value: number;
      /** Out of the plausible range (e.g. > 100%) — shown, flagged, never clamped. */
      anomaly?: string;
      /** Some inputs missing; the value covers what exists. */
      partial?: boolean;
      /** Computed on an operation that hasn't ended (KPI-011 AC-3). */
      provisional?: boolean;
      /** Which path filled the inputs (KPI-003 AC-1). */
      note?: string;
    }
  | { kind: "no_data"; reason: string }
  | { kind: "cannot_compute"; reason: string };

const pct = (n: number) => Math.round(n * 1000) / 10;

// ---------------------------------------------------------------- Performance

export interface Segment {
  sku: string;
  /** Cycles of the operation (see `cyclesFromCount`), or items when batch size is 1. */
  output: number;
  /** Standard seconds per cycle in force on the business date; undefined = no OPERATION. */
  standardSeconds: number | undefined;
  /**
   * KPI-002 AC-5b: the counter's unit has no conversion path to the
   * operation's item unit on the business date — "cannot be calculated",
   * excluded, never the unconverted count.
   */
  conversionMissing?: boolean;
}

export interface PerformanceBreakdown {
  result: KpiResult;
  /** Ideal minutes per segment; null = no data for that segment. */
  segments: Array<{ sku: string; idealMinutes: number | null; cannotCalculate?: boolean }>;
}

/**
 * KPI-002 rule 3 / F-08 §9.2.1: a unit counter is first converted to the
 * operation's item unit (`factor`: counter → item, null = no path), then
 * divided by the batch size; a cycle counter skips the conversion.
 * null = cannot be calculated.
 */
export function cyclesFromCount(
  sensorCount: number,
  countBasis: "unit" | "cycle" | "",
  factor: number | null,
  batchSize: number | null,
): number | null {
  if (countBasis === "cycle") return sensorCount;
  if (factor === null) return null;
  return (sensorCount * factor) / (batchSize && batchSize > 0 ? batchSize : 1);
}

/**
 * KPI-002: `Performance = Σᵢ (standard_i × output_i) / APT`, per SKU segment,
 * never one averaged standard. A segment with no standard is "no data" and
 * the result is partial (AC-4). APT 0 → cannot compute (AC-6). > 100% is an
 * anomaly, not clamped (AC-7).
 */
export function performance(
  segments: ReadonlyArray<Segment>,
  aptMinutes: number | undefined,
): PerformanceBreakdown {
  const rows = segments.map((s) => ({
    sku: s.sku,
    idealMinutes:
      s.standardSeconds === undefined || s.conversionMissing
        ? null
        : (s.standardSeconds * s.output) / 60,
    cannotCalculate: s.conversionMissing || undefined,
  }));
  if (segments.length === 0) {
    return { result: { kind: "no_data", reason: "no_segment" }, segments: rows };
  }
  if (aptMinutes === undefined)
    return { result: { kind: "no_data", reason: "apt" }, segments: rows };
  if (aptMinutes <= 0)
    return { result: { kind: "cannot_compute", reason: "apt_zero" }, segments: rows };
  const known = rows.filter((r) => r.idealMinutes !== null);
  if (known.length === 0) {
    return rows.some((r) => r.cannotCalculate)
      ? { result: { kind: "cannot_compute", reason: "no_conversion" }, segments: rows }
      : { result: { kind: "no_data", reason: "standard" }, segments: rows };
  }
  const ideal = known.reduce((n, r) => n + (r.idealMinutes ?? 0), 0);
  const value = pct(ideal / aptMinutes);
  return {
    result: {
      kind: "value",
      value,
      partial: known.length < rows.length || undefined,
      anomaly: value > 100 ? "above_100" : undefined,
    },
    segments: rows,
  };
}

/** KPI-002 AC-11: a period sums APT and ideal time first, never averages shifts. */
export function performanceOverPeriod(
  shifts: ReadonlyArray<{ aptMinutes: number; idealMinutes: number }>,
): KpiResult {
  const apt = shifts.reduce((n, s) => n + s.aptMinutes, 0);
  const ideal = shifts.reduce((n, s) => n + s.idealMinutes, 0);
  if (apt <= 0) return { kind: "cannot_compute", reason: "apt_zero" };
  return { kind: "value", value: pct(ideal / apt) };
}

// ---------------------------------------------------------------- Quality

export interface QualityInputs {
  good?: number;
  total?: number;
  reject?: number;
}

export interface ResolvedQuality {
  result: KpiResult;
  /** The pair after filling — shared with Scrap ratio (KPI-009 AC-2/4). */
  good?: number;
  total?: number;
  reject?: number;
}

/**
 * PRD-003 KPI-003: `Quality = GQ / PQ`, the pair filled in this order (first
 * that works):
 *   1. good and total from one source — reject is only a Pareto breakdown
 *      (`path_1`; with all three, a mismatch is an anomaly and the total is
 *      not overwritten, AC-4);
 *   2. total and reject, no good → good = total − Σ reject (`path_2`);
 *   3. the machine's total tag (or job total) and a manual reject entry, no
 *      good → good = total − Σ reject, each manual row first converted to
 *      OPERATION.uom_id (Q-28, PO 2026-10-01). Built in reject-conversion.ts,
 *      which calls this function and marks the note `path_manual_reject`;
 *   4. good and reject, no total → total = good + Σ reject (`path_4`);
 *   5. only one of the three → no data; the missing side is never invented.
 * Reject > total → anomaly, good never negative (AC-6). Total 0 → cannot
 * compute (AC-5). PLC tag values are never converted: bound Quality tags
 * share one unit, enforced at binding (KPI-007 rule 7, PO 2026-09-28), so
 * good ÷ total is used as read. Only a manual reject (path 3) is converted.
 */
export function quality(inputs: QualityInputs): ResolvedQuality {
  const { good, total, reject } = inputs;
  const has = (n: number | undefined): n is number => n !== undefined;
  if (has(good) && has(total) && has(reject)) {
    if (total === 0)
      return { result: { kind: "cannot_compute", reason: "total_zero" }, good, total, reject };
    const q = pct(good / total);
    return {
      result: {
        kind: "value",
        value: q,
        anomaly: good + reject !== total ? "good_plus_reject_not_total" : undefined,
        note: "path_1",
      },
      good,
      total,
      reject,
    };
  }
  if (has(total) && has(reject)) {
    if (total === 0)
      return { result: { kind: "cannot_compute", reason: "total_zero" }, total, reject };
    const g = Math.max(0, total - reject);
    return {
      result: {
        kind: "value",
        value: pct(g / total),
        anomaly: reject > total ? "reject_exceeds_total" : undefined,
        note: "path_2",
      },
      good: g,
      total,
      reject,
    };
  }
  if (has(good) && has(reject)) {
    const tot = good + reject;
    if (tot === 0)
      return { result: { kind: "cannot_compute", reason: "total_zero" }, good, total: tot, reject };
    return {
      result: { kind: "value", value: pct(good / tot), note: "path_4" },
      good,
      total: tot,
      reject,
    };
  }
  if (has(good) && has(total)) {
    if (total === 0)
      return { result: { kind: "cannot_compute", reason: "total_zero" }, good, total };
    return {
      result: {
        kind: "value",
        value: pct(good / total),
        anomaly: good > total ? "good_exceeds_total" : undefined,
        note: "path_1",
      },
      good,
      total,
      reject: Math.max(0, total - good),
    };
  }
  return { result: { kind: "no_data", reason: "pair_missing" }, ...inputs };
}

/** KPI-003 AC-8/9: upstream − downstream in the same unit; a negative gap is 0, never extra good. */
export function twoStationReject(upstreamTotal: number, downstreamTotal: number): number {
  return Math.max(0, upstreamTotal - downstreamTotal);
}

// ---------------------------------------------------------------- Ratios

/**
 * KPI-009: `Scrap ratio = SQ / PQ` from Quality's own resolved pair, so it
 * shares Quality's no-data and anomaly flags (AC-2/AC-4).
 */
export function scrapRatio(q: ResolvedQuality): KpiResult {
  if (q.result.kind === "no_data") return q.result;
  if (q.total === undefined || q.total === 0)
    return { kind: "cannot_compute", reason: "total_zero" };
  if (q.reject === undefined) return { kind: "no_data", reason: "reject" };
  return {
    kind: "value",
    value: pct(q.reject / q.total),
    anomaly: q.result.kind === "value" ? q.result.anomaly : undefined,
  };
}

/** KPI-010: `Rework ratio = RWQ / PQ`. Rework not tracked → no data naming it (AC-3). */
export function reworkRatio(reworkQty: number | undefined, pq: number | undefined): KpiResult {
  if (reworkQty === undefined) return { kind: "no_data", reason: "rework_not_tracked" };
  if (pq === undefined) return { kind: "no_data", reason: "pq" };
  if (pq === 0) return { kind: "cannot_compute", reason: "pq_zero" };
  return { kind: "value", value: pct(reworkQty / pq) };
}

function minutesBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
}

/**
 * KPI-011: `Throughput rate = PQ / AOET` (units per minute). No start → no
 * data; no end → provisional with now − start (AC-3); start = end → anomaly.
 */
export function throughputRate(
  pq: number,
  actualStart: string | undefined,
  actualEnd: string | undefined,
  now: string = new Date().toISOString(),
): KpiResult {
  if (!actualStart) return { kind: "no_data", reason: "actual_start" };
  const aoet = minutesBetween(actualStart, actualEnd ?? now);
  if (aoet <= 0) return { kind: "cannot_compute", reason: "aoet_zero" };
  return {
    kind: "value",
    value: Math.round((pq / aoet) * 10) / 10,
    provisional: actualEnd ? undefined : true,
  };
}

/** KPI-011 AC-4 helper: start = end is bad data, flagged as an anomaly. */
export function throughputAnomaly(actualStart?: string, actualEnd?: string): boolean {
  return Boolean(actualStart && actualEnd && actualStart === actualEnd);
}

/** KPI-012: `Production process ratio = APT / AOET`; > 100% is an anomaly (AC-4). */
export function productionProcessRatio(
  aptMinutes: number | undefined,
  aoetMinutes: number | undefined,
): KpiResult {
  if (aptMinutes === undefined) return { kind: "no_data", reason: "apt" };
  if (aoetMinutes === undefined) return { kind: "no_data", reason: "aoet" };
  if (aoetMinutes <= 0) return { kind: "cannot_compute", reason: "aoet_zero" };
  const value = pct(aptMinutes / aoetMinutes);
  return { kind: "value", value, anomaly: value > 100 ? "above_100" : undefined };
}

/**
 * PRD-003 KPI-012 rule 6 / AC-6, AC-7 (PO, 2026-10-22, F-07 Area scope): area and
 * site Production process ratio = ΣAPT / ΣAOET across every work unit, never an
 * average of per-line ratios. A Molca roll-up at area; the Plant figure at site.
 */
export function productionProcessRatioRollup(
  parts: ReadonlyArray<{ aptMinutes: number; aoetMinutes: number }>,
): KpiResult {
  if (parts.length === 0) return { kind: "no_data", reason: "aoet" };
  const apt = parts.reduce((n, p) => n + p.aptMinutes, 0);
  const aoet = parts.reduce((n, p) => n + p.aoetMinutes, 0);
  return productionProcessRatio(apt, aoet);
}

/**
 * KPI-013: `Fall-off ratio = (PQ_first_op − GQ_current_op) / PQ_first_op`,
 * per Job Order only. The first step's quantity is summed across its shifts
 * first (AC-5).
 */
export function fallOffRatio(
  firstStepProduced: ReadonlyArray<number>,
  currentStepGood: number,
): KpiResult {
  if (firstStepProduced.length === 0) return { kind: "no_data", reason: "first_step" };
  const pq = firstStepProduced.reduce((n, x) => n + x, 0);
  if (pq === 0) return { kind: "cannot_compute", reason: "first_step_zero" };
  return { kind: "value", value: pct((pq - currentStepGood) / pq) };
}

/**
 * KPI-009/010/011/012 aggregation: a ratio over several lines or shifts sums
 * numerators and denominators first — never an average of the ratios.
 */
export function aggregateRatio(
  parts: ReadonlyArray<{ num: number; den: number }>,
  scale = 100,
): KpiResult {
  const num = parts.reduce((n, p) => n + p.num, 0);
  const den = parts.reduce((n, p) => n + p.den, 0);
  if (den === 0) return { kind: "cannot_compute", reason: "denominator_zero" };
  return { kind: "value", value: Math.round((num / den) * scale * 10) / 10 };
}

/**
 * KPI-003 rule 12 / KPI-009 rule 5: units → seconds at one step's cycle time,
 * ÷ batch size when the cycle time is per cycle. No cycle time (missing or not
 * positive) → null, never a guessed time.
 */
export function unitsToSeconds(
  units: number,
  cycleTimeSeconds: number | null | undefined,
  batchSize: number | null | undefined,
): number | null {
  if (cycleTimeSeconds === null || cycleTimeSeconds === undefined || !(cycleTimeSeconds > 0)) {
    return null;
  }
  const batch = batchSize && batchSize > 0 ? batchSize : 1;
  return (units * cycleTimeSeconds) / batch;
}

/** One operation row for KPI-011 above the work unit: its output and execution window. */
export interface ThroughputOperation {
  productId: string;
  stepNumber: number;
  /** The OPERATION unit the output is counted in (never merged across products). */
  uomId: string;
  /** Output of this row in `uomId` (good + scrap + rework). */
  pq: number;
  /** `actual_start` / `actual_end`; end null = still running. */
  start: string | null;
  end: string | null;
}

export interface ProductThroughput {
  productId: string;
  unit: string;
  pq: number;
  aoetHours: number;
  /** Units per hour; null when AOET is 0 (an anomaly, flagged, not shown as infinite). */
  rate: number | null;
}

/**
 * KPI-011 rules 7–9 (PO, 2026-10-22): above the work unit, one row per product:
 * PQ at the product's last step ÷ AOET at that step. AOET is clock time — the
 * union of the windows of the stations running that step, so overlapping hours
 * count once. A still-running row closes at `now`; without `now` it is left out
 * of the time. Never a ΣPQ / ΣAOET total across products.
 */
export function throughputPerProduct(
  rows: ReadonlyArray<ThroughputOperation>,
  lastStepOf: (productId: string) => number | undefined,
  now?: string,
): ProductThroughput[] {
  const byProduct = new Map<string, ThroughputOperation[]>();
  for (const r of rows) {
    if (r.stepNumber !== lastStepOf(r.productId)) continue;
    byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  }
  return [...byProduct].map(([productId, ops]) => {
    const intervals: Array<[number, number]> = [];
    for (const op of ops) {
      const end = op.end ?? now;
      if (!op.start || !end) continue;
      const s = Date.parse(op.start);
      const e = Date.parse(end);
      if (e > s) intervals.push([s, e]);
    }
    const aoetHours = unionHours(intervals);
    const pq = ops.reduce((n, o) => n + o.pq, 0);
    return {
      productId,
      unit: ops[0].uomId,
      pq,
      aoetHours,
      rate: aoetHours > 0 ? pq / aoetHours : null,
    };
  });
}

/** Total length in hours of the union of [start, end] millisecond intervals. */
function unionHours(intervals: ReadonlyArray<[number, number]>): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = NaN;
  let curEnd = NaN;
  for (const [s, e] of sorted) {
    if (Number.isNaN(curEnd) || s > curEnd) {
      if (!Number.isNaN(curEnd)) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (!Number.isNaN(curEnd)) total += curEnd - curStart;
  return total / 3_600_000;
}
