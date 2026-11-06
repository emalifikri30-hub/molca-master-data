import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const assetTypeTable = masterData.table(
  "asset_type",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    assetClassId: p.text("asset_class_id").notNull(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    manufacturer: p.text("manufacturer").notNull().default(""),
    model: p.text("model").notNull().default(""),
    attributes: p.jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    ...dating(),
  },
  scopeIdx("asset_type"),
);
