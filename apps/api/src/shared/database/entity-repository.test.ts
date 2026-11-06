import { describe, it, expect } from "vite-plus/test";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";

import { runInTenant } from "../tenant/tenant-context.js";
import { areaTable } from "./schema/schema.js";
import { EntityRepository } from "./entity-repository.js";

import type { SQL } from "drizzle-orm";
import type { PostgresDB } from "./postgres.js";

type Rec = Record<string, unknown>;
type Row = { id: string; label: string; validTo: string | null };

const table = pgTable("entity_repository_test", {
  id: text("id").primaryKey(),
  region: text("region").notNull(),
  tenantId: text("tenant_id"),
  label: text("label").notNull(),
  validTo: text("valid_to"),
});

// Chainable stand-in for drizzle's awaitable query builder (as in post-repository.test.ts).
function thenableNode(result: unknown, rec: Rec, methods: string[]) {
  const node: Record<string, unknown> = {
    // eslint-disable-next-line unicorn/no-thenable
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const m of methods) {
    node[m] = (arg: unknown) => {
      if (arg !== undefined) rec[m] = arg;
      return node;
    };
  }
  return node;
}

/** Runs `work` as the signed-in tenant `org-a` (F-00 rule 6). */
const inTenant = <T>(work: () => Promise<T>) => runInTenant({ tenantId: "org-a" }, work);

/** The bound parameters of a where/values fragment, as Postgres would receive them. */
const paramsOf = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL).params;

/** `stored` is what the table holds; `afterUpdate` is what Postgres hands back from UPDATE … RETURNING. */
function makeRepo(stored: Rec[], afterUpdate: Rec[]) {
  const rec: Rec = {};
  const reads: Rec = {};
  const db = {
    select: () => thenableNode(stored, reads, ["from", "where", "orderBy", "limit", "offset"]),
    update: () => thenableNode(afterUpdate, rec, ["set", "where", "returning"]),
    insert: () => thenableNode([], rec, ["values"]),
  };
  const repo = new EntityRepository<Row>(
    { db: db as unknown as PostgresDB, region: "local" },
    table as never,
    ["id", "label", "validTo"],
  );
  return { repo, rec, reads };
}

describe("EntityRepository.update", () => {
  const before = {
    id: "row-1",
    region: "local",
    tenantId: "org-a",
    label: "Morning",
    validTo: null,
  };
  const after = { ...before, validTo: "2026-10-01" };

  it("never writes the id, even when the patch carries one", async () => {
    const { repo, rec } = makeRepo([before], [after]);
    await inTenant(() => repo.update("row-1", { id: "row-2", validTo: "2026-10-01" }));
    expect(Object.keys(rec.set as Rec).sort()).toEqual(["updatedAt", "validTo"]);
  });

  it("returns the row as stored, not the patch merged in memory", async () => {
    const { repo } = makeRepo([before], [after]);
    const out = await inTenant(() =>
      repo.update("row-1", { label: undefined, validTo: "2026-10-01" }),
    );
    expect(out).toEqual({ id: "row-1", label: "Morning", validTo: "2026-10-01" });
  });

  it("returns undefined when no row in the tenant has that id", async () => {
    const { repo } = makeRepo([], []);
    expect(await inTenant(() => repo.update("missing", { label: "x" }))).toBeUndefined();
  });

  it("filters the write by the current tenant (F-00 rule 6)", async () => {
    const { repo, rec } = makeRepo([before], [after]);
    await inTenant(() => repo.update("row-1", { validTo: "2026-10-01" }));
    expect(paramsOf(rec.where)).toContain("org-a");
  });

  it("refuses to run outside a tenant (F-00 rule 6, fail closed)", async () => {
    const { repo } = makeRepo([before], [after]);
    await expect(repo.update("row-1", { validTo: "2026-10-01" })).rejects.toThrow(
      "no tenant in context",
    );
  });
});

describe("EntityRepository — tenant scope (F-00 rule 6)", () => {
  const row = { id: "row-1", region: "local", tenantId: "org-a", label: "Morning", validTo: null };

  it("filters reads by the current tenant", async () => {
    const { repo, reads } = makeRepo([row], []);
    await inTenant(() => repo.get("row-1"));
    expect(paramsOf(reads.where)).toEqual(expect.arrayContaining(["org-a", "row-1"]));
  });

  it("stamps the current tenant on insert, next to the region", async () => {
    const { repo, rec } = makeRepo([], []);
    await inTenant(() => repo.insert({ id: "row-2", label: "Night" } as Row));
    expect(rec.values).toMatchObject({ region: "local", tenantId: "org-a", label: "Night" });
  });
});

describe("EntityRepository — optional links (nullable-links.ts)", () => {
  // A table named like one with links: `site.classId` is stored NULL for "none".
  const site = pgTable("site", {
    id: text("id").primaryKey(),
    region: text("region").notNull(),
    tenantId: text("tenant_id"),
    classId: text("site_class_id"),
  });

  function siteRepo(stored: Rec[], afterUpdate: Rec[]) {
    const rec: Rec = {};
    const db = {
      select: () => thenableNode(stored, {}, ["from", "where", "orderBy", "limit", "offset"]),
      update: () => thenableNode(afterUpdate, rec, ["set", "where", "returning"]),
    };
    const repo = new EntityRepository<{ id: string; classId: string }>(
      { db: db as unknown as PostgresDB, region: "local" },
      site as never,
      ["id", "classId"],
    );
    return { repo, rec };
  }

  it('writes "" as NULL and reads NULL back as ""', async () => {
    const stored = { id: "s1", region: "local", tenantId: "org-a", classId: null };
    const { repo, rec } = siteRepo([stored], [stored]);
    const row = await inTenant(() => repo.update("s1", { classId: "" }));
    expect((rec.set as Rec).classId).toBeNull();
    expect(row).toEqual({ id: "s1", classId: "" });
  });
});

describe("EntityRepository — links must stay in the tenant (F-00 rule 6)", () => {
  // The link check reads the registry (tenant-links.ts): area.siteId points at site.

  /** `parentRows` is what the link lookup finds: [] = no such parent in this tenant. */
  function childRepo(parentRows: Rec[]) {
    const rec: Rec = {};
    const selects: unknown[] = [];
    const db = {
      select: () => {
        const node = thenableNode(parentRows, {}, ["from", "where", "limit"]);
        selects.push(node);
        return node;
      },
      insert: () => thenableNode([], rec, ["values"]),
    };
    const repo = new EntityRepository<{ id: string; siteId: string; classId?: string }>(
      { db: db as unknown as PostgresDB, region: "local" },
      areaTable as never,
      ["id", "siteId"],
    );
    return { repo, rec, selects };
  }

  it("refuses an insert whose link is not a row of the same tenant", async () => {
    const { repo, rec } = childRepo([]);
    const error = await inTenant(() => repo.insert({ id: "c1", siteId: "s-other" })).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ status: 404, message: "siteId not found" });
    expect(rec.values).toBeUndefined();
  });

  it("accepts an insert whose link is a row of the same tenant", async () => {
    const { repo, rec } = childRepo([{ one: 1 }]);
    await inTenant(() => repo.insert({ id: "c1", siteId: "s-own" }));
    expect(rec.values).toMatchObject({ siteId: "s-own", tenantId: "org-a" });
  });

  it("does not look up an empty optional link", async () => {
    const { repo, selects } = childRepo([]);
    await inTenant(() => repo.insert({ id: "c1", siteId: "", classId: "" }));
    expect(selects).toHaveLength(0);
  });
});
