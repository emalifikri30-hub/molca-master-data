import { and, gt, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetTable } from "../../../shared/database/schema/schema.js";
import { sameCode } from "../../../shared/util/code-match.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { Assets, CreateAssets, UpdateAssets } from "./assets.js";

const KEYS = [
  "id",
  "assetTag",
  "assetName",
  "assetTypeId",
  "serialNumber",
  "parentAssetId",
  "componentLevel",
  "lifecycleStatus",
  "commissioningDate",
  "attributes",
  "validFrom",
  "validTo",
];

type PaginateAssetsInput = {
  limit: number;
  offset: number;
  q?: string;
};

class AssetsStore {
  private repo?: EntityRepository<Assets>;
  private items: Assets[] = [
    {
      id: "asset-1",
      assetTag: "IM-03",
      assetName: "",
      assetTypeId: "type-1",
      serialNumber: "SN-12345",
      parentAssetId: "",
      componentLevel: "equipment_unit",
      lifecycleStatus: "operational",
      commissioningDate: "2024-01-15",
      attributes: {},
      validFrom: "2024-01-15",
      validTo: null,
    },
    {
      id: "asset-2",
      assetTag: "IM-03-HYD",
      assetName: "",
      assetTypeId: "",
      serialNumber: "",
      parentAssetId: "asset-1",
      componentLevel: "subunit",
      lifecycleStatus: "operational",
      commissioningDate: "",
      attributes: {},
      validFrom: "2024-01-15",
      validTo: null,
    },
    {
      id: "asset-3",
      assetTag: "IM-03-HYD-PUMP",
      assetName: "",
      assetTypeId: "",
      serialNumber: "",
      parentAssetId: "asset-2",
      componentLevel: "part",
      lifecycleStatus: "operational",
      commissioningDate: "",
      attributes: {},
      validFrom: "2024-01-15",
      validTo: null,
    },
    {
      id: "asset-4",
      assetTag: "COMP-01",
      assetName: "",
      assetTypeId: "type-2",
      serialNumber: "SN-99001",
      parentAssetId: "",
      componentLevel: "equipment_unit",
      lifecycleStatus: "installed",
      commissioningDate: "2025-06-01",
      attributes: {},
      validFrom: "2025-06-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Assets>(deps, assetTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateAssetsInput): Promise<{
    items: Assets[];
    totalElements: number;
  }> {
    if (this.repo) {
      return this.repo.paginate({ limit, offset, q }, ["assetTag", "assetName", "serialNumber"]);
    }
    let rows = this.items;
    if (q !== undefined && q !== "") {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.assetTag.toLowerCase().includes(needle) ||
          r.assetName.toLowerCase().includes(needle) ||
          r.serialNumber.toLowerCase().includes(needle),
      );
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<Assets | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /** Assets of a type whose record hasn't ended (`valid_to IS NULL`). */
  async activeByType(assetTypeId: string): Promise<Assets[]> {
    const rows = this.repo ? await this.repo.list() : this.items;
    return rows.filter((r) => r.assetTypeId === assetTypeId && r.validTo === null);
  }

  /**
   * US-FND-AST-002 rule 1: the active machine (valid_to empty or later than
   * today) that holds `tag`, compared ignoring letter case and surrounding
   * spaces (docs-molcadx#142). `excludeAssetId` is the machine being edited.
   */
  async findActiveByAssetTag(tag: string, excludeAssetId?: string): Promise<Assets | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          sql`lower(btrim(${assetTable.assetTag})) = lower(btrim(${tag}))`,
          or(isNull(assetTable.validTo), gt(assetTable.validTo, today)),
          excludeAssetId ? ne(assetTable.id, excludeAssetId) : undefined,
        ),
      );
      return rows[0];
    }
    return this.items.find(
      (r) =>
        r.id !== excludeAssetId &&
        sameCode(r.assetTag, tag) &&
        (r.validTo === null || r.validTo > today),
    );
  }

  /** Direct components of an asset (`parent_asset_id = id`), any record state. */
  async childrenOf(parentAssetId: string): Promise<Assets[]> {
    const rows = this.repo ? await this.repo.list() : this.items;
    return rows.filter((r) => r.parentAssetId === parentAssetId);
  }

  async create(input: CreateAssets, validFrom: string, validTo: string | null): Promise<Assets> {
    const row: Assets = {
      id: ulid(),
      assetTag: input.assetTag,
      assetName: input.assetName,
      assetTypeId: input.assetTypeId,
      serialNumber: input.serialNumber,
      parentAssetId: input.parentAssetId,
      componentLevel: input.componentLevel,
      lifecycleStatus: input.lifecycleStatus,
      commissioningDate: input.commissioningDate,
      attributes: input.attributes,
      validFrom,
      validTo,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateAssets & { validTo?: string | null },
  ): Promise<Assets | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { AssetsStore };
export type { PaginateAssetsInput };
