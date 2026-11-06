import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { siteTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateSites, Sites, UpdateSites } from "./sites.js";

const KEYS = ["id", "classId", "enterpriseId", "code", "name", "timezone", "validFrom", "validTo"];

type PaginateSitesInput = {
  limit: number;
  offset: number;
  q?: string;
};

class SitesStore {
  private repo?: EntityRepository<Sites>;
  private items: Sites[] = [
    {
      id: "site-1",
      enterpriseId: "ent-1",
      code: "SITE_01",
      name: "Bekasi Plant",
      timezone: "Asia/Jakarta",
    },
    {
      id: "site-2",
      enterpriseId: "ent-1",
      code: "SITE_02",
      name: "Karawang Plant",
      timezone: "Asia/Jakarta",
    },
    {
      id: "site-3",
      enterpriseId: "ent-1",
      code: "SITE_03",
      name: "Surabaya Plant",
      timezone: "Asia/Jakarta",
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Sites>(deps, siteTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateSitesInput): Promise<{
    items: Sites[];
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

  /** Every row — for scope checks such as code uniqueness. */
  async all(): Promise<ReadonlyArray<Sites>> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<Sites | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateSites): Promise<Sites> {
    const row: Sites = {
      id: ulid(),
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: null,
      enterpriseId: input.enterpriseId,
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      timezone: input.timezone,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateSites): Promise<Sites | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { SitesStore };
export type { PaginateSitesInput };
