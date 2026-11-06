// FOUNDATION F-04 §9.2 `ASSET_CLASS` — top-level taxonomy, purely
// organizational. Deliberately no attribute-value field: grouping only.
// PRD-003 US-FND-AST-001 rule 3: never deleted, only deactivated (`validTo`).
type AssetClasses = {
  id: string;
  code: string;
  name: string;
  /** Self-nesting so the taxonomy can be refined without splitting entities. "" = top-level. */
  parentClassId: string;
  validFrom: string;
  /** null = active. Set by deactivation, never by a delete. */
  validTo: string | null;
};

type CreateAssetClasses = {
  code: string;
  name: string;
  parentClassId: string;
};

type UpdateAssetClasses = Partial<CreateAssetClasses>;

type DeactivateAssetClasses = {
  validTo?: string;
};

type AssetClassesFilter = {
  q?: string;
};

export type {
  AssetClasses,
  CreateAssetClasses,
  UpdateAssetClasses,
  DeactivateAssetClasses,
  AssetClassesFilter,
};
