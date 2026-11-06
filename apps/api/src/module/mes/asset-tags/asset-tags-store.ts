import { and, eq, isNull, type SQL } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetTagTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { AssetTags, AssetTagsFilter, CreateAssetTags, UpdateAssetTags } from "./asset-tags.js";

type PaginateAssetTagsInput = {
  limit: number;
  offset: number;
} & AssetTagsFilter;

const KEYS = [
  "id",
  "assetId",
  "dataSourceId",
  "tagName",
  "node",
  "workUnitId",
  "kind",
  "tagRole",
  "rejectReasonId",
  "downtimeReasonId",
  "uomId",
  "countBasis",
  "countSide",
  "validFrom",
  "validTo",
];

class AssetTagsStore {
  private repo?: EntityRepository<AssetTags>;
  private items: AssetTags[] = [
    {
      id: "tag-1",
      assetId: "asset-1",
      dataSourceId: "ds-1",
      tagName: "Total_Count",
      node: "PLC1.DB10.DBW4",
      kind: "cumulative_counter",
      tagRole: "total",
      rejectReasonId: "",
      downtimeReasonId: "",
      uomId: "pcs",
      countBasis: "unit",
      countSide: "output",
      validFrom: "2024-01-15",
      validTo: null,
    },
    {
      id: "tag-2",
      assetId: "asset-1",
      dataSourceId: "ds-1",
      tagName: "Good_Count",
      node: "PLC1.DB10.DBW6",
      kind: "cumulative_counter",
      tagRole: "good",
      rejectReasonId: "",
      downtimeReasonId: "",
      uomId: "pcs",
      countBasis: "unit",
      countSide: "output",
      validFrom: "2024-01-15",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<AssetTags>(deps, assetTagTable, KEYS);
  }

  async paginate({ limit, offset, assetId }: PaginateAssetTagsInput): Promise<{
    items: AssetTags[];
    totalElements: number;
  }> {
    if (this.repo) {
      const extra: SQL | undefined =
        assetId !== undefined && assetId !== "" ? eq(assetTagTable.assetId, assetId) : undefined;
      return this.repo.paginate({ limit, offset }, [], extra);
    }
    let rows = this.items;
    if (assetId !== undefined && assetId !== "") {
      rows = rows.filter((r) => r.assetId === assetId);
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<AssetTags | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateAssetTags): Promise<AssetTags> {
    const row: AssetTags = {
      id: ulid(),
      assetId: input.assetId,
      dataSourceId: input.dataSourceId,
      tagName: input.tagName ?? "",
      node: input.node,
      workUnitId: input.workUnitId ?? "",
      kind: input.kind,
      tagRole: input.tagRole,
      rejectReasonId: input.rejectReasonId,
      downtimeReasonId: input.downtimeReasonId,
      uomId: input.uomId,
      countBasis: input.countBasis,
      countSide: input.countSide ?? "",
      validFrom: input.validFrom,
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateAssetTags): Promise<AssetTags | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  /**
   * US-FND-AST-002 rule 5: ends each still-open tag of `assetId` (valid_to
   * empty) with `validTo`. Tags already ended keep their own date. Runs in
   * the caller's transaction when one is open.
   */
  async endOpenByAsset(assetId: string, validTo: string): Promise<void> {
    const rows = this.repo
      ? await this.repo.list(and(eq(assetTagTable.assetId, assetId), isNull(assetTagTable.validTo)))
      : this.items.filter((r) => r.assetId === assetId && r.validTo === null);
    for (const row of rows) await this.deactivate(row.id, validTo);
  }

  /** Ends the row: sets valid_to. Master data is never hard-deleted (F-00). */
  async deactivate(id: string, validTo: string): Promise<AssetTags | undefined> {
    return this.update(id, { validTo } as never);
  }
}

export { AssetTagsStore };
export type { PaginateAssetTagsInput };
