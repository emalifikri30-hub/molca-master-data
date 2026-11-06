// FOUNDATION F-07.1 §9.1 `KPI_FORMULA_SLOT` — one named input position inside
// a fixed KPI formula (e.g. Quality's `GQ / PQ` has good/total/reject). Per
// K-1/K-7 (F-07.1 "What's still unknown") this catalog is seeded and closed:
// never implementor-writable, changes go through foundation-domain / PO. It
// exists so `WORK_UNIT_KPI_BINDING` (US-FND-KPI-007) has positions to bind a
// work unit's tags against, and so the breakdown (US-FND-KPI-008) can label
// what each binding fills. Which tag-role/transform pairs are legal per slot
// lives in `KPI_PARAMETERS` (../kpi-parameters), not here.

import type {
  KPI_DOMAIN_VALUES,
  KPI_TRANSFORM_VALUES,
} from "../../../shared/database/schema/value-lists.js";
/**
 * `KPI_FORMULA_SLOT.metric`. F-07.1 §9.1's field table lists
 * `availability | performance | quality | reliability`; the 2026-09-10
 * "Newly adopted KPIs" rows add `throughput` (the spec writes
 * "throughput / production_process" — the one AOET slot feeds both
 * Throughput rate and Production process ratio) and `rework`.
 */
type SlotMetric =
  | "availability"
  | "performance"
  | "quality"
  | "reliability"
  | "throughput"
  | "rework"
  | "shopfloor";

const SLOT_METRICS: SlotMetric[] = [
  "availability",
  "performance",
  "quality",
  "reliability",
  "throughput",
  "rework",
  "shopfloor",
];

/** F-07.1 §9.2 transform enum — closed, same governance as `tag_role`. */
type Transform = (typeof KPI_TRANSFORM_VALUES)[number];

const TRANSFORMS: Transform[] = [
  "none",
  "unit_convert",
  "counter_to_duration",
  "infeed_outfeed_derive",
  "complement_derive",
  "reconcile_check",
  "segment_and_sum",
  "reason_tag_drives_stop",
  "stall_bucket",
  "range_bucket",
  "reason_match_enrich",
  "speed_vs_standard_check",
  "interval_mean",
];

/** The only transform that takes `second_asset_tag_id` (F-07.1 §9.4). */
const PAIRED_TRANSFORM: Transform = "infeed_outfeed_derive";

/**
 * F-07.1 §9.1 `KPI_FORMULA_SLOT.domain` (2026-09-27): which domain's KPI
 * sidebar item lists the slot. Every adopted KPI is a Production KPI today.
 */
type KpiDomain = (typeof KPI_DOMAIN_VALUES)[number];

type KpiFormulaSlot = {
  /** PK, the slot key itself — e.g. "quality.total". */
  slotId: string;
  domain: KpiDomain;
  metric: SlotMetric;
  /** Which F-07 element this slot fills (APT, GQ, PQ, SQ, …); null for a helper slot. */
  isoElement: string | null;
  /** false = computed from other data, never bound per work unit. */
  bindable: boolean;
  /**
   * F-07.1 §9.1 (PO 2026-10-02): true = the metric is "no data" without this
   * slot; false = an optional check (`performance.speed_check`). Only
   * required slots count as gaps or in "<n> of <m> bound". Meaningful only
   * when `bindable` is true.
   */
  required: boolean;
};

type KpiFormulaSlotFilter = {
  metric?: SlotMetric;
  bindable?: boolean;
};

export type { KpiDomain, KpiFormulaSlot, KpiFormulaSlotFilter, SlotMetric, Transform };
export { SLOT_METRICS, TRANSFORMS, PAIRED_TRANSFORM };
