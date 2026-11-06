import { sql } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

import { masterData } from "../columns.js";

// F-00 "Editing an effective-dated row, and back-dating" (PO 2026-10-04): one
// read-only view over every change row a KPI reads — product codes
// (ASSET_PRODUCT_CODE_CHANGE) and KPI bindings (WORK_UNIT_KPI_BINDING_CHANGE).
// The KPI calculation reads it and recalculates the closed shifts that overlap
// the old or the new period. Master Data never recalculates.

export const kpiInputChangeView = masterData
  .view("kpi_input_change", {
    changeId: p.text("change_id").notNull(),
    region: p.varchar("region", { length: 16 }).notNull(),
    sourceTable: p.text("source_table").notNull(),
    rowId: p.text("row_id").notNull(),
    workUnitId: p.text("work_unit_id"),
    action: p.text("action").notNull(),
    oldValidFrom: p.timestamp("old_valid_from", { withTimezone: true, mode: "string" }),
    oldValidTo: p.timestamp("old_valid_to", { withTimezone: true, mode: "string" }),
    newValidFrom: p.timestamp("new_valid_from", { withTimezone: true, mode: "string" }),
    newValidTo: p.timestamp("new_valid_to", { withTimezone: true, mode: "string" }),
    savedAt: p.timestamp("saved_at", { withTimezone: true, mode: "string" }).notNull(),
  })
  .as(
    sql`select change_id, region, 'asset_product_code' as source_table, asset_product_code_id as row_id, work_unit_id, action, old_valid_from, old_valid_to, new_valid_from, new_valid_to, changed_at as saved_at from master_data.asset_product_code_change
union all
select change_id, region, 'work_unit_kpi_binding' as source_table, binding_id as row_id, work_unit_id, action, old_valid_from::timestamptz, old_valid_to::timestamptz, new_valid_from::timestamptz, new_valid_to::timestamptz, changed_at as saved_at from master_data.work_unit_kpi_binding_change`,
  );
