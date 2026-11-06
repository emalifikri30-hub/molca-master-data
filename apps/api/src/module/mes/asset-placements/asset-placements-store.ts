import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetPlacementTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type {
  AssetPlacements,
  AssetPlacementsFilter,
  CreateAssetPlacements,
  UpdateAssetPlacements,
} from "./asset-placements.js";

const KEYS = ["id", "assetId", "workUnitId", "placementRole", "validFrom", "validTo"];

type PaginateAssetPlacementsInput = {
  limit: number;
  offset: number;
} & AssetPlacementsFilter;

class AssetPlacementsStore {
  private repo?: EntityRepository<AssetPlacements>;
  private items: AssetPlacements[] = [
    {
      id: "ap-1",
      assetId: "asset-1",
      workUnitId: "wu-1",
      placementRole: "primary",
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<AssetPlacements>(deps, assetPlacementTable, KEYS);
  }

  async paginate({ limit, offset, workUnitId }: PaginateAssetPlacementsInput): Promise<{
    items: AssetPlacements[];
    totalElements: number;
  }> {
    let rows = this.repo ? await this.repo.list() : this.items;
    if (workUnitId !== undefined && workUnitId !== "") {
      rows = rows.filter((r) => r.workUnitId === workUnitId);
    }
    // Active rows first, then most recently started — matches the timeline UI.
    rows = [...rows].sort((a, b) => {
      if ((a.validTo === null) !== (b.validTo === null)) return a.validTo === null ? -1 : 1;
      return b.validFrom.localeCompare(a.validFrom);
    });
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  private async rows(): Promise<AssetPlacements[]> {
    return this.repo ? this.repo.list() : this.items;
  }

  async get(id: string): Promise<AssetPlacements | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async activePrimary(workUnitId: string): Promise<AssetPlacements | undefined> {
    return (await this.rows()).find(
      (r) => r.workUnitId === workUnitId && r.placementRole === "primary" && r.validTo === null,
    );
  }

  async activeByAssetOnWorkUnit(
    workUnitId: string,
    assetId: string,
  ): Promise<AssetPlacements | undefined> {
    return (await this.rows()).find(
      (r) => r.workUnitId === workUnitId && r.assetId === assetId && r.validTo === null,
    );
  }

  /** Every active placement row, across all work units. */
  async active(): Promise<AssetPlacements[]> {
    return (await this.rows()).filter((r) => r.validTo === null);
  }

  /** Every placement row (active and closed) of one machine, across work units. */
  async byAsset(assetId: string): Promise<AssetPlacements[]> {
    return (await this.rows()).filter((r) => r.assetId === assetId);
  }

  async create(input: CreateAssetPlacements): Promise<AssetPlacements> {
    const row: AssetPlacements = {
      id: ulid(),
      assetId: input.assetId,
      workUnitId: input.workUnitId,
      placementRole: input.placementRole,
      validFrom: input.validFrom,
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateAssetPlacements): Promise<AssetPlacements | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { AssetPlacementsStore };
export type { PaginateAssetPlacementsInput };
