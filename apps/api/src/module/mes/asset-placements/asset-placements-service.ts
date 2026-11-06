import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type {
  AssetPlacements,
  AssetPlacementsFilter,
  ChangeRoleAssetPlacements,
  CloseAssetPlacements,
  CreateAssetPlacements,
} from "./asset-placements.js";
import { assertNoFloorTagClash } from "./floor-tag-clash.js";

import type { AssetPlacementsStore } from "./asset-placements-store.js";
import type { AssetsStore } from "../assets/assets-store.js";
import type { AreasStore } from "../areas/areas-store.js";
import type { SitesStore } from "../sites/sites-store.js";
import type { WorkCentersStore } from "../work-centers/work-centers-store.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";

type PagedAssetPlacementsResult = PagedResult<AssetPlacements>;

type TAssetPlacementsService = {
  getPaged: (
    page: number,
    size: number,
    filter: AssetPlacementsFilter,
  ) => Promise<PagedAssetPlacementsResult>;
  get: (id: string) => Promise<AssetPlacements>;
  create: (input: CreateAssetPlacements) => Promise<AssetPlacements>;
  changeRole: (id: string, input: ChangeRoleAssetPlacements) => Promise<AssetPlacements>;
  close: (id: string, input: CloseAssetPlacements) => Promise<AssetPlacements>;
};

type AssetPlacementsServiceDeps = {
  assetPlacementsStore: AssetPlacementsStore;
  assetsStore: AssetsStore;
  workUnitsStore: WorkUnitsStore;
  workCentersStore: WorkCentersStore;
  areasStore: AreasStore;
  sitesStore: SitesStore;
};

/** "2026-01-01 → open" / "2026-01-01 → 2026-06-30" — how a colliding range is named. */
function rangeLabel(row: AssetPlacements): string {
  return `${row.validFrom} → ${row.validTo ?? "open"}`;
}

/**
 * Validity is half-open, `[valid_from, valid_to)`, matching the PRD's
 * placement(work_unit, t) formula (`valid_from ≤ t AND (valid_to IS NULL OR
 * valid_to > t)`). A row closed "at" D therefore stops covering D itself.
 */
class AssetPlacementsService implements TAssetPlacementsService {
  private store: AssetPlacementsStore;
  private assetsStore: AssetsStore;
  private workUnits: WorkUnitsStore;
  private workCenters: WorkCentersStore;
  private areas: AreasStore;
  private sites: SitesStore;

  constructor(deps: AssetPlacementsServiceDeps) {
    this.store = deps.assetPlacementsStore;
    this.assetsStore = deps.assetsStore;
    this.workUnits = deps.workUnitsStore;
    this.workCenters = deps.workCentersStore;
    this.areas = deps.areasStore;
    this.sites = deps.sitesStore;
  }

  /** The site a work unit sits in (work unit → work center → area → site). */
  private async siteOf(workUnitId: string): Promise<string | undefined> {
    const unit = await this.workUnits.get(workUnitId);
    const wc = unit ? await this.workCenters.get(unit.workCenterId) : undefined;
    const area = wc ? await this.areas.get(wc.areaId) : undefined;
    return area?.siteId;
  }

