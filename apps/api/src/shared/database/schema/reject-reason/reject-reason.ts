import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const rejectReasonTable = masterData.table(
  "reject_reason",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    deletedAt: p.text("deleted_at"),
  },
  scopeIdx("reject_reason"),
);
