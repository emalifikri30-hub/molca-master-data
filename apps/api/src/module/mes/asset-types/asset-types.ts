// FOUNDATION F-04 §9.3 `ASSET_TYPE` — model/spec. The single shared source for
// a Type's spec values (`attributes`); every ASSET of this Type reads from
// here rather than storing its own copy.
// PRD-003 US-FND-AST-001 rule 3: never deleted, only deactivated (`validTo`).
type AssetTypes = {
  id: string;
  assetClassId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  /** Shared technical attribute values, e.g. { clamping_force_tons: "250" }. */
  attributes: Record<string, string>;
  validFrom: string;
  /** null = active. Set by deactivation, never by a delete. */
  validTo: string | null;
};

type CreateAssetTypes = {
  assetClassId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  attributes: Record<string, string>;
};

type UpdateAssetTypes = Partial<CreateAssetTypes>;

type DeactivateAssetTypes = {
  validTo?: string;
};

type AssetTypesFilter = {
  q?: string;
};

export type {
  AssetTypes,
  CreateAssetTypes,
  UpdateAssetTypes,
  DeactivateAssetTypes,
  AssetTypesFilter,
};
