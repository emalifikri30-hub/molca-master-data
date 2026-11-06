// FOUNDATION F-04 §9.4 `ASSET` — core attributes. The Instance layer of
// Class → Type → Instance, and also every node in the ISO 14224 component
// nesting (Equipment unit → Subunit → Maintainable item → Part) via
// `parentAssetId`. "" is used as the empty-FK sentinel throughout this
// codebase (see e.g. the old `equipment.parentId`), not `null`.
//
// PRD-003 US-FND-AST-002 §5: no `siteId` (derived read-only from the active
// ASSET_PLACEMENT, B6), no `workUnitId` (does not exist), and
// `owner_org_unit_id` is left out until its FK target is decided (TBD).

import type {
  COMPONENT_LEVEL_VALUES,
  LIFECYCLE_STATUS_VALUES,
} from "../../../shared/database/schema/value-lists.js";
type ComponentLevel = (typeof COMPONENT_LEVEL_VALUES)[number];
type LifecycleStatus = (typeof LIFECYCLE_STATUS_VALUES)[number];

const COMPONENT_LEVELS: ComponentLevel[] = [
  "equipment_unit",
  "subunit",
  "maintainable_item",
  "part",
];
const LIFECYCLE_STATUSES: LifecycleStatus[] = [
  "planned",
  "installed",
  "operational",
  "under_maintenance",
  "idle",
  "decommissioned",
];

/** PRD-003 US-FND-AST-002 §3 text limits. */
const ASSET_TAG_MAX = 30;
const ASSET_NAME_MAX = 80;

type Assets = {
  id: string;
  /** The code on the machine body, what an operator reads/scans. */
  assetTag: string;
  /** Human-friendly per-instance label ("Packer 3") — optional, free text, no
   * uniqueness constraint (F-04 §9.4, added 2026-09-21). "" = unset, screens
   * fall back to the derived name (Type name, then `assetTag`). */
  assetName: string;
  /** "" = not yet classified. */
  assetTypeId: string;
  serialNumber: string;
  /** Current parent only, not history — see `ASSET_COMPONENT_LINK`. "" = no parent (top-level Equipment unit). */
  parentAssetId: string;
  componentLevel: ComponentLevel;
  lifecycleStatus: LifecycleStatus;
  commissioningDate: string;
  /** Instance-level exceptions only — the shared spec lives on `ASSET_TYPE.attributes`. */
  attributes: Record<string, string>;
  validFrom: string;
  /** null = record still in force. Set when decommissioned — assets are never deleted. */
  validTo: string | null;
};

type CreateAssets = {
  assetTag: string;
  assetName: string;
  assetTypeId: string;
  serialNumber: string;
  parentAssetId: string;
  componentLevel: ComponentLevel;
  lifecycleStatus: LifecycleStatus;
  commissioningDate: string;
  attributes: Record<string, string>;
};

type UpdateAssets = Partial<CreateAssets>;

type AssetsFilter = {
  q?: string;
};

export type { Assets, CreateAssets, UpdateAssets, AssetsFilter, ComponentLevel, LifecycleStatus };
export { COMPONENT_LEVELS, LIFECYCLE_STATUSES, ASSET_TAG_MAX, ASSET_NAME_MAX };
