import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

// PRD-003 PRO-002 (per-unit measurement, PO 2026-10-05, F-06 §9.2.1):
// PRODUCT_UOM_MEASUREMENT — one row per unit the product is handled in (base
// unit plus every conversion unit). `volume` is derived (length × width ×
// height), never entered, so it has no column. `min/max/standard_weight` are
// gross mass in PRODUCT_DETAIL.weight_uom_id; `length/width/height` are outer
// dimensions in PRODUCT_DETAIL.dimension_uom_id.
export const productUomMeasurementTable = masterData.table(
  "product_uom_measurement",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    uomId: p.text("uom_id").notNull(),
    minWeight: p.doublePrecision("min_weight").notNull(),
    maxWeight: p.doublePrecision("max_weight").notNull(),
    standardWeight: p.doublePrecision("standard_weight").notNull(),
    length: p.doublePrecision("length"),
    width: p.doublePrecision("width"),
    height: p.doublePrecision("height"),
    ...datingDays(),
  },
  scopeIdx("product_uom_measurement"),
);
