import * as p from "drizzle-orm/pg-core";

/** Every API table lives in the `master_data` Postgres schema, not `public`. */
export const masterData = p.pgSchema("master_data");

export const stamps = () => ({
  createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: p.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
