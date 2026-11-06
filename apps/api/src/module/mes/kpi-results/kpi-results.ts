// FOUNDATION F-07.1 §9.5 KPI_RESULT, computed on read (prototype: no job, no
// table). The Production KPIs (PRD-003 07-kpi.md) at the scopes F-07 adopted
// them for (PRD-004 03-performance.md "Where each KPI exists"). The inputs are
// Job Order quantities from the Production Planning API.

type KpiMetric =
  | "oee"
  | "availability"
  | "performance"
  | "quality"
  | "production_process_ratio"
  | "throughput_rate"
  | "scrap_ratio"
  | "rework_ratio"
  | "fall_off_ratio"
  | "mttr"
  | "mttf"
  | "mtbf";

type AggregationLevel = "work_unit" | "work_center" | "area" | "site" | "work_order";

/** `not_at_level`: F-07 didn't adopt this KPI at this scope ("Not calculated at this level"). */
type KpiStatus = "computed" | "no_data" | "cannot_compute" | "anomaly" | "not_at_level";

type KpiResult = {
  metric: KpiMetric;
  aggregationLevel: AggregationLevel;
  aggregationMethod: "sum_of_terms";
  scopeId: string;
  scopeCode: string;
  /** Set for a per-shift period; null for a date range. */
  shiftInstanceId: string | null;
  periodFrom: string;
  periodTo: string;
  /** Fall-off ratio only: the step being checked. */
  stepNumber?: number;
  value: number | null;
  unit: "%" | "units/min";
  status: KpiStatus;
  reason: string | null;
  /** Inputs that wait on an open item, e.g. B5 (machine state). */
  blockedBy: "B5" | null;
  isProvisional: boolean;
  computedAt: string;
  inputs: Record<string, number>;
  /**
   * KPI-009/010 rule 5 (PO, 2026-10-22, F-07 Area scope): an area or site
   * roll-up is a Molca figure, not an ISO 22400-2 scope, and says so.
   */
  scope?: "molca_rollup";
  /** Work units left out of a roll-up for want of a cycle time, named by id and code. */
  leftOut?: { count: number; workUnits: Array<{ id: string; code: string }> };
  /** Roll-up breakdown: each work unit's rejects and output in its own unit, not converted. */
  breakdown?: Array<{
    workUnitId: string;
    workUnitCode: string;
    uomId: string;
    rejectQty: number;
    producedQty: number;
  }>;
};

type KpiQuery = {
  level: AggregationLevel;
  shiftInstanceId?: string;
  from?: string;
  to?: string;
  siteId?: string;
  workOrderId?: string;
};

// Planning API shapes this module reads (WORK_ORDER, JOB_EXECUTION joined with its JOB_ORDER).
type PlanningOperation = {
  id: string;
  workOrderId: string;
  /**
   * The routing step number, derived here from `stepId` in Master Data (Planning
   * no longer sends it). Undefined when Master Data has no such step in effect:
   * the row then takes no part in step-based KPIs (KPI-013).
   */
  stepNumber?: number;
  workUnitId: string | null;
  shiftInstanceId: string | null;
  goodQty: number;
  scrapQty: number;
  /** null when the work order does not track rework (KPI-010 §3 no-data case). */
  reworkQty: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  /**
   * The OPERATION step this row belongs to: the Job Order's `operationId`.
   * Cycle time lookup (KPI-009 rule 5).
   */
  stepId?: string;
};
type PlanningWorkOrder = {
  id: string;
  woNumber: string;
  productId: string;
  siteId: string;
  /** The pinned released ROUTING version (PLN-003 rule 2). */
  routingId?: string | null;
};

/**
 * The cycle time of one operation row's step at its work unit, resolved by the
 * caller (the same resolution reject-conversion takes as `cycleTimeSeconds`).
 * `uomId` is the step's OPERATION unit, the unit the row's quantities are in.
 */
type StepCycle = {
  workUnitCode: string;
  uomId: string;
  cycleTimeSeconds: number | null;
  batchSize: number | null;
};

export type {
  KpiMetric,
  AggregationLevel,
  KpiStatus,
  KpiResult,
  KpiQuery,
  PlanningOperation,
  PlanningWorkOrder,
  StepCycle,
};
