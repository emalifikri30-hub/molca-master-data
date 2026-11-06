import { and, gt, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { crewTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateCrew, Crew, UpdateCrew } from "./crews.js";

const KEYS = [
  "id",
  "code",
  "name",
  "siteId",
  "shift",
  "leaderId",
  "memberIds",
  "validFrom",
  "validTo",
];

class CrewsStore {
  private repo?: EntityRepository<Crew>;
  private items: Crew[] = [];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Crew>(deps, crewTable, KEYS);
  }

  async paginate({ limit, offset, q }: { limit: number; offset: number; q?: string }) {
    if (this.repo) return this.repo.paginate({ limit, offset, q }, ["code", "name"]);
    const rows = q
      ? this.items.filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
      : this.items;
    return { items: rows.slice(offset, offset + limit), totalElements: rows.length };
  }

  async get(id: string): Promise<Crew | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /** Active people with this code (codes are unique per tenant among active rows). */
  async findByCode(code: string, excludeId?: string): Promise<Crew | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          sql`lower(btrim(${crewTable.code})) = lower(btrim(${code}))`,
          or(isNull(crewTable.validTo), gt(crewTable.validTo, today)),
          excludeId ? ne(crewTable.id, excludeId) : undefined,
        ),
      );
      return rows[0];
    }
    return this.items.find(
      (r) =>
        r.id !== excludeId &&
        r.validTo == null &&
        r.code.toLowerCase() === code.trim().toLowerCase(),
    );
  }

  async create(input: CreateCrew, validFrom: string): Promise<Crew> {
    const row: Crew = { id: ulid(), ...input, validFrom, validTo: null };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateCrew & { validTo?: string | null },
  ): Promise<Crew | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return row;
  }
}

export { CrewsStore };
