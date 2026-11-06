import { describe, it, expect } from "vite-plus/test";
import { PgDialect } from "drizzle-orm/pg-core";

import { runInTenant } from "../../../shared/tenant/tenant-context.js";
import { ProductsReaderRepository, ProductsWriterRepository } from "./products-repository.js";

import type { SQL } from "drizzle-orm";
import type { PostgresDB } from "../../../shared/database/postgres.js";

type Rec = Record<string, unknown>;

// Chainable stand-in for drizzle's awaitable query builder (as in entity-repository.test.ts).
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

function fakeDb(rows: Rec[] = []) {
  const rec: Rec = {};
  const db = {
    select: () => thenableNode(rows, rec, ["from", "where", "orderBy", "limit"]),
    update: () => thenableNode([], rec, ["set", "where", "returning"]),
    insert: () => thenableNode([], rec, ["values"]),
  };
  return { db: db as unknown as PostgresDB, rec };
}

describe("ProductsReaderRepository tenant scope", () => {
  it("fails closed outside a tenant", async () => {
    const { db } = fakeDb();
    const repo = new ProductsReaderRepository({ db, region: "local" });
    await expect(repo.listProducts()).rejects.toThrow("no tenant in context");
  });

  it("filters product reads by the current tenant next to region", async () => {
    const { db, rec } = fakeDb();
    const repo = new ProductsReaderRepository({ db, region: "local" });
    await inTenant(() => repo.listProducts());
    expect(paramsOf(rec.where)).toEqual(expect.arrayContaining(["local", "org-a"]));
  });

  it("filters conversion lookups by the current tenant", async () => {
    const { db, rec } = fakeDb();
    const repo = new ProductsReaderRepository({ db, region: "local" });
    await inTenant(() => repo.findActiveConversion("prod-1", "uom-1", "uom-2"));
    expect(paramsOf(rec.where)).toContain("org-a");
  });
});

describe("ProductsWriterRepository tenant scope", () => {
  it("stamps the tenant on inserted product rows", async () => {
    // The base unit link is looked up first; a row back means the unit is in this tenant.
    const { db, rec } = fakeDb([{ one: 1 }]);
    const repo = new ProductsWriterRepository({ db, region: "local" });
    await inTenant(() =>
      repo.insertProduct({
        id: "prod-1",
        code: "FG-1",
        name: "Bread",
        productType: "finished",
        packagingLevel: null,
        baseUomId: "uom-5",
        validFrom: null,
        validTo: null,
      } as never),
    );
    expect(rec.values).toMatchObject({ region: "local", tenantId: "org-a" });
  });
});
