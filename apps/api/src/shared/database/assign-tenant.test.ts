import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createPgliteDb } from "./testing/pglite-db.js";
import { assignTenant, tenantScopedTables } from "./assign-tenant.js";
import { enterpriseTable, tenantTable } from "./schema/schema.js";

import type { PGlite } from "@electric-sql/pglite";
import type { PostgresDB } from "./postgres.js";

let db: PostgresDB;
let client: PGlite;

beforeAll(async () => {
  ({ db, client } = await createPgliteDb());
  await db.insert(tenantTable).values({
    tenantId: "org-keep",
    tenantCode: "KEEP",
    tenantName: "Keep",
    validFrom: "2026-01-01",
  });
  await db.insert(enterpriseTable).values([
    { id: "ent-old", region: "ap3", code: "OLD", name: "Old", validFrom: "2026-01-01" },
    {
      id: "ent-kept",
      region: "ap3",
      tenantId: "org-keep",
      code: "KEPT",
      name: "Kept",
      validFrom: "2026-01-01",
    },
  ]);
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe("assign-tenant backfill (F-00 rule 6)", () => {
  it("takes every master_data table with a tenant_id column from the schema, not the TENANT table itself", () => {
    const names = tenantScopedTables().map((t) => getTableConfig(t).name);
    expect(names).toContain("enterprise");
    expect(names).toContain("site");
    expect(names).not.toContain("tenant");
  });

  it("gives the NULL rows the tenant, keeps rows that already have one, and inserts the TENANT row", async () => {
    const counts = await assignTenant(db, {
      tenantId: "org-new",
      tenantCode: "NEW",
      tenantName: "New",
    });

    const enterprise = counts.find((c) => c.table === "master_data.enterprise");
    expect(enterprise).toEqual({ table: "master_data.enterprise", updated: 1 });
    const rows = await db.select().from(enterpriseTable).orderBy(enterpriseTable.id);
    expect(rows.find((r) => r.id === "ent-old")?.tenantId).toBe("org-new");
    expect(rows.find((r) => r.id === "ent-kept")?.tenantId).toBe("org-keep");

    const [registered] = await db
      .select()
      .from(tenantTable)
      .where(eq(tenantTable.tenantId, "org-new"));
    expect(registered).toMatchObject({ tenantCode: "NEW", tenantName: "New", validTo: null });
  });

  it("a second run changes nothing", async () => {
    const counts = await assignTenant(db, {
      tenantId: "org-new",
      tenantCode: "NEW",
      tenantName: "New",
    });
    expect(counts.every((c) => c.updated === 0)).toBe(true);
  });
});
