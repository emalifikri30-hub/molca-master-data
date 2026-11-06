import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const productTable = masterData.table(
  "product",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    productType: p.text("product_type").notNull(),
    packagingLevel: p.text("packaging_level"),
    baseUomId: p.text("base_uom_id").notNull(),
    // F-06: valid_from / valid_to are dates; phase-out closes valid_to.
    validFrom: p.date("valid_from", { mode: "string" }),
    validTo: p.date("valid_to", { mode: "string" }),
  },
  scopeIdx("product"),
);
