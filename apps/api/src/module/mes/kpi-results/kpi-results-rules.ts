import {
  aggregateRatio,
  fallOffRatio,
  quality,
  reworkRatio,
  unitsToSeconds,
} from "./kpi-engine.js";

import { endSteps } from "../work-master/work-master-rules.js";

import type { KpiResult as EngineResult } from "./kpi-engine.js";
import type {
  AggregationLevel,
  KpiMetric,
  KpiResult,
  PlanningOperation,
  StepCycle,
} from "./kpi-results.js";

// Pure KPI_RESULT assembly: which KPI exists at which scope, and each value
// from the rows of that scope and period — sums first, then divide (F-07.1
// sum_of_terms), never an average of per-shift ratios.

export const METRICS: ReadonlyArray<KpiMetric> = [
  "oee",
  "availability",
  "performance",
  "quality",
  "production_process_ratio",
  "throughput_rate",
  "scrap_ratio",
  "rework_ratio",
  "fall_off_ratio",
  "mttr",
  "mttf",
  "mtbf",
];

/** Scope keys of PRD-004 03-performance "Where each KPI exists". */
type Scope = "shift" | "range" | "work_center" | "area" | "site" | "work_order";

/** Scopes added up from work units (Molca roll-up, not an ISO 22400 scope). */
const isRollup = (scope: Scope) => scope === "work_center" || scope === "area" || scope === "site";

const ADOPTED: Record<KpiMetric, ReadonlyArray<Scope>> = {
  oee: ["shift", "range", "work_center", "area", "site"],
  availability: ["shift", "range", "work_center", "area", "site"],
  performance: ["shift", "range", "work_center", "area", "site"],
  quality: ["shift", "range", "work_center", "area", "site"],
  // PRD-003 KPI-011 rules 7–9: above the work unit, one row per product (keying TBD).
  throughput_rate: ["shift", "work_center", "area", "site", "work_order"],
  // PRD-003 KPI-012 rule 6 (PO, 2026-10-22): area and site roll up as ΣAPT / ΣAOET.
  production_process_ratio: ["shift", "work_center", "area", "site", "work_order"],
  // PRD-003 KPI-009/010 rule 5 (PO, 2026-10-22): area and site roll up in time.
  scrap_ratio: ["shift", "work_center", "area", "site", "work_order"],
  rework_ratio: ["shift", "work_center", "area", "site", "work_order"],
  fall_off_ratio: ["work_order"],
  mttr: ["shift", "range"],
  mttf: ["shift", "range"],
  mtbf: ["shift", "range"],
};

/** These need machine state (`ASSET_STATE_LOG`, B5) or APT, which comes from it. */
const NEEDS_MACHINE_STATE: ReadonlySet<KpiMetric> = new Set([
  "oee",
  "availability",
  "performance",
  "production_process_ratio",
  "mttr",
  "mttf",
  "mtbf",
]);

export function scopeOf(level: AggregationLevel, perShift: boolean): Scope {
  if (level === "work_unit") return perShift ? "shift" : "range";
  return level;
}

export function adopted(metric: KpiMetric, scope: Scope): boolean {
  return ADOPTED[metric].includes(scope);
}

type Head = Omit<
  KpiResult,
  "metric" | "value" | "unit" | "status" | "reason" | "blockedBy" | "inputs"
>;

function fromEngine(r: EngineResult): Pick<KpiResult, "value" | "status" | "reason"> {
  if (r.kind === "value") {
    return {
      value: r.value,
      status: r.anomaly ? "anomaly" : "computed",
      reason: r.anomaly ?? null,
    };
  }
  return { value: null, status: r.kind, reason: r.reason };
}

function minutes(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 60_000;
}

/**
 * Every Production KPI for one scope item and period. `rows` are the
 * operation rows inside it; `now` closes the AOET of rows still running.
 */
/** Total recorded output of a row. `reworkQty` is null when untracked (KPI-010 §3). */
function outputOf(r: PlanningOperation): number {
  return r.goodQty + r.scrapQty + (r.reworkQty ?? 0);
}

/**
 * A step's cycle time in seconds: the value is in its `timeConversionId`'s unit
 * (`seconds_per_unit` from TIME_CONVERSIONS, WMS-003). Missing value, unknown
 * time conversion or a non-positive factor → null: the work unit is left out,
 * never a guessed time.
 */
export function stepCycleSeconds(
  value: number | null,
  timeConversionId: string,
  secondsPerUnit: ReadonlyMap<string, number>,
): number | null {
  const factor = secondsPerUnit.get(timeConversionId);
  if (value === null || factor === undefined || !(factor > 0)) return null;
  return value * factor;
}

/**
 * PRD-003 KPI-011 rule 8 / F-08 §9.2.3: a routing's last step is its single end
 * step, the one no other step waits for (`endSteps`, WMS-003 rule 21). A version
 * that does not end in exactly one step → undefined, never a guessed step.
 */
