import { and, asc, count, eq, getTableName, ilike, or, type SQL } from "drizzle-orm";

import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { captureWrite, currentAudit } from "../audit/audit-context.js";
import { auditedTable } from "../audit/audit-entities.js";
import { nullableLinks } from "./nullable-links.js";
import { assertLinksInTenant } from "./tenant-links.js";
import { currentTenantId } from "../tenant/tenant-context.js";
import { connection } from "./transaction.js";

import type { PostgresDB } from "./postgres.js";

type RegionTable = PgTable & Record<string, PgColumn>;

type EntityRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

/**
 * Tenant-scoped reader/writer for one table (F-00 rule 6, E-2): every read, update and
 * delete filters by the current tenant, every insert stamps it. Region stays the
 * deployment column and is not an isolation key. Each call is its own query,
 * inside the caller's transaction when one is open (`transact`).
 * Rows are never loaded into a process-wide snapshot and never rewritten in bulk.
 */
class EntityRepository<T extends Record<string, unknown>> {
  protected db: PostgresDB;
  protected region: string;
  private table: RegionTable;
  private keys: string[];
  private idKey: string;
  /** Optional links stored as NULL; the domain sees "" (nullable-links.ts). */
  private links: ReadonlySet<string>;

  constructor(deps: EntityRepositoryDeps, table: RegionTable, keys: string[], idKey = "id") {
    this.db = deps.db;
    this.region = deps.region;
    this.table = table;
    this.keys = keys;
    this.idKey = idKey;
    this.links = nullableLinks(getTableName(table));
  }

  /** The open transaction when the caller runs inside `transact`, else the pool. */
  protected get conn(): PostgresDB {
    return connection(this.db);
  }

  /** Table name when this write must be audited now (inside a request, audited table). */
  private auditing(): string | null {
    if (!currentAudit()) return null;
    const name = getTableName(this.table);
    return auditedTable(name) ? name : null;
  }

  protected toDomain(row: Record<string, unknown>): T {
    const out: Record<string, unknown> = {};
    for (const key of this.keys) {
      out[key] = this.links.has(key) ? (row[key] ?? "") : (row[key] ?? null);
    }
    return out as T;
  }

  private values(row: Partial<T>, withRegion: boolean): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    if (withRegion) {
      values.region = this.region;
      values.tenantId = currentTenantId();
    }
    for (const key of this.keys) {
      if (!(key in row) || row[key as keyof T] === undefined) continue;
      const value = row[key as keyof T];
      values[key] = this.links.has(key) && value === "" ? null : value;
    }
    return values;
  }

  /** Every condition is tenant-scoped (F-00 rule 6); throws outside a tenant (fail closed). */
  private scoped(extra?: SQL): SQL | undefined {
    const conds: SQL[] = [eq(this.table.tenantId, currentTenantId())];
    if (extra) conds.push(extra);
    return and(...conds);
  }

  async list(extra?: SQL): Promise<T[]> {
    const rows = await this.conn
      .select()
      .from(this.table)
      .where(this.scoped(extra))
      .orderBy(asc(this.table[this.idKey]));
    return rows.map((row) => this.toDomain(row as Record<string, unknown>));
  }

  async get(id: string): Promise<T | undefined> {
    const rows = await this.conn
      .select()
      .from(this.table)
      .where(this.scoped(eq(this.table[this.idKey], id)))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row as Record<string, unknown>) : undefined;
  }

  async paginate(
    input: { limit: number; offset: number; q?: string },
    searchKeys: string[],
    extra?: SQL,
  ): Promise<{ items: T[]; totalElements: number }> {
    const conds: SQL[] = [eq(this.table.tenantId, currentTenantId())];
    if (extra) conds.push(extra);
    if (input.q !== undefined && input.q !== "") {
      const pattern = `%${input.q}%`;
      const match = or(...searchKeys.map((key) => ilike(this.table[key], pattern)));
      if (match) conds.push(match);
    }
    const where = and(...conds);
    const [rows, totals] = await Promise.all([
      this.conn
        .select()
        .from(this.table)
        .where(where)
        .orderBy(asc(this.table[this.idKey]))
        .limit(input.limit)
        .offset(input.offset),
      this.conn.select({ value: count() }).from(this.table).where(where),
    ]);
    return {
      items: rows.map((row) => this.toDomain(row as Record<string, unknown>)),
      totalElements: Number(totals[0]?.value ?? 0),
    };
  }

  async insert(row: T): Promise<T> {
    const values = this.values(row, true);
    await assertLinksInTenant(this.conn, this.table, values);
    await this.conn.insert(this.table).values(values as never);
    const table = this.auditing();
    if (table) captureWrite({ table, kind: "insert", before: null, after: { ...row } });
    return row;
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const table = this.auditing();
    const before = table ? await this.get(id) : undefined;
    const { [this.idKey]: _id, ...fields } = patch;
    const values = this.values(fields as Partial<T>, false);
    await assertLinksInTenant(this.conn, this.table, values);
    const rows = await this.conn
      .update(this.table)
      .set({ ...values, updatedAt: new Date() } as never)
      .where(this.scoped(eq(this.table[this.idKey], id)))
      .returning();
    const row = (rows as Record<string, unknown>[])[0];
    const after = row ? this.toDomain(row) : undefined;
    if (table && before && after) captureWrite({ table, kind: "update", before, after });
    return after;
  }

  /** Close the row. Master data is not hard-deleted. */
  async deactivate(id: string, column: string, value: string): Promise<T | undefined> {
    return this.update(id, { [column]: value } as Partial<T>);
  }

  /** Removes one row. Only for endpoints that already hard-delete. */
  async delete(id: string): Promise<boolean> {
    const current = await this.get(id);
    if (!current) return false;
    await this.conn.delete(this.table).where(this.scoped(eq(this.table[this.idKey], id)));
    const table = this.auditing();
    if (table) captureWrite({ table, kind: "delete", before: current, after: null });
    return true;
  }
}

export { EntityRepository };
export type { EntityRepositoryDeps };