  async getPaged(
    page: number,
    size: number,
    filter: AssetPlacementsFilter,
  ): Promise<PagedAssetPlacementsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({
      limit,
      offset,
      workUnitId: filter.workUnitId,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<AssetPlacements> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-placements not found" });
    return row;
  }

  async create(input: CreateAssetPlacements): Promise<AssetPlacements> {
    const asset = await this.assetsStore.get(input.assetId);
    if (!asset) throw new HTTPException(404, { message: "asset not found" });
    // F-04 §9.4: only an operational machine occupies a station.
    const status = asset.validTo !== null ? "decommissioned" : asset.lifecycleStatus;
    if (status !== "operational") {
      throw new HTTPException(422, {
        message: `${asset.assetTag} is ${status} — only an operational machine can be placed.`,
      });
    }
    // Rules 1 & 6: only a top-level Equipment unit (`parent_asset_id IS NULL`)
    // may be placed — components inherit their site from their parent.
    if (asset.parentAssetId !== "" || asset.componentLevel !== "equipment_unit") {
      throw new HTTPException(422, {
        message: `${asset.assetTag} is a component — only a top-level Equipment unit can be placed on a work unit.`,
      });
    }

    // SIT-002 rule 4: an inactive work unit no longer takes new data, so it
    // can't receive a placement dated on or after its own valid_to.
    const unit = await this.workUnits.get(input.workUnitId);
    if (!unit) throw new HTTPException(404, { message: "work unit not found" });
    if (unit.validTo && unit.validTo <= input.validFrom) {
      throw new HTTPException(422, {
        message: `${unit.code} is inactive since ${unit.validTo} — pick an active work unit.`,
      });
    }

    const alreadyActiveHere = await this.store.activeByAssetOnWorkUnit(
      input.workUnitId,
      input.assetId,
    );
    if (alreadyActiveHere) {
      throw new HTTPException(409, {
        message: `${asset.assetTag} is already actively placed on this work unit.`,
      });
    }

    // AC-4: the new open-ended row [validFrom, ∞) collides with any row of the
    // same machine that is still in force on or after validFrom — except the
    // machine's own active row that started earlier, which is the "move" case
    // (AC-1) and is closed below.
    const ownRows = await this.store.byAsset(input.assetId);
    const colliding = ownRows.find((r) => {
      const isMovable = r.validTo === null && r.validFrom < input.validFrom;
      if (isMovable) return false;
      return r.validTo === null || r.validTo > input.validFrom;
    });
    if (colliding) {
      throw new HTTPException(409, {
        message: `${asset.assetTag} already has a placement in force for ${rangeLabel(colliding)}, which overlaps ${input.validFrom}.`,
      });
    }

    // Rule 8 / AC-7: already active elsewhere → never silent. The screen
    // must say whether this is a move or an added lane.
    const activeElsewhere = ownRows.filter(
      (r) => r.validTo === null && r.workUnitId !== input.workUnitId,
    );
    if (activeElsewhere.length > 0 && input.mode === undefined) {
      throw new HTTPException(409, {
        message: `LANE_CHOICE:${activeElsewhere.map((r) => r.workUnitId).join(",")}`,
      });
    }
    // AC-8: every lane of a machine is in one site.
    if (input.mode === "add_lane") {
      const newSite = await this.siteOf(input.workUnitId);
      const otherSites = await Promise.all(activeElsewhere.map((r) => this.siteOf(r.workUnitId)));
      const otherSite = otherSites.find((site) => site !== newSite);
      if (otherSite !== undefined) {
        const unit = await this.workUnits.get(input.workUnitId);
        const site = newSite ? await this.sites.get(newSite) : undefined;
        const siteName = site?.name ?? newSite ?? "another site";
        throw new HTTPException(422, {
          message: `${unit?.code ?? input.workUnitId} is in ${siteName}. All lanes of a machine must be in one site.`,
        });
      }
    }

    // Rule 10 / AC-10: no two machines on one work unit whose floor tags
    // clean to the same segment. A swapped-out primary leaves, so it can't clash.
    const leaving =
      input.placementRole === "primary" && input.replace
        ? [(await this.store.activePrimary(input.workUnitId))?.assetId ?? ""]
        : [];
    await assertNoFloorTagClash(
      { placements: this.store, assets: this.assetsStore },
      asset,
      [input.workUnitId],
      leaving,
    );

    if (input.placementRole === "primary") {
      const incumbent = await this.store.activePrimary(input.workUnitId);
      if (incumbent) {
        if (!input.replace) {
          // Encodes the incumbent asset id in the error message (surfaced
          // verbatim as `data.error` by the shared error handler) so the
          // client can name the incumbent's tag and offer "swap anyway"
          // without a second round trip (AC-3).
          throw new HTTPException(409, { message: `CONFLICT:${incumbent.assetId}` });
        }
        if (incumbent.validFrom >= input.validFrom) {
          throw new HTTPException(409, {
            message: `The current primary started ${incumbent.validFrom}; the swap date must be after it.`,
          });
        }
        await this.store.update(incumbent.id, { validTo: input.validFrom });
      }
    }

    // AC-1: a move closes the machine's own previous active row at the new
    // row's validFrom — never overwritten, never deleted (rule 3). An added
    // lane keeps them (AC-7).
    if (input.mode !== "add_lane") {
      for (const row of ownRows) {
        if (row.validTo === null) await this.store.update(row.id, { validTo: input.validFrom });
      }
    }

    const { mode: _mode, ...row } = input;
    return this.store.create(row);
  }

  async changeRole(id: string, input: ChangeRoleAssetPlacements): Promise<AssetPlacements> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "asset-placements not found" });
    if (current.validTo !== null) {
      throw new HTTPException(422, { message: "only an active placement can change role" });
    }
    if (current.placementRole === input.placementRole) {
      throw new HTTPException(422, { message: "placement is already that role" });
    }
    if (current.validFrom >= input.validFrom) {
      throw new HTTPException(422, {
        message: `This placement started ${current.validFrom}; the change date must be after it.`,
      });
    }

    if (input.placementRole === "primary") {
      const incumbent = await this.store.activePrimary(current.workUnitId);
      // The row being changed can't be its own conflict — exclude it.
      if (incumbent && incumbent.id !== current.id) {
        if (!input.replace) {
          throw new HTTPException(409, { message: `CONFLICT:${incumbent.assetId}` });
        }
        await this.store.update(incumbent.id, { validTo: input.validFrom });
      }
    }

    await this.store.update(current.id, { validTo: input.validFrom });
    return this.store.create({
      assetId: current.assetId,
      workUnitId: current.workUnitId,
      placementRole: input.placementRole,
      validFrom: input.validFrom,
    });
  }

  /**
   * US-FND-AST-003 AC-5: unplacing closes the row with no new destination.
   * Replaces the old DELETE — history is never removed.
   */
  async close(id: string, input: CloseAssetPlacements): Promise<AssetPlacements> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-placements not found" });
    if (row.validTo !== null) {
      throw new HTTPException(422, { message: "This placement is already closed." });
    }
    if (input.validTo <= row.validFrom) {
      throw new HTTPException(422, {
        message: `This placement started ${row.validFrom}; the end date must be after it.`,
      });
    }
    const updated = await this.store.update(id, { validTo: input.validTo });
    if (!updated) throw new HTTPException(404, { message: "asset-placements not found" });
    return updated;
  }
}

export { AssetPlacementsService };
export type { TAssetPlacementsService, AssetPlacementsServiceDeps, PagedAssetPlacementsResult };
