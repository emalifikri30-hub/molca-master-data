import * as p from "drizzle-orm/pg-core";

// masterData and stamps sit in pg-schema.ts: tenant.ts needs them, and tenantId()
// below needs tenant.ts, so importing them from here would be a cycle.
import { tenantTable } from "./tenant/tenant.js";

export { masterData, stamps } from "./pg-schema.js";

export const id = () => p.text("id").primaryKey();
/** Deployment column (F-00): where the row is hosted. Not an isolation key, see tenantId. */
export const region = () => p.varchar("region", { length: 16 }).notNull();
/**
 * Tenant (F-00 rule 6, E-2): the Keycloak organization id. Nullable on purpose: rows
 * written before tenant scoping have NULL and stay invisible (every read filters by
 * tenant) until `db:assign-tenant` gives them one. A later migration makes it NOT NULL.
 */
export const tenantId = () => p.text("tenant_id").references(() => tenantTable.tenantId);
/** Effective dates (F-00): business dates, stored as `date`, read as `YYYY-MM-DD`. */
export const dating = () => ({
  validFrom: p.date("valid_from", { mode: "string" }),
  validTo: p.date("valid_to", { mode: "string" }),
});
/** Effective timestamps where a change can fall mid-shift (F-04 ASSET_PRODUCT_CODE, #58 part B). */
export const datingTimes = () => ({
  validFrom: p.timestamp("valid_from", { withTimezone: true, mode: "string" }),
  validTo: p.timestamp("valid_to", { withTimezone: true, mode: "string" }),
});
/**
 * Date-typed validity for the tables whose Keys line has a "No overlap" rule
 * (F-00 keys rule 4, E-1 resolved 2026-10-02): PostgreSQL enforces it with an
 * exclusion constraint on `daterange(valid_from, valid_to, '[)')` (btree_gist,
 * migration `*_no_overlap`), and a range index needs a date column, not text.
 * Read and written as `YYYY-MM-DD` strings, like the text columns.
 */
export const datingDays = () => ({
  validFrom: p.date("valid_from", { mode: "string" }),
  validTo: p.date("valid_to", { mode: "string" }),
});
export const regionIdx = (table: string) => (t: { region: p.PgColumn }) => [
  p.index(`${table}_region_idx`).on(t.region),
];
/** Tenant index (F-00 rule 6), named `<table>_tenant_idx` beside the region one. */
export const tenantIdx = (table: string) => (t: { tenantId: p.PgColumn }) => [
  p.index(`${table}_tenant_idx`).on(t.tenantId),
];
/** The region and tenant indexes every MolcaDx master-data table carries. */
export const scopeIdx = (table: string) => (t: { region: p.PgColumn; tenantId: p.PgColumn }) => [
  ...regionIdx(table)(t),
  ...tenantIdx(table)(t),
];
