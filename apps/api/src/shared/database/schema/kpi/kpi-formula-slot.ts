import * as p from "drizzle-orm/pg-core";

import { masterData, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const kpiFormulaSlotTable = masterData.table(
  "kpi_formula_slot",
  {
    slotId: p.text("slot_id").primaryKey(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    domain: p.text("domain").notNull(),
    metric: p.text("metric").notNull(),
    isoElement: p.text("iso_element"),
    bindable: p.boolean("bindable").notNull(),
    // F-07.1 §9.1 (PO 2026-10-02): false = an optional check, the metric computes without it.
    required: p.boolean("required").notNull().default(true),
  },
  scopeIdx("kpi_formula_slot"),
);
