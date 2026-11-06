import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetTypeTable } from "../../../shared/database/schema/schema.js";
import { sameCode } from "../../../shared/util/code-match.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { AssetTypes, CreateAssetTypes, UpdateAssetTypes } from "./asset-types.js";

type PaginateAssetTypesInput = {
  limit: number;
  offset: number;
  q?: string;
};

const KEYS = [
  "id",
  "assetClassId",
  "code",
  "name",
  "manufacturer",
  "model",
  "attributes",
  "validFrom",
  "validTo",
];

class AssetTypesStore {
  private repo?: EntityRepository<AssetTypes>;
  private items: AssetTypes[] = [
    {
      id: "type-1",
      assetClassId: "class-1",
      code: "IM-250T",
      name: "Injection Molding 250T",
      manufacturer: "Arburg",
      model: "Allrounder 470 A",
      attributes: { clamping_force_tons: "250", voltage: "380" },
      validFrom: "2026-01-01",
      validTo: null,
    },
    {
      id: "type-2",
      assetClassId: "class-2",
      code: "COMP-75KW",
      name: "Air Compressor 75kW",
      manufacturer: "Atlas Copco",
      model: "GA75",
      attributes: { power_kw: "75" },
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<AssetTypes>(deps, assetTypeTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateAssetTypesInput): Promise<{
    items: AssetTypes[];
    totalElements: number;
  }> {
    if (this.repo) return this.repo.paginate({ limit, offset, q }, ["code", "name"]);
    let rows = this.items;
    if (q !== undefined && q !== "") {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (r) => r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle),
      );
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<AssetTypes | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /**
   * Active rows only (PRD-003 AST-001 AC-8, PO 2026-10-21): a deactivated type
   * frees its code. Codes are unique per tenant. docs-molcadx#142: the match
   * ignores case and surrounding spaces; `excludeId` is the row being edited.
   */
  async findByCode(code: string, excludeId?: string): Promise<AssetTypes | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          sql`lower(btrim(${assetTypeTable.code})) = lower(btrim(${code}))`,
          or(isNull(assetTypeTable.validTo), gt(assetTypeTable.validTo, today)),
          excludeId ? ne(assetTypeTable.id, excludeId) : undefined,
        ),
      );
      return rows[0];
    }
    return this.items.find(
      (r) =>
        r.id !== excludeId && (r.validTo == null || r.validTo > today) && sameCode(r.code, code),
    );
  }

  async activeByClass(assetClassId: string): Promise<AssetTypes[]> {
    if (this.repo) {
      return this.repo.list(
        and(eq(assetTypeTable.assetClassId, assetClassId), isNull(assetTypeTable.validTo)),
      );
    }
    return this.items.filter((r) => r.assetClassId === assetClassId && r.validTo === null);
  }

  async create(input: CreateAssetTypes, validFrom: string): Promise<AssetTypes> {
    const row: AssetTypes = {
      id: ulid(),
      assetClassId: input.assetClassId,
      code: input.code,
      name: input.name,
      manufacturer: input.manufacturer,
      model: input.model,
      attributes: input.attributes,
      validFrom,
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateAssetTypes & { validTo?: string | null },
  ): Promise<AssetTypes | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { AssetTypesStore };
export type { PaginateAssetTypesInput };
