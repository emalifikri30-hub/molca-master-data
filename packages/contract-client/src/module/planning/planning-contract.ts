import type { PlanningExecutionsPayload, PlanningShiftBreakRow } from "./planning-dto.js";

type PlanningClientContract = {
  // One read, several projections: KPI results (executions), site-hierarchy
  // deactivation (job orders) and product closure (work orders) each take what
  // they need. Whole rows are returned so each reader projects its own view
  // instead of the contract guessing per caller.
  executions(): Promise<PlanningExecutionsPayload>;

  // Every effective-dated SHIFT_BREAK row of one site (K-28): the calculation
  // picks the rows valid at a shift instance's start — a work unit's own rows
  // for that shift if it has any, else the site default rows.
  breaks(siteId: string): Promise<PlanningShiftBreakRow[]>;
};

export type { PlanningClientContract };
