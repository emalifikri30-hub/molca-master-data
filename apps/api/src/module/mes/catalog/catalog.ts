import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, gt, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulidx";
import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";
import { buildPageMeta, WebResponse } from "@molca/network";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";

import type { PgTable } from "drizzle-orm/pg-core";
import type { EntityRepository } from "../../../shared/database/entity-repository.js";

// One shape for the MRO catalogue records Master Data owns (items, stores, bins, failure codes): list with search
// and filters, get, create (an import may keep its id, so records moved from Maintenance keep theirs), update, and
// deactivate — never delete, so transactions that point at a record keep it. Uniqueness is checked on active rows.

type Row = Record<string, unknown> & {
  id: string;
  validFrom: string | null;
  validTo: string | null;
};

type CatalogSpec = {
  /** route segment and error noun, e.g. "items" */
  name: string;
  table: PgTable;
  /** domain keys (camelCase) the repository maps */
  keys: string[];
  search: string[];
  /** fields that together are unique among active rows, e.g. ["code"] or ["storeId", "code"] */
  unique: string[];
  create: z.ZodObject<z.ZodRawShape>;
  /** query parameters that filter the list by an equal column, e.g. { storeId: "storeId" } */
  filters?: Record<string, string>;
};

const today = () => new Date().toISOString().slice(0, 10);

class CatalogStore {
  readonly repo?: EntityRepository<Row>;
  constructor(
    readonly spec: CatalogSpec,
    deps?: DbDeps,
  ) {
    this.repo = openRepo<Row>(deps, spec.table, [...spec.keys, "validFrom", "validTo"]);
  }
  private get t() {
    return this.spec.table as unknown as Record<string, never>;
  }
  private need() {
    if (!this.repo) throw new HTTPException(503, { message: "database unavailable" });
    return this.repo;
  }

  async page(
    page: number,
    size: number,
    q: string | undefined,
    filter: Record<string, string>,
    active: boolean,
  ) {
    const conds: SQL[] = Object.entries(filter).map(([k, v]) => eq(this.t[k], v));
    if (active) conds.push(or(isNull(this.t.validTo), gt(this.t.validTo, today()))!);
    const { items, totalElements } = await this.need().paginate(
      { limit: size, offset: (page - 1) * size, q },
      this.spec.search,
      conds.length ? and(...conds) : undefined,
    );
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string) {
    const row = await this.need().get(id);
    if (!row) throw new HTTPException(404, { message: `${this.spec.name} not found` });
    return row;
  }

  private async clash(row: Record<string, unknown>, excludeId?: string) {
    const conds: SQL[] = this.spec.unique.map((k) =>
      k === "code"
        ? sql`lower(btrim(${this.t[k]})) = lower(btrim(${String(row[k] ?? "")}))`
        : eq(this.t[k], row[k] as never),
    );
    conds.push(or(isNull(this.t.validTo), gt(this.t.validTo, today()))!);
    if (excludeId) conds.push(ne(this.t.id, excludeId));
    const found = await this.need().list(and(...conds));
    if (found.length)
      throw new HTTPException(409, {
        message: `${this.spec.unique.map((k) => row[k]).join(" · ")} is already used.`,
      });
  }

  async create(input: Record<string, unknown>) {
    await this.clash(input);
    const id = typeof input.id === "string" && input.id ? input.id : ulid();
    return this.need().insert({ ...input, id, validFrom: today(), validTo: null } as Row);
  }

  async update(id: string, patch: Record<string, unknown>) {
    const row = await this.get(id);
    await this.clash({ ...row, ...patch }, id);
    return (await this.need().update(id, patch as Partial<Row>))!;
  }

  async deactivate(id: string) {
    const row = await this.get(id);
    if (row.validTo)
      throw new HTTPException(422, { message: `${this.spec.name} is already inactive.` });
    return (await this.need().update(id, { validTo: today() } as Partial<Row>))!;
  }
}

function createCatalogHandler(store: () => CatalogStore) {
  const app = new Hono();
  const spec = () => store().spec;
  app.get(
    "/",
    queryValidator(
      paginationSchema
        .extend({ q: z.string().optional(), all: z.enum(["1"]).optional() })
        .passthrough(),
    ),
    async (c) => {
      const q = c.req.valid("query") as Record<string, string> & { page: number; size: number };
      const filter = Object.fromEntries(
        Object.entries(spec().filters ?? {})
          .filter(([param]) => q[param])
          .map(([param, key]) => [key, q[param]!]),
      );
      const { items, meta } = await store().page(q.page, q.size, q.q, filter, q.all !== "1");
      return c.json(WebResponse.builder<Row[]>().data(items).meta(meta).build(), 200);
    },
  );
  app.post("/", async (c) => {
    const parsed = spec()
      .create.extend({ id: z.string().min(1).max(40).optional() })
      .safeParse(await c.req.json());
    if (!parsed.success)
      throw new HTTPException(400, {
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    return c.json(
      WebResponse.builder<Row>()
        .data(await store().create(parsed.data))
        .build(),
      201,
    );
  });
  app.get("/:id", async (c) =>
    c.json(
      WebResponse.builder<Row>()
        .data(await store().get(c.req.param("id")))
        .build(),
      200,
    ),
  );
  app.put("/:id", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const parsed = spec().create.partial().safeParse(body);
    if (!parsed.success)
      throw new HTTPException(400, {
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    // only what was sent changes: the create schema's defaults must not reset the other fields
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in body));
    return c.json(
      WebResponse.builder<Row>()
        .data(await store().update(c.req.param("id"), patch))
        .build(),
      200,
    );
  });
  app.post("/:id/deactivate", jsonValidator(z.object({}).passthrough()), async (c) =>
    c.json(
      WebResponse.builder<Row>()
        .data(await store().deactivate(c.req.param("id")))
        .build(),
      200,
    ),
  );
  return app;
}

export { CatalogStore, createCatalogHandler };
export type { CatalogSpec, Row };
