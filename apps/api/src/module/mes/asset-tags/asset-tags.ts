// FOUNDATION F-04 §9.7 `ASSET_TAGS` — per-asset tag -> signal declaration.
// Declares which PLC/sensor tag addresses belong to which asset and what
// each one means; it does not store readings. `asset_id` is Equipment-unit
// level only (validated in the service).

import {
  ASSET_TAG_COUNT_BASIS_VALUES,
  ASSET_TAG_COUNT_SIDE_VALUES,
  ASSET_TAG_KIND_VALUES,
  ASSET_TAG_ROLE_VALUES,
} from "../../../shared/database/schema/value-lists.js";
type TagKind = (typeof ASSET_TAG_KIND_VALUES)[number];
/** The values and what each role means: schema/value-lists.ts (F-04 §9.7). */
type TagRole = (typeof ASSET_TAG_ROLE_VALUES)[number];
type CountBasis = (typeof ASSET_TAG_COUNT_BASIS_VALUES)[number];
/** F-04 §9.7 (issue #58): which side of the step a total/good/reject counter sits on. */
type CountSide = (typeof ASSET_TAG_COUNT_SIDE_VALUES)[number];

const TAG_KINDS: TagKind[] = [...ASSET_TAG_KIND_VALUES];
const TAG_ROLES: TagRole[] = [...ASSET_TAG_ROLE_VALUES];
/** F-04 §9.7: `count_side` applies only to these roles. */
const COUNTED_ROLES: ReadonlySet<TagRole> = new Set(["total", "good", "reject"]);
const COUNT_SIDES: CountSide[] = [...ASSET_TAG_COUNT_SIDE_VALUES];
/** F-04 §9.7: these count only on the tag's own lane; the rest cover every lane of the machine. */
const PER_LANE_ROLES: ReadonlySet<TagRole> = new Set([
  "product_code",
  "total",
  "good",
  "reject",
  "reject_reason",
  "speed",
]);
const COUNT_BASES: CountBasis[] = [...ASSET_TAG_COUNT_BASIS_VALUES];

type AssetTags = {
  id: string;
  assetId: string;
  /** FK -> DATA_SOURCE (F-13 §9.1) — which PLC/OPC UA server/MQTT broker this tag is read from. Modeled client-side only for now (apps/web/src/features/data-sources), no backend module yet. */
  dataSourceId: string;
  /**
   * PRD-003 DSR-001 rule 8 / F-04 §9.7: the name the implementor types
   * ("Total_Count") — letters, digits and `_`, unique per machine among
   * active tags. The last segment of a generated address.
   */
  tagName: string;
  /** Protocol-specific address, e.g. an OPC UA node ID or MQTT topic. */
  node: string;
  /**
   * PRD-003 KPI-007 AC-9 / F-04 §9.7: the lane (work unit) a per-lane tag of
   * a multi-lane machine belongs to. "" = machine-wide, valid on every lane.
   */
  workUnitId?: string;
  kind: TagKind;
  tagRole: TagRole;
  /** Only set when `tagRole = reject`. */
  rejectReasonId: string;
  /** Only set when `tagRole = downtime_reason`. */
  downtimeReasonId: string;
  /** Required for total/good/reject/speed/runtime. */
  uomId: string;
  /** Required when `tagRole` is total/good/reject. "" = not applicable. */
  countBasis: CountBasis | "";
  /** total/good/reject only: `output` (default) or `input`. "" = not applicable. */
  countSide: CountSide | "";
  validFrom: string;
  /** null = still wired this way now. */
  validTo: string | null;
};

type CreateAssetTags = {
  assetId: string;
  dataSourceId: string;
  tagName?: string;
  node: string;
  /** Lane of a per-lane tag; "" = machine-wide. */
  workUnitId?: string;
  kind: TagKind;
  tagRole: TagRole;
  rejectReasonId: string;
  downtimeReasonId: string;
  uomId: string;
  countBasis: CountBasis | "";
  /** Defaults to `output` on a total/good/reject tag. */
  countSide?: CountSide | "";
  validFrom: string;
};

type UpdateAssetTags = Partial<CreateAssetTags> & { validTo?: string | null };

type AssetTagsFilter = {
  assetId?: string;
};

export type {
  AssetTags,
  CreateAssetTags,
  UpdateAssetTags,
  AssetTagsFilter,
  TagKind,
  TagRole,
  CountBasis,
  CountSide,
};
export { TAG_KINDS, TAG_ROLES, PER_LANE_ROLES, COUNT_BASES, COUNTED_ROLES, COUNT_SIDES };
