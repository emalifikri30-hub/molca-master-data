import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingTimes, scopeIdx } from "../columns.js";

export const assetProductCodeTable = masterData.table(
  "asset_product_code",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    tagId: p.text("tag_id").notNull(),
    rawValue: p.text("raw_value").notNull(),
    productId: p.text("product_id").notNull(),
    ...datingTimes(),
  },
  scopeIdx("asset_product_code"),
);
