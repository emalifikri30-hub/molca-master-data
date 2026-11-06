import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const downtimeActionTable = masterData.table(
  "downtime_action",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    text: p.text("name").notNull(),
    deletedAt: p.text("deleted_at"),
  },
  scopeIdx("downtime_action"),
);
