// Production Planning's `/api/v1/job-orders/executions` payload, narrowed to the
// fields the readers use. Extra upstream fields are not declared. The client
// joins each execution with its Job Order, so an execution row carries the
// plan's `workOrderId` and `operationId` (the routing step).

// Work orders: KPI results (woNumber, siteId, routingId), site-hierarchy
// deactivation (id, woNumber) and product closure (productId, status).
type PlanningWorkOrderRow = {
  id: string;
  woNumber: string;
  productId: string;
  siteId: string;
  status: string;
  /** The pinned released ROUTING version (PLN-003 rule 2); the step lookup key. */
  routingId?: string | null;
};

// Job Order rows: the plan, one OPERATION step on one work unit. Site-hierarchy
// deactivation reads these, not executions: a `pending` or `scheduled` Job Order
// has no execution yet and still blocks (SIT-002 §4).
type PlanningJobOrderRow = {
  id: string;
  workOrderId: string;
  operationId: string;
  workUnitId: string | null;
  status: string;
};

// Execution rows: the KPI quantities and timestamps, plus the Job Order's
// `workOrderId` and `operationId` (joined by the client). `status` is the
// execution's own state.
type PlanningExecutionRow = {
  id: string;
  workOrderId: string;
  operationId: string;
  workUnitId: string | null;
  shiftInstanceId: string | null;
  goodQty: number;
  scrapQty: number;
  reworkQty: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
};

type PlanningExecutionsPayload = {
  workOrders: PlanningWorkOrderRow[];
  jobOrders: PlanningJobOrderRow[];
  executions: PlanningExecutionRow[];
};

// SHIFT_BREAK rows, every version (Planning's /api/v1/breaktime/all): the KPI
// calculation resolves the break hours valid at a shift instance's start (K-28)
// from these effective-dated rows.
type PlanningShiftBreakRow = {
  id: string;
  siteId: string;
  enterpriseShiftId: string;
  workUnitId: string | null;
  /** Site-local "HH:mm", end exclusive. */
  startTime: string;
  endTime: string;
  label: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type {
  PlanningExecutionRow,
  PlanningExecutionsPayload,
  PlanningJobOrderRow,
  PlanningShiftBreakRow,
  PlanningWorkOrderRow,
};
