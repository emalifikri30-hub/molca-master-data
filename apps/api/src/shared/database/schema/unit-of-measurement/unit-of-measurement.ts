import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const unitOfMeasurementTable = masterData.table(
  "unit_of_measurement",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    unit: p.text("unit").notNull(),
    measurementGroupId: p.text("measurement_group_id").notNull(),
    // PRD-003 REF-006 (PO, 2026-10-21, F-05 T-9): deactivate stamps it, like the reason lists.
    deletedAt: p.text("deleted_at"),
  },
  scopeIdx("unit_of_measurement"),
);
