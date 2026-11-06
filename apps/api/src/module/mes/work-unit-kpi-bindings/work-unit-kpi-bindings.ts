// FOUNDATION F-07.1 `WORK_UNIT_KPI_BINDING` — US-FND-KPI-007/008: which
// ASSET_TAGS row (+ transform) currently fills a given work unit's KPI
// formula slot. Effective-dated like ASSET_COMPONENT_LINK/ASSET_PLACEMENT:
// rebinding a slot always closes the old row and opens a new one, never
// overwrites, so the breakdown viewer can show history, not just "now".
// Never hard-deleted (F-00 §4.3): the only write besides create is closing
// a row by setting `validTo`.
import type { Transform } from "../kpi-formula-slots/kpi-formula-slots.js";

type WorkUnitKpiBinding = {
  id: string;
  workUnitId: string;
  slotId: string;
  assetTagId: string;
  transform: Transform;
  /** The paired tag — set only when `transform = infeed_outfeed_derive` (F-07.1 §9.4). */
  secondAssetTagId: string | null;
  validFrom: string;
  /** null = this binding is live now. */
  validTo: string | null;
};

type CreateWorkUnitKpiBinding = {
  workUnitId: string;
  slotId: string;
  assetTagId: string;
  transform: Transform;
  secondAssetTagId?: string;
  validFrom: string;
  /**
   * Rebind intent: id of the active binding for this (workUnitId, slotId)
   * that this one replaces — closed (`validTo: validFrom`) before the new
   * row is created. Omitted for a first-time bind. Not a stored field.
   */
  incumbentBindingId?: string;
};

/**
 * PO 2026-11-04 (answer 6): one save of several rows for one work unit and one
 * effective date. Rows carry no `workUnitId` / `validFrom` of their own — the
 * batch supplies them.
 */
type CreateWorkUnitKpiBindingBatch = {
  workUnitId: string;
  validFrom: string;
  rows: Array<Omit<CreateWorkUnitKpiBinding, "workUnitId" | "validFrom">>;
};

/** The only allowed update: close an active row (validTo ≥ validFrom). */
type UpdateWorkUnitKpiBinding = {
  validTo: string;
};

/**
 * F-00 "Editing an effective-dated row" / KPI-007 rule 11 (PO 2026-10-04):
 * one append-only row per add, Edit / Rebind or End, with the old and new
 * period, read by the KPI calculation through `kpi_input_change`.
 */
type WorkUnitKpiBindingChange = {
  changeId: string;
  /** add / end: the row itself; edit: the new row. */
  bindingId: string;
  workUnitId: string;
  slotId: string;
  action: "add" | "edit" | "end";
  /** The period before the change; null on `add`. */
  oldValidFrom: string | null;
  oldValidTo: string | null;
  /** The period after the change. */
  newValidFrom: string | null;
  newValidTo: string | null;
  changedAt: string;
};

type WorkUnitKpiBindingFilter = {
  workUnitId?: string;
  slotId?: string;
};

export type {
  WorkUnitKpiBinding,
  CreateWorkUnitKpiBinding,
  CreateWorkUnitKpiBindingBatch,
  UpdateWorkUnitKpiBinding,
  WorkUnitKpiBindingChange,
  WorkUnitKpiBindingFilter,
};
