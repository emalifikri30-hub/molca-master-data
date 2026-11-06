import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const bomTable = masterData.table(
  "bom",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    flowId: p.text("flow_id").notNull(),
    version: p.integer("version").notNull(),
    status: p.text("status").notNull(),
    baseQty: p.doublePrecision("base_qty").notNull(),
    baseUomId: p.text("base_uom_id").notNull(),
    isPhantom: p.boolean("is_phantom").notNull(),
    ...datingDays(),
  },
  (t) => [
    ...scopeIdx("bom")(t),
    // F-08 BOM: versions numbered per flow.
    p.unique("bom_flow_version_key").on(t.flowId, t.version),
  ],
);
