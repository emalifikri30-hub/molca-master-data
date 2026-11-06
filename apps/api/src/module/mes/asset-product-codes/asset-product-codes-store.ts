import { and, eq, type SQL } from "drizzle-orm";
import { ulid } from "ulidx";

import { EntityRepository } from "../../../shared/database/entity-repository.js";
import {
  assetProductCodeChangeTable,
  assetProductCodeTable,
} from "../../../shared/database/schema/schema.js";

import type { DbDeps } from "../../../shared/database/open-repo.js";
import type {
  AssetProductCodeChange,
  AssetProductCodes,
  AssetProductCodesFilter,
  CreateAssetProductCodes,
} from "./asset-product-codes.js";

type PaginateAssetProductCodesInput = {
  limit: number;
  offset: number;
} & AssetProductCodesFilter;

const KEYS = ["id", "tagId", "rawValue", "productId", "validFrom", "validTo"];
const CHANGE_KEYS = [
  "changeId",
  "assetProductCodeId",
  "workUnitId",
  "rawValue",
  "action",
  "oldValidFrom",
  "oldValidTo",
  "newValidFrom",
  "newValidTo",
  "changedAt",
];

/**
 * valid_from / valid_to are timestamptz (F-04, #58 part B). Postgres returns
 * them as "2026-02-03 00:00:00+00"; the API keeps answering ISO 8601, so the
 * rules and the screen compare like with like.
 */
class ProductCodeRepository extends EntityRepository<AssetProductCodes> {
  protected toDomain(row: Record<string, unknown>): AssetProductCodes {
    const out = super.toDomain(row);
    const iso = (value: string) => new Date(value).toISOString();
    return {
      ...out,
      validFrom: out.validFrom ? iso(out.validFrom) : out.validFrom,
      validTo: out.validTo ? iso(out.validTo) : out.validTo,
    };
  }
}

class AssetProductCodesStore {
  private repo?: EntityRepository<AssetProductCodes>;
  private changeRepo?: EntityRepository<AssetProductCodeChange>;
  private items: AssetProductCodes[] = [];
  private changeItems: AssetProductCodeChange[] = [];

  constructor(deps?: DbDeps) {
    if (deps?.db && deps.region) {
      this.repo = new ProductCodeRepository(
        { db: deps.db, region: deps.region },
        assetProductCodeTable as never,
        KEYS,
      );
      this.changeRepo = new EntityRepository<AssetProductCodeChange>(
        { db: deps.db, region: deps.region },
        assetProductCodeChangeTable as never,
        CHANGE_KEYS,
        "changeId",
      );
    }
  }

  /**
   * F-04 §9.7 ASSET_PRODUCT_CODE_CHANGE: append one change row. Called after
   * the mapping row is written, inside the same request transaction (#18), so
   * a failed save leaves no change row.
   */
  async recordChange(change: Omit<AssetProductCodeChange, "changeId">): Promise<void> {
    const row: AssetProductCodeChange = { changeId: ulid(), ...change };
    if (this.changeRepo) {
      await this.changeRepo.insert(row);
      return;
    }
    this.changeItems.push(row);
  }

  /** The change rows, oldest first (tests and the in-memory mode only). */
  async changes(): Promise<AssetProductCodeChange[]> {
    if (this.changeRepo) return this.changeRepo.list();
    return [...this.changeItems];
  }

  async paginate({ limit, offset, tagId, productId }: PaginateAssetProductCodesInput): Promise<{
    items: AssetProductCodes[];
    totalElements: number;
  }> {
    if (this.repo) {
      const conds: SQL[] = [];
      if (tagId !== undefined && tagId !== "") conds.push(eq(assetProductCodeTable.tagId, tagId));
      if (productId !== undefined && productId !== "") {
        conds.push(eq(assetProductCodeTable.productId, productId));
      }
      const extra = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
      return this.repo.paginate({ limit, offset }, [], extra);
    }
    let rows = this.items;
    if (tagId !== undefined && tagId !== "") {
      rows = rows.filter((r) => r.tagId === tagId);
    }
    if (productId !== undefined && productId !== "") {
      rows = rows.filter((r) => r.productId === productId);
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  /** Every row — for the per-asset overlap check (A-6b). */
  async all(): Promise<AssetProductCodes[]> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<AssetProductCodes | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateAssetProductCodes): Promise<AssetProductCodes> {
    const row: AssetProductCodes = {
      id: ulid(),
      tagId: input.tagId,
      rawValue: input.rawValue,
      productId: input.productId,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  /**
   * WMS-006 rule 5 (PO 2026-10-04): a row that has not started yet never
   * applied, so an Edit changes it in place. Rows in force are only ended.
   */
  async replaceScheduled(
    id: string,
    patch: Pick<AssetProductCodes, "rawValue" | "validFrom" | "validTo">,
  ): Promise<AssetProductCodes | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  /** WMS-006 rule 5: the only change a row in force takes is its end. */
  async end(id: string, validTo: string): Promise<AssetProductCodes | undefined> {
    if (this.repo) return this.repo.update(id, { validTo });
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    row.validTo = validTo;
    return row;
  }

  async remove(id: string): Promise<string | undefined> {
    if (this.repo) return (await this.repo.delete(id)) ? id : undefined;
    const index = this.items.findIndex((r) => r.id === id);
    if (index === -1) return undefined;
    this.items.splice(index, 1);
    return id;
  }
}

export { AssetProductCodesStore };
export type { PaginateAssetProductCodesInput };
