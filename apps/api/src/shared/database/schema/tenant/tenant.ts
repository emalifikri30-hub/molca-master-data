import { sql } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

import { masterData, stamps } from "../pg-schema.js";

/**
 * TENANT (F-01 §9.1). One Keycloak Organization is one tenant (F-00 rule 6, E-2).
 * tenant_id is the Keycloak organization id (PO 2026-10-12), a string taken from the
 * login token, never typed by a user. Deactivated by setting valid_to, never deleted:
 * active on a day when valid_from <= day and (valid_to is null or valid_to > day),
 * the same exclusive end as the other effective-dated tables.
 *
 * TNT-G15: tenant_code is stored upper-case (so its unique index is case-insensitive)
 * and tenant_name is unique ignoring case and surrounding spaces.
 */
export const tenantTable = masterData.table(
  "tenant",
  {
    tenantId: p.text("tenant_id").primaryKey(),
    tenantCode: p.text("tenant_code").notNull(),
    tenantName: p.text("tenant_name").notNull(),
    validFrom: p.date("valid_from", { mode: "string" }).notNull(),
    validTo: p.date("valid_to", { mode: "string" }),
    ...stamps(),
  },
  (t) => [
    p.uniqueIndex("tenant_code_key").on(t.tenantCode),
    p.uniqueIndex("tenant_name_key").using("btree", sql`lower(btrim(${t.tenantName}))`),
    p.check("tenant_code_upper", sql`${t.tenantCode} = upper(${t.tenantCode})`),
  ],
);
