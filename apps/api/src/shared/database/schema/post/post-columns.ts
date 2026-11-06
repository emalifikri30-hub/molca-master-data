import * as p from "drizzle-orm/pg-core";
import { ulid } from "ulidx";

export const defaultColumns = () => ({
  id: p
    .varchar({ length: 26 })
    .primaryKey()
    .$defaultFn(() => ulid()),
  region: p.varchar({ length: 10 }).notNull(),
  createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: p.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const defaultIndexes = (
  t: {
    region: p.PgColumn;
    updatedAt: p.PgColumn;
  },
  tableName: string,
) => [p.index(`${tableName}_region_org_updated_idx`).on(t.region, t.updatedAt)];
