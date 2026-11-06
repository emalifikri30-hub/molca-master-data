import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const assetTable = masterData.table(
  "asset",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    assetTag: p.text("asset_tag").notNull(),
    assetName: p.text("asset_name").notNull().default(""),
    assetTypeId: p.text("asset_type_id"), // optional link: NULL = none (nullable-links.ts)
    serialNumber: p.text("serial_number").notNull().default(""),
    parentAssetId: p.text("parent_asset_id"), // optional link: NULL = none (nullable-links.ts)
    componentLevel: p.text("component_level").notNull(),
    lifecycleStatus: p.text("lifecycle_status").notNull(),
    commissioningDate: p.text("commissioning_date").notNull().default(""),
    attributes: p.jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    ...dating(),
  },
  scopeIdx("asset"),
);
