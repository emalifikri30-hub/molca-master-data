import { and, gt, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { personTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreatePerson, Person, UpdatePerson } from "./people.js";

const KEYS = [
  "id",
  "code",
  "name",
  "username",
  "craft",
  "skills",
  "siteId",
  "shift",
  "hourlyRate",
  "phone",
  "validFrom",
  "validTo",
];

class PeopleStore {
  private repo?: EntityRepository<Person>;
  private items: Person[] = [];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Person>(deps, personTable, KEYS);
  }

  async paginate({ limit, offset, q }: { limit: number; offset: number; q?: string }) {
    if (this.repo) return this.repo.paginate({ limit, offset, q }, ["code", "name", "craft"]);
    const rows = q
      ? this.items.filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
      : this.items;
    return { items: rows.slice(offset, offset + limit), totalElements: rows.length };
  }

  async get(id: string): Promise<Person | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /** Active people with this code (codes are unique per tenant among active rows). */
  async findByCode(code: string, excludeId?: string): Promise<Person | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          sql`lower(btrim(${personTable.code})) = lower(btrim(${code}))`,
          or(isNull(personTable.validTo), gt(personTable.validTo, today)),
          excludeId ? ne(personTable.id, excludeId) : undefined,
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

  async create(input: CreatePerson, validFrom: string): Promise<Person> {
    const row: Person = { id: ulid(), ...input, validFrom, validTo: null };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdatePerson & { validTo?: string | null },
  ): Promise<Person | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return row;
  }
}

export { PeopleStore };
