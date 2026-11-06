import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const productDetailTable = masterData.table(
  "product_detail",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    // PRO-002 (per-unit measurement, PO 2026-10-05): the envelope and
    // dimensions moved to product_uom_measurement; this row keeps the two
    // unit pickers — one mass unit for all weight values, one length unit for
    // all dimensions (required when any measurement row has dimensions).
    // Nullable (PO 2026-10-10): the product Edit modal can save batch tracked,
    // barcode and shelf life before any unit is measured; the weight unit is
    // required once the product has a measurement row.
    weightUomId: p.text("weight_uom_id"),
    dimensionUomId: p.text("dimension_uom_id"),
    barcode: p.text("barcode"),
    isBatchTracked: p.boolean("is_batch_tracked").notNull().default(false),
    shelfLifeDays: p.integer("shelf_life_days"),
    ...datingDays(),
  },
  scopeIdx("product_detail"),
);
