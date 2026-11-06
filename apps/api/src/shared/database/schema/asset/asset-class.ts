import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const assetClassTable = masterData.table(
  "asset_class",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    parentClassId: p.text("parent_class_id"), // optional link: NULL = none (nullable-links.ts)
    ...dating(),
  },
  scopeIdx("asset_class"),
);