export function routingEndStep(
  steps: ReadonlyArray<{ stepId: string; stepNumber: number }>,
  dependencies: ReadonlyArray<{ stepId: string; predecessorStepId: string }>,
): number | undefined {
  const ends = endSteps(steps, dependencies);
  return ends.length === 1 ? ends[0].stepNumber : undefined;
}

/** No cycle time known for a row: the roll-up leaves its work unit out. */
const NO_CYCLE: (op: PlanningOperation) => StepCycle = () => ({
  workUnitCode: "",
  uomId: "",
  cycleTimeSeconds: null,
  batchSize: null,
});

export function resultsFor(
  head: Head,
  scope: Scope,
  rows: ReadonlyArray<PlanningOperation>,
  now: Date,
  cycleOf: (op: PlanningOperation) => StepCycle = NO_CYCLE,
): KpiResult[] {
  const pq = rows.reduce((n, r) => n + outputOf(r), 0);
  const gq = rows.reduce((n, r) => n + r.goodQty, 0);
  const sq = rows.reduce((n, r) => n + r.scrapQty, 0);
  // One untracked row makes the whole scope untracked: a rework share cannot
  // be claimed across rows that do not all report rework (KPI-010 §3).
  const rwq = rows.every((r) => r.reworkQty !== null)
    ? rows.reduce((n, r) => n + (r.reworkQty as number), 0)
    : undefined;
  const noOutput = rows.length === 0 || pq === 0;

  return METRICS.flatMap((metric): KpiResult[] => {
    const base = {
      ...head,
      metric,
      unit: metric === "throughput_rate" ? ("units/min" as const) : ("%" as const),
    };
    if (!adopted(metric, scope)) {
      return [
        { ...base, value: null, status: "not_at_level", reason: null, blockedBy: null, inputs: {} },
      ];
    }
    if (NEEDS_MACHINE_STATE.has(metric)) {
      return [
        {
          ...base,
          value: null,
          status: "no_data",
          reason: "machine_state",
          blockedBy: "B5",
          inputs: {},
        },
      ];
    }
    if (metric === "fall_off_ratio") return fallOff(base, rows);
    if ((metric === "scrap_ratio" || metric === "rework_ratio") && isRollup(scope)) {
      return [rollupRatio(base, metric, rows, cycleOf)];
    }
    if (noOutput) {
      return [
        {
          ...base,
          value: null,
          status: "no_data",
          reason: "no_output",
          blockedBy: null,
          inputs: {},
        },
      ];
    }
    switch (metric) {
      case "quality":
        return [
          {
            ...base,
            ...fromEngine(quality({ good: gq, total: pq }).result),
            blockedBy: null,
            inputs: { gq, pq },
          },
        ];
      case "scrap_ratio":
        return [
          {
            ...base,
            ...fromEngine(aggregateRatio([{ num: sq, den: pq }])),
            blockedBy: null,
            inputs: { sq, pq },
          },
        ];
      case "rework_ratio":
        return [
          {
            ...base,
            ...fromEngine(reworkRatio(rwq, pq)),
            blockedBy: null,
            inputs: rwq === undefined ? { pq } : { rwq, pq },
          },
        ];
      case "throughput_rate": {
        // PRD-003 KPI-011 rule 9 (PO, 2026-10-22): above the work unit the figure
        // is one row per product. Its key is TBD, so no merged total is shown.
        if (isRollup(scope)) {
          return [
            {
              ...base,
              value: null,
              status: "no_data",
              reason: "per_product_key_tbd",
              blockedBy: null,
              inputs: {},
            },
          ];
        }
        const started = rows.filter((r) => r.actualStart);
        if (started.length === 0) {
          return [
            {
              ...base,
              value: null,
              status: "no_data",
              reason: "actual_start",
              blockedBy: null,
              inputs: {},
            },
          ];
        }
        const aoet = started.reduce(
          (n, r) => n + minutes(r.actualStart!, r.actualEnd ?? now.toISOString()),
          0,
        );
        const out = started.reduce((n, r) => n + outputOf(r), 0);
        if (aoet <= 0) {
          return [
            {
              ...base,
              value: null,
              status: "cannot_compute",
              reason: "aoet_zero",
              blockedBy: null,
              inputs: {},
            },
          ];
        }
        return [
          {
            ...base,
            value: Math.round((out / aoet) * 10) / 10,
            status: "computed",
            reason: null,
            blockedBy: null,
            // KPI-011 AC-3: a row still running closes at now — provisional.
            isProvisional: head.isProvisional || started.some((r) => !r.actualEnd),
            inputs: { pq: out, aoetMinutes: Math.round(aoet) },
          },
        ];
      }
      default:
        return [];
    }
  });
}

/**
 * PRD-003 KPI-009 / KPI-010 rule 5 (PO, 2026-10-22, F-07 Area scope): area and
 * site Scrap ratio = Σ scrap time / Σ produced time, Rework ratio = Σ rework
 * time / Σ produced time. Each work unit's quantities become time at its own
 * step's cycle time. A work unit with no cycle time is left out and counted;
 * its rows are excluded whole. A Molca roll-up, not an ISO 22400-2 scope.
 */
