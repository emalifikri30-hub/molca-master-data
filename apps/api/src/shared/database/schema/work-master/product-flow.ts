import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const productFlowTable = masterData.table(
  "product_flow",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    flowCode: p.text("flow_code").notNull(),
    flowName: p.text("flow_name").notNull(),
    isPrimary: p.boolean("is_primary").notNull(),
    status: p.text("status").notNull(),
    ...datingDays(),
  },
  (t) => [
    ...scopeIdx("product_flow")(t),
    // F-08 PRODUCT_FLOW: flow code unique per product.
    p.unique("product_flow_product_code_key").on(t.productId, t.flowCode),
  ],
);
