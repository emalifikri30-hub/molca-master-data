import * as p from "drizzle-orm/pg-core";

import { masterData, region, tenantId, scopeIdx } from "../columns.js";

/**
 * PRD-003 WMS-006 / F-04 §9.7 ASSET_PRODUCT_CODE_CHANGE (PO 2026-10-03,
 * docs-molcadx#95 option 2): one append-only row per add, End or Delete of an
 * ASSET_PRODUCT_CODES row, written in the same transaction, with the old and
 * new period as timestamps. AUDIT_LOG keeps dates without times and no earlier
 * `valid_to`, so PRODUCTION reads this (through `product_code_mapping_change`)
 * to find the exact shifts to recalculate.
 */
export const assetProductCodeChangeTable = masterData.table(
  "asset_product_code_change",
  {
    changeId: p.text("change_id").primaryKey(),
    region: region(),
    tenantId: tenantId(),
    assetProductCodeId: p.text("asset_product_code_id").notNull(),
    // The work unit the code's tag counts in at save time; NULL when the tag
    // has no lane and the machine is not on exactly one work unit.
    workUnitId: p.text("work_unit_id"),
    rawValue: p.text("raw_value").notNull(),
    action: p.text("action").notNull(),
    oldValidFrom: p.timestamp("old_valid_from", { withTimezone: true, mode: "string" }),
    oldValidTo: p.timestamp("old_valid_to", { withTimezone: true, mode: "string" }),
    newValidFrom: p.timestamp("new_valid_from", { withTimezone: true, mode: "string" }),
    newValidTo: p.timestamp("new_valid_to", { withTimezone: true, mode: "string" }),
    changedAt: p.timestamp("changed_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  scopeIdx("asset_product_code_change"),
);
