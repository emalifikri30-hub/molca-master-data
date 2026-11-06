// FOUNDATION F-04 §9.7 `ASSET_PRODUCT_CODES` — resolves a raw `product_code`
// tag value to an actual product. Authored on the product's Routing tab
// (PRD-003 US-FND-WMS-006, SCR-FND-WMS-007); the data stays owned by
// Equipment Taxonomy. (A-6b): on one asset, one raw value means one product
// at a time (enforced in the service, ./asset-product-codes-rules.ts).
type AssetProductCodes = {
  id: string;
  /** Must reference a tag with `tagRole = product_code`. */
  tagId: string;
  /** Exactly as the PLC sends it: `12` ≠ `012` ≠ `12 `. */
  rawValue: string;
  productId: string;
  /** UTC timestamp (WMS-006: timestamps, not dates — a code can change mid-shift). */
  validFrom: string;
  /** UTC timestamp; null = open-ended. */
  validTo: string | null;
};

type CreateAssetProductCodes = {
  tagId: string;
  rawValue: string;
  productId: string;
  validFrom: string;
  validTo?: string | null;
};

/** WMS-006 rule 5 (PO 2026-10-04): an Edit — the row's new values, in force from `effectiveFrom`. */
type EditAssetProductCodes = {
  rawValue: string;
  validTo?: string | null;
  effectiveFrom: string;
};

type AssetProductCodesFilter = {
  tagId?: string;
  productId?: string;
};

/**
 * F-04 §9.7 ASSET_PRODUCT_CODE_CHANGE (PO 2026-10-03, docs-molcadx#95): one
 * append-only row per add, Edit, End or Delete (one Edit = one `edit` row,
 * PO 2026-10-04), with the old and new period as UTC
 * timestamps. Feeds the `product_code_mapping_change` view PRODUCTION reads.
 */
type AssetProductCodeChange = {
  changeId: string;
  assetProductCodeId: string;
  /** Where the code's tag counts at save time; null when that can't be told. */
  workUnitId: string | null;
  rawValue: string;
  action: "add" | "edit" | "end" | "delete";
  /** The period before the change; null on `add`. */
  oldValidFrom: string | null;
  oldValidTo: string | null;
  /** The period after the change; null on `delete`. */
  newValidFrom: string | null;
  newValidTo: string | null;
  changedAt: string;
};

export type {
  AssetProductCodes,
  CreateAssetProductCodes,
  EditAssetProductCodes,
  AssetProductCodesFilter,
  AssetProductCodeChange,
};
