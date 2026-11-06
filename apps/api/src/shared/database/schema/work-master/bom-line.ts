import { sql } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const bomLineTable = masterData.table(
  "bom_line",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    bomId: p.text("bom_id").notNull(),
    componentProductId: p.text("component_product_id").notNull(),
    stepId: p.text("step_id"),
    lineUse: p.text("line_use").notNull(),
    isPrimaryOutput: p.boolean("is_primary_output"),
    qtyPerUnit: p.doublePrecision("qty_per_unit").notNull(),
    uomId: p.text("uom_id").notNull(),
    scrapFactor: p.doublePrecision("scrap_factor").notNull(),
    dispenseToleranceType: p.text("dispense_tolerance_type"),
    dispenseToleranceValue: p.doublePrecision("dispense_tolerance_value"),
    validTo: p.text("valid_to"),
  },
  (t) => [
    ...scopeIdx("bom_line")(t),
    // F-08 BOM_LINE: exactly one primary output per (BOM, step) among produced lines.
    p
      .uniqueIndex("bom_line_one_primary_output")
      .on(t.bomId, t.stepId)
      .where(sql`${t.lineUse} = 'produced' AND ${t.isPrimaryOutput} = true`),
  ],
);
