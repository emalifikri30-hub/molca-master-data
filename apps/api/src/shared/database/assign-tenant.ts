// Backfill for tenant scoping (F-00 rule 6, E-2). Rows created before tenant
// scoping have a NULL tenant_id, and the app never shows NULL rows. This gives
// them the tenant that owns today's data: the organization of this environment.
// Run once per environment, after the tenant_scoping migration and before the
// app serves that environment. A later migration makes tenant_id NOT NULL, so
// any row still NULL at that point would block it.
//
//   node --import ./src/shared/database/seed-loader.mjs --experimental-strip-types \
//     --env-file=.env src/shared/database/assign-tenant.ts \
//     --tenant-id=<keycloak org id> [--tenant-code=MOLCA] [--tenant-name=Molca]
//
// or the same values as env: TENANT_ID, TENANT_CODE, TENANT_NAME (`pnpm db:assign-tenant`).
//
// One transaction: the TENANT row is inserted if missing (valid_from today), then
// every master_data table that has a tenant_id column is set to TENANT_ID where it
// is NULL. The table list comes from the drizzle schema objects, not a hand list,
// so a new table is covered without editing this file. Rows that already carry a
// tenant are never changed.

import { is, isNull } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { pathToFileURL } from "node:url";

import { createPostgresDb, type PostgresDB } from "./postgres.js";
import { ensureTenant, type SeedTenant } from "./seed-tenant.js";
import * as schema from "./schema/schema.js";
import { tenantTable } from "./schema/schema.js";

/** A schema table with a `tenantId` column (every master_data table except TENANT itself). */
function tenantScopedTables(): PgTable[] {
  const tables: PgTable[] = [];
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, PgTable) && value !== tenantTable && "tenantId" in value) tables.push(value);
  }
  return tables;
}

type AssignCount = { table: string; updated: number };

/**
 * Inserts the tenant if missing and assigns it to every NULL tenant_id row, in one
 * transaction. Returns the per-table counts. Exported so the test can run it on PGlite.
 */
async function assignTenant(db: PostgresDB, tenant: SeedTenant): Promise<AssignCount[]> {
  return db.transaction(async (tx) => {
    await ensureTenant(tx, tenant);
    const counts: AssignCount[] = [];
    for (const table of tenantScopedTables()) {
      // UPDATE <table> SET tenant_id = $1 WHERE tenant_id IS NULL, typed by the table object.
      const scoped = table as PgTable & { tenantId: never };
      const updated = await tx
        .update(scoped as never)
        .set({ tenantId: tenant.tenantId } as never)
        .where(isNull(scoped.tenantId))
        .returning({ tenantId: scoped.tenantId });
      const { name, schema: schemaName } = getTableConfig(table);
      counts.push({ table: schemaName ? `${schemaName}.${name}` : name, updated: updated.length });
    }
    return counts;
  });
}

/** Reads `--name=value` from argv, else the env var, else undefined. */
function option(name: string, envName: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  return (arg ?? process.env[envName])?.trim() || undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const tenantId = option("tenant-id", "TENANT_ID");
  if (!tenantId) {
    throw new Error(
      "TENANT_ID is required: the Keycloak organization id that owns today's data (--tenant-id= or env).",
    );
  }
  const tenant: SeedTenant = {
    tenantId,
    tenantCode: option("tenant-code", "TENANT_CODE") ?? "MOLCA",
    tenantName: option("tenant-name", "TENANT_NAME") ?? "Molca",
  };
  const db = createPostgresDb({ connectionString: url });
  try {
    const counts = await assignTenant(db, tenant);
    for (const { table, updated } of counts) console.log(`${table}: ${updated} row(s) assigned`);
    const total = counts.reduce((sum, c) => sum + c.updated, 0);
    console.log(`Assigned tenant ${tenant.tenantId} (${tenant.tenantCode}) to ${total} row(s).`);
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { assignTenant, tenantScopedTables };
