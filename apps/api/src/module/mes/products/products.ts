// FOUNDATION F-06 Product (PRD-003 06-product.md): PRODUCT, PRODUCT_DETAIL
// (versioned) and PRODUCT_UOM_CONVERSION (per product, versioned).
// PRODUCT_CYCLE is retired (2026-09-28, US-FND-PRO-004): cycle time lives only
// on Work Master's OPERATION.

import type {
  PACKAGING_LEVEL_VALUES,
  PRODUCT_TYPE_VALUES,
} from "../../../shared/database/schema/value-lists.js";
// PRO-001 rule 2 (PO 2026-09-30): five flat types. Raw material, packaging and
// consumable are bought; semi-finished and finished good are made.
type ProductType = (typeof PRODUCT_TYPE_VALUES)[number];

/** PRO-001 rule 2: required when the type is `packaging`, empty otherwise. */
type PackagingLevel = (typeof PACKAGING_LEVEL_VALUES)[number];

/** PRO-001 AC-12: only made products count for readiness and get BOM / routing badges. */
const MADE_TYPES: ReadonlyArray<ProductType> = ["semi_finished", "finished_good"];

type Product = {
  id: string;
  code: string;
  name: string;
  productType: ProductType;
  packagingLevel?: PackagingLevel | null;
  baseUomId: string;
  /** F-06: the date the product starts to apply (set on create). */
  validFrom?: string | null;
  /** PRO-001 AC-6: closing sets this. null = active. */
  validTo?: string | null;
};

type ProductDetail = {
  productId: string;
  /** PRO-002 rule 2 (Q-20, 2026-10-01): one mass unit for every weight value,
   * here and on the per-unit measurement rows. null until a unit is measured
   * (PO 2026-10-10); required once the product has a measurement row. */
  weightUomId: string | null;
  /** PRO-002 rule 2 (per-unit measurement, 2026-10-05): one length unit for
   * every dimension; required when any measurement row has dimensions. */
  dimensionUomId?: string | null;
  barcode?: string;
  isBatchTracked: boolean;
  shelfLifeDays?: number;
  validFrom?: string;
  validTo?: string | null;
};

/** PRO-002 (per-unit measurement, PO 2026-10-05, F-06 §9.2.1): the gross
 * mass envelope and outer dimensions of one unit of this product — one row
 * per unit (base unit plus every conversion unit), never derived from the
 * conversion factor. `volume` is derived (length × width × height), never
 * entered, so the type carries it but no input does. */
type ProductUomMeasurement = {
  id: string;
  productId: string;
  uomId: string;
  minWeight: number;
  maxWeight: number;
  standardWeight: number;
  length?: number;
  width?: number;
  height?: number;
  /** Derived: length × width × height in dimension_uom_id cubed. */
  volume?: number;
  validFrom?: string;
  validTo?: string | null;
};

type ProductUomConversion = {
  id: string;
  productId: string;
  fromUomId: string;
  toUomId: string;
  conversionValue: number;
  validFrom?: string;
  validTo?: string | null;
};

export { MADE_TYPES };
export type {
  ProductType,
  PackagingLevel,
  Product,
  ProductDetail,
  ProductUomMeasurement,
  ProductUomConversion,
};