function rollupRatio(
  base: Omit<KpiResult, "value" | "status" | "reason" | "blockedBy" | "inputs">,
  metric: "scrap_ratio" | "rework_ratio",
  rows: ReadonlyArray<PlanningOperation>,
  cycleOf: (op: PlanningOperation) => StepCycle,
): KpiResult {
  const label = { ...base, scope: "molca_rollup" as const, blockedBy: null };
  if (rows.length === 0) {
    return { ...label, value: null, status: "no_data", reason: "no_output", inputs: {} };
  }
  // Group by work unit; a unit with any row lacking a cycle time is left out.
  const units = new Map<string, { code: string; uomId: string; rows: PlanningOperation[] }>();
  for (const op of rows) {
    const id = op.workUnitId ?? "";
    const cycle = cycleOf(op);
    const unit = units.get(id) ?? { code: cycle.workUnitCode, uomId: cycle.uomId, rows: [] };
    unit.rows.push(op);
    units.set(id, unit);
  }
  const leftOut: Array<{ id: string; code: string }> = [];
  const included: Array<[string, { code: string; uomId: string; rows: PlanningOperation[] }]> = [];
  for (const [id, unit] of units) {
    const timed = unit.rows.every((op) => (cycleOf(op).cycleTimeSeconds ?? 0) > 0);
    if (timed) included.push([id, unit]);
    else leftOut.push({ id, code: unit.code });
  }
  const leftOutInfo = { count: leftOut.length, workUnits: leftOut };
  if (included.length === 0) {
    return {
      ...label,
      value: null,
      status: "no_data",
      reason: "cycle_time_missing",
      inputs: {},
      leftOut: leftOutInfo,
    };
  }
  const includedRows = included.flatMap(([, u]) => u.rows);
  if (metric === "rework_ratio" && includedRows.some((r) => r.reworkQty === null)) {
    return {
      ...label,
      value: null,
      status: "no_data",
      reason: "rework_not_tracked",
      inputs: {},
      leftOut: leftOutInfo,
    };
  }

  let rejectSeconds = 0;
  let producedSeconds = 0;
  const breakdown: NonNullable<KpiResult["breakdown"]> = [];
  for (const [id, unit] of included) {
    let rejectQty = 0;
    let producedQty = 0;
    for (const op of unit.rows) {
      const cycle = cycleOf(op);
      const reject = metric === "scrap_ratio" ? op.scrapQty : (op.reworkQty ?? 0);
      const produced = outputOf(op);
      rejectSeconds += unitsToSeconds(reject, cycle.cycleTimeSeconds, cycle.batchSize) ?? 0;
      producedSeconds += unitsToSeconds(produced, cycle.cycleTimeSeconds, cycle.batchSize) ?? 0;
      rejectQty += reject;
      producedQty += produced;
    }
    breakdown.push({
      workUnitId: id,
      workUnitCode: unit.code,
      uomId: unit.uomId,
      rejectQty,
      producedQty,
    });
  }
  const inputs = { rejectSeconds, producedSeconds };
  if (producedSeconds === 0) {
    return {
      ...label,
      value: null,
      status: "no_data",
      reason: "no_output",
      inputs,
      leftOut: leftOutInfo,
    };
  }
  return {
    ...label,
    ...fromEngine(aggregateRatio([{ num: rejectSeconds, den: producedSeconds }])),
    inputs,
    leftOut: leftOutInfo,
    breakdown,
  };
}

/** KPI-013: one result per step after the first; "no data" when step 1 has no row. */
function fallOff(
  base: Omit<KpiResult, "value" | "status" | "reason" | "blockedBy" | "inputs">,
  allRows: ReadonlyArray<PlanningOperation>,
): KpiResult[] {
  // A row whose step Master Data does not know has no step number: it is skipped here.
  const rows = allRows.filter(
    (r): r is PlanningOperation & { stepNumber: number } => r.stepNumber !== undefined,
  );
  const steps = [...new Set(rows.map((r) => r.stepNumber))].sort((a, b) => a - b);
  if (steps.length === 0) {
    return [
      {
        ...base,
        value: null,
        status: "no_data",
        reason: "first_step",
        blockedBy: null,
        inputs: {},
      },
    ];
  }
  // A step-1 row counts once it started or has output; a planned row alone is
  // "no recorded output yet" — no data, not cannot-compute (KPI-013 §3 Empty).
  const first = rows.filter((r) => r.stepNumber === steps[0] && (r.actualStart || outputOf(r) > 0));
  const produced = first.map(outputOf);
  return steps.map((step) => {
    const good = rows.filter((r) => r.stepNumber === step).reduce((n, r) => n + r.goodQty, 0);
    return {
      ...base,
      stepNumber: step,
      ...fromEngine(fallOffRatio(produced, good)),
      blockedBy: null,
      inputs: { pqFirstOp: produced.reduce((n, x) => n + x, 0), gqCurrentOp: good },
    };
  });
}
