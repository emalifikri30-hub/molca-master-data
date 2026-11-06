import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const productUomConversionTable = masterData.table(
  "product_uom_conversion",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    fromUomId: p.text("from_uom_id").notNull(),
    toUomId: p.text("to_uom_id").notNull(),
    conversionValue: p.doublePrecision("conversion_value").notNull(),
    ...dating(),
  },
  scopeIdx("product_uom_conversion"),
);
