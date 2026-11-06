// A real PostgreSQL for tests, in-process (PGlite). Every migration in
// `src/shared/database/migration` runs in order, so the isolation tests check
// the same tables, constraints and views production runs. Test-only: nothing in
// the app imports this file, and it never touches DATABASE_URL.

import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { relations } from "../relations/relations.js";

import type { PostgresDB } from "../postgres.js";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migration", import.meta.url));

/**
 * A fresh, empty database with the full schema applied. The cast to `PostgresDB`
 * is the only one needed: the PGlite driver has the same query builder and the
 * same relations object as the node-postgres driver the app uses in production.
 */
async function createPgliteDb(): Promise<{ db: PostgresDB; client: PGlite }> {
  const client = new PGlite({ extensions: { btree_gist } });
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as PostgresDB, client };
}

export { createPgliteDb, MIGRATIONS_FOLDER };
