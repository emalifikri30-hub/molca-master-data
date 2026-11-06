// FOUNDATION F-04 §9.6 `ASSET_PLACEMENT` — asset-to-work-unit history, never
// overwritten. Only an Equipment-unit-level asset may be placed (enforced in
// the service). A work unit has at most one active `primary` placement (the
// Availability/downtime-detection reference) plus any number of active
// `secondary` placements (auxiliary equipment, no Availability of its own).

import type { PLACEMENT_ROLE_VALUES } from "../../../shared/database/schema/value-lists.js";
type PlacementRole = (typeof PLACEMENT_ROLE_VALUES)[number];

const PLACEMENT_ROLES: PlacementRole[] = ["primary", "secondary"];

type AssetPlacements = {
  id: string;
  assetId: string;
  workUnitId: string;
  placementRole: PlacementRole;
  validFrom: string;
  /** null = still active now. */
  validTo: string | null;
};

type CreateAssetPlacements = {
  assetId: string;
  workUnitId: string;
  placementRole: PlacementRole;
  validFrom: string;
  /**
   * Swap intent: when `placementRole: "primary"` and the work unit already
   * has an active primary, `replace: true` closes the incumbent's row
   * instead of rejecting (A-9). Not a stored field.
   */
  replace?: boolean;
  /**
   * PRD-003 AST-003 rule 8, when the machine is already active on another
   * work unit: `move` closes that row, `add_lane` keeps it (a multi-lane
   * machine). Omitted in that case → 409 `LANE_CHOICE:` so the screen asks.
   * Not a stored field.
   */
  mode?: PlacementMode;
};

/** Move or add a lane (AST-003 AC-7). */
type PlacementMode = "move" | "add_lane";

type UpdateAssetPlacements = Partial<Omit<CreateAssetPlacements, "replace" | "mode">> & {
  validTo?: string | null;
};

/**
 * Flips an *active* placement's role in place — closes it and opens a new
 * row at the same asset/work unit with the new role, same "new history, not
 * an overwrite" rule §9.6 already applies to place/swap. `replace` mirrors
 * `CreateAssetPlacements.replace`: only meaningful when `placementRole:
 * "primary"` collides with another asset's active primary on this work
 * unit (this row's own prior primary state, if any, never counts as a
 * conflict against itself).
 */
type ChangeRoleAssetPlacements = {
  placementRole: PlacementRole;
  validFrom: string;
  replace?: boolean;
};

/** Unplace (US-FND-AST-003 AC-5): close an active row with no new destination. */
type CloseAssetPlacements = {
  validTo: string;
};

type AssetPlacementsFilter = {
  workUnitId?: string;
};

export type {
  AssetPlacements,
  CreateAssetPlacements,
  UpdateAssetPlacements,
  ChangeRoleAssetPlacements,
  CloseAssetPlacements,
  AssetPlacementsFilter,
  PlacementRole,
  PlacementMode,
};
export { PLACEMENT_ROLES };
