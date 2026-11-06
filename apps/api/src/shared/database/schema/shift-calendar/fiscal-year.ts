import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const fiscalYearTable = masterData.table(
  "fiscal_year",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    // F-03 §9.1 / UX-SIT-6 (PO, 2026-10-19): each enterprise declares its own fiscal years.
    enterpriseId: p.text("enterprise_id").notNull(),
    label: p.text("label").notNull(),
    calendarBasis: p.text("calendar_basis").notNull(),
    startMonth: p.integer("start_month"),
    endMonth: p.integer("end_month"),
    periodPattern: p.text("period_pattern"),
    startDate: p.text("start_date").notNull(),
    endDate: p.text("end_date").notNull(),
    lineageId: p.text("lineage_id").notNull(),
    previousVersionId: p.text("previous_version_id"),
    ...dating(),
  },
  scopeIdx("fiscal_year"),
);
