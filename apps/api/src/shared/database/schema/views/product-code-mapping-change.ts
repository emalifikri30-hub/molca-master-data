import { sql } from "drizzle-orm";

import { assetProductCodeChangeTable } from "../asset/asset-product-code-change.js";
import { masterData } from "../columns.js";

// PRD-003 WMS-006 / F-04 §9.7 (PO 2026-10-03, prd-molcadx#26 item 4):
// `product_code_mapping_changed` is delivered as this read-only view, not a
// message. PRODUCTION reads it before recalculating the affected shifts.
// It reads only ASSET_PRODUCT_CODE_CHANGE (docs-molcadx#95 option 2): one row
// per add, End or Delete, with the old and new period as timestamps.

export const productCodeMappingChangeView = masterData
  .view("product_code_mapping_change")
  .as((qb) =>
    qb
      .select({
        changeId: assetProductCodeChangeTable.changeId,
        region: assetProductCodeChangeTable.region,
        action: assetProductCodeChangeTable.action,
        assetProductCodeId: assetProductCodeChangeTable.assetProductCodeId,
        workUnitId: assetProductCodeChangeTable.workUnitId,
        rawCode: sql<string>`${assetProductCodeChangeTable.rawValue}`.as("raw_code"),
        oldValidFrom: assetProductCodeChangeTable.oldValidFrom,
        oldValidTo: assetProductCodeChangeTable.oldValidTo,
        newValidFrom: assetProductCodeChangeTable.newValidFrom,
        newValidTo: assetProductCodeChangeTable.newValidTo,
        savedAt: sql<string>`${assetProductCodeChangeTable.changedAt}`.as("saved_at"),
      })
      .from(assetProductCodeChangeTable),
  );
