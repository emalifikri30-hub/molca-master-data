// Guard for the explicit link registry (F-00 rule 6): the schema declares no foreign keys,
// so a new `*_id` column must be classified here, or the cross-tenant check silently misses it.

import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import * as schema from "./schema/schema.js";
import { NOT_LINKS, TENANT_LINKS } from "./tenant-links.js";

/** Every table exported from schema.ts that carries a tenant_id column, by table name. */
const tenantTables = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (!is(value, PgTable)) continue;
  const { name, columns } = getTableConfig(value);
  if (columns.some((c) => c.name === "tenant_id")) tenantTables.set(name, value);
}

/** JS property name for each DB column name of a table (matched by column object identity). */
function jsKeyByColumn(table: PgTable): Map<string, string> {
  const entries = Object.entries(table);
  const keys = new Map<string, string>();
  for (const column of getTableConfig(table).columns) {
    const found = entries.find(([, value]) => value === column);
    if (found) keys.set(column.name, found[0]);
  }
  return keys;
}

describe("tenant link registry (F-00 rule 6)", () => {
  it("every *_id column is either a tenant link or documented as not one (F-00 rule 6)", () => {
    const problems: string[] = [];
    for (const [name, table] of tenantTables) {
      if (!(name in NOT_LINKS)) problems.push(`${name}: no NOT_LINKS entry`);
      const links = TENANT_LINKS[name] ?? {};
      const notLinks = NOT_LINKS[name] ?? {};
      const keys = jsKeyByColumn(table);
      for (const column of getTableConfig(table).columns) {
        if (!column.name.endsWith("_id") || column.name === "id") continue;
        const key = keys.get(column.name);
        const homes = [key !== undefined && key in links, key !== undefined && key in notLinks];
        const count = homes.filter(Boolean).length;
        if (count !== 1) problems.push(`${name}.${key ?? column.name}: listed ${count} times`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every registry entry names a tenant table, a real column and a parent with a tenant_id", () => {
    const problems: string[] = [];
    for (const [name, links] of Object.entries(TENANT_LINKS)) {
      const table = tenantTables.get(name);
      if (!table) {
        problems.push(`${name}: not a tenant table`);
        continue;
      }
      const keys = jsKeyByColumn(table);
      for (const [key, target] of Object.entries(links)) {
        if (![...keys.values()].includes(key)) problems.push(`${name}.${key}: no such column`);
        const parent = is(target, PgTable) ? target : target.table;
        const parentName = getTableConfig(parent).name;
        if (!getTableConfig(parent).columns.some((c) => c.name === "tenant_id")) {
          problems.push(`${name}.${key}: parent ${parentName} has no tenant_id`);
        }
        if (!is(target, PgTable) && !Object.keys(parent).includes(target.column)) {
          problems.push(`${name}.${key}: parent ${parentName} has no ${target.column}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
