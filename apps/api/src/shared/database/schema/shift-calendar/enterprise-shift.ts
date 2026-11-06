import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const enterpriseShiftTable = masterData.table(
  "enterprise_shift",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    // F-02 §9.1 / UX-SIT-6 (PO, 2026-10-19): each enterprise declares its own shifts.
    enterpriseId: p.text("enterprise_id").notNull(),
    label: p.text("label").notNull(),
    ...dating(),
  },
  scopeIdx("enterprise_shift"),
);
