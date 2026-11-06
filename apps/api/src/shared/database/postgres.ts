import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./relations/relations.js";

type PostgresDBDeps = {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  logger?: boolean;
};

// type PostgresDB = NodePgDatabase<typeof relations>;

function createPool(
  connectionString: string,
  max?: number,
  idleTimeoutMillis?: number,
  connectionTimeoutMillis?: number,
) {
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });
}

function createPostgresDb({
  connectionString,
  max,
  idleTimeoutMillis,
  connectionTimeoutMillis,
  logger,
}: PostgresDBDeps) {
  const pool = createPool(connectionString, max, idleTimeoutMillis, connectionTimeoutMillis);

  return drizzle({ client: pool, relations, logger });
}

type PostgresDB = ReturnType<typeof createPostgresDb>;

export { createPostgresDb };
export type { PostgresDB };
