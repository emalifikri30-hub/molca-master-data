import * as p from "drizzle-orm/pg-core";

import { masterData, region, tenantId, scopeIdx } from "../columns.js";

/**
 * PRD-003 KPI-007 rule 11 / F-00 "Editing an effective-dated row, and
 * back-dating" (PO 2026-10-04): one append-only row per add, Edit / Rebind or
 * End of a WORK_UNIT_KPI_BINDING row, written in the same transaction, with
 * the old and new period. The KPI calculation reads it (through
 * `kpi_input_change`) to find the closed shifts to recalculate. Same shape as
 * ASSET_PRODUCT_CODE_CHANGE; binding ranges are dates, not timestamps.
 */
export const workUnitKpiBindingChangeTable = masterData.table(
  "work_unit_kpi_binding_change",
  {
    changeId: p.text("change_id").primaryKey(),
    region: region(),
    tenantId: tenantId(),
    // add / end: the row itself; edit: the new row (the old period is the ended one's).
    bindingId: p.text("binding_id").notNull(),
    workUnitId: p.text("work_unit_id").notNull(),
    slotId: p.text("slot_id").notNull(),
    action: p.text("action").notNull(),
    oldValidFrom: p.date("old_valid_from", { mode: "string" }),
    oldValidTo: p.date("old_valid_to", { mode: "string" }),
    newValidFrom: p.date("new_valid_from", { mode: "string" }),
    newValidTo: p.date("new_valid_to", { mode: "string" }),
    changedAt: p.timestamp("changed_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  scopeIdx("work_unit_kpi_binding_change"),
);
