import { EntityRepository } from "./entity-repository.js";

import type { PgTable } from "drizzle-orm/pg-core";
import type { PostgresDB } from "./postgres.js";

type DbDeps = {
  db?: PostgresDB;
  region?: string;
};

/** Opens a tenant-scoped repository when the container injects `db`. Unit tests construct the store with no arguments and keep the in-memory rows. */
function openRepo<T extends Record<string, unknown>>(
  deps: DbDeps | undefined,
  table: PgTable,
  keys: string[],
  idKey = "id",
): EntityRepository<T> | undefined {
  if (!deps?.db || !deps.region) return undefined;
  return new EntityRepository<T>({ db: deps.db, region: deps.region }, table as never, keys, idKey);
}

export { openRepo };
export type { DbDeps };
