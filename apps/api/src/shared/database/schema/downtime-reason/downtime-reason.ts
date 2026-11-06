import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const downtimeReasonTable = masterData.table(
  "downtime_reason",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    downtimeCategory: p.text("downtime_category").notNull(),
    deletedAt: p.text("deleted_at"),
  },
  scopeIdx("downtime_reason"),
);
