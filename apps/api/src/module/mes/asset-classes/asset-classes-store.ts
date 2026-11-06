import { eq, gt, isNull, and, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetClassTable } from "../../../shared/database/schema/schema.js";
import { sameCode } from "../../../shared/util/code-match.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { AssetClasses, CreateAssetClasses, UpdateAssetClasses } from "./asset-classes.js";

type PaginateAssetClassesInput = {
  limit: number;
  offset: number;
  q?: string;
};

const KEYS = ["id", "code", "name", "parentClassId", "validFrom", "validTo"];

class AssetClassesStore {
  private repo?: EntityRepository<AssetClasses>;
  private items: AssetClasses[] = [
    {
      id: "class-1",
      code: "PROD-MACHINE",
      name: "Production Machine",
      parentClassId: "",
      validFrom: "2026-01-01",
      validTo: null,
    },
    {
      id: "class-2",
      code: "UTILITY",
      name: "Utility",
      parentClassId: "",
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<AssetClasses>(deps, assetClassTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateAssetClassesInput): Promise<{
    items: AssetClasses[];
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

  async get(id: string): Promise<AssetClasses | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /**
   * Active rows only (PRD-003 AST-001 AC-8, PO 2026-10-21): a deactivated class
   * frees its code. Codes are unique per tenant. docs-molcadx#142: the match
   * ignores case and surrounding spaces; `excludeId` is the row being edited.
   */
  async findByCode(code: string, excludeId?: string): Promise<AssetClasses | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          sql`lower(btrim(${assetClassTable.code})) = lower(btrim(${code}))`,
          or(isNull(assetClassTable.validTo), gt(assetClassTable.validTo, today)),
          excludeId ? ne(assetClassTable.id, excludeId) : undefined,
        ),
      );
      return rows[0];
    }
    return this.items.find(
      (r) =>
        r.id !== excludeId && (r.validTo == null || r.validTo > today) && sameCode(r.code, code),
    );
  }

  /** Active child classes directly under `parentClassId`. */
  async activeChildren(parentClassId: string): Promise<AssetClasses[]> {
    if (this.repo) {
      return this.repo.list(
        and(eq(assetClassTable.parentClassId, parentClassId), isNull(assetClassTable.validTo)),
      );
    }
    return this.items.filter((r) => r.parentClassId === parentClassId && r.validTo === null);
  }

  async create(input: CreateAssetClasses, validFrom: string): Promise<AssetClasses> {
    const row: AssetClasses = {
      id: ulid(),
      code: input.code,
      name: input.name,
      parentClassId: input.parentClassId,
      validFrom,
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateAssetClasses & { validTo?: string | null },
  ): Promise<AssetClasses | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { AssetClassesStore };
export type { PaginateAssetClassesInput };
