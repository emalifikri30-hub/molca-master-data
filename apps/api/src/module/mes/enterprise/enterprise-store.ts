import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { enterpriseTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateEnterprise, Enterprise, UpdateEnterprise } from "./enterprise.js";

const KEYS = ["id", "code", "name", "validFrom", "validTo"];

type PaginateEnterpriseInput = {
  limit: number;
  offset: number;
};

class EnterpriseStore {
  private repo?: EntityRepository<Enterprise>;
  // Example data only — the web app has no Enterprise switcher yet (see
  // site-hierarchy-page.tsx, which always takes the first row), so ent-2 and
  // its sites (site-4/site-5 in sites-store.ts) aren't reachable from the
  // tree yet. Seeded to demonstrate the FK shape now that ENTERPRISE is a
  // real entity (F-01 §9.2), not to imply multi-enterprise UI is built.
  private items: Enterprise[] = [
    {
      id: "ent-1",
      code: "ENT-01",
      name: "Molca Group",
      validFrom: "2024-01-01",
      validTo: null,
    },
    {
      id: "ent-2",
      code: "ENT-02",
      name: "Nusantara Foods Group",
      validFrom: "2024-06-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Enterprise>(deps, enterpriseTable, KEYS);
  }

  async paginate({ limit, offset }: PaginateEnterpriseInput): Promise<{
    items: Enterprise[];
    totalElements: number;
  }> {
    if (this.repo) return this.repo.paginate({ limit, offset }, ["code", "name"]);
    const totalElements = this.items.length;
    const items = this.items.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<Enterprise | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateEnterprise): Promise<Enterprise> {
    const row: Enterprise = { id: ulid(), ...input, validTo: null };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateEnterprise): Promise<Enterprise | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  /** Ends the row: sets valid_to. Master data is never hard-deleted (F-00). */
  async deactivate(id: string, validTo: string): Promise<Enterprise | undefined> {
    return this.update(id, { validTo } as never);
  }
}

export { EnterpriseStore };
export type { PaginateEnterpriseInput };
