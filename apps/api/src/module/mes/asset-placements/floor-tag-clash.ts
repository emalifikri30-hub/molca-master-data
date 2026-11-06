// PRD-003 US-FND-AST-002 rule 8 / US-FND-AST-003 rule 10 (F-04 §9.7.1,
// PO 2026-10-02): two machines placed on one work unit may not have floor
// tags that clean to the same address segment (`MITSUM-1` and `MITSUM 1`
// both give `MITSUM_1`). Checked on a floor-tag change and on a placement.
import { HTTPException } from "hono/http-exception";

import { findSegmentClash, segmentClashMessage } from "../asset-tags/generated-address.js";

import type { AssetPlacementsStore } from "./asset-placements-store.js";
import type { AssetsStore } from "../assets/assets-store.js";

/**
 * Throws 409 with `dsr-001.error.segment-clash` (same text in UX 04) when a
 * machine of `asset` on any of `workUnitIds` — other than the asset itself
 * and `ignoreAssetIds` (an incumbent being swapped out) — cleans alike.
 */
async function assertNoFloorTagClash(
  deps: { placements: AssetPlacementsStore; assets: AssetsStore },
  asset: { id: string; assetTag: string },
  workUnitIds: ReadonlyArray<string>,
  ignoreAssetIds: ReadonlyArray<string> = [],
): Promise<void> {
  if (workUnitIds.length === 0) return;
  const active = await deps.placements.active();
  const neighbourIds = new Set(
    active
      .filter((p) => workUnitIds.includes(p.workUnitId))
      .map((p) => p.assetId)
      .filter((id) => id !== asset.id && !ignoreAssetIds.includes(id)),
  );
  const neighbours: { code: string }[] = [];
  for (const id of neighbourIds) {
    const row = await deps.assets.get(id);
    if (row) neighbours.push({ code: row.assetTag });
  }
  const clash = findSegmentClash(neighbours, asset.assetTag);
  if (clash) {
    throw new HTTPException(409, { message: segmentClashMessage(clash.code, asset.assetTag) });
  }
}

export { assertNoFloorTagClash };
