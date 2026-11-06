import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const rejectReasonTickTable = masterData.table(
  "reject_reason_asset",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    kind: p.text("kind").notNull(),
    reasonId: p.text("reason_id").notNull(),
    assetId: p.text("asset_id").notNull(),
    deletedAt: p.text("deleted_at"),
  },
  scopeIdx("reject_reason_asset"),
);
