import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";
import * as z from "zod";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  binTable,
  failureCodeTable,
  itemCostTable,
  itemTable,
  storeTable,
} from "../../../shared/database/schema/schema.js";
import { CatalogStore, createCatalogHandler, type CatalogSpec, type Row } from "./catalog.js";

import type { AwilixContainer } from "awilix";

// The MRO catalogue Master Data owns for MolcaDx MAM: items (with valuation), stores, bins, failure codes.

const num = z.coerce.number().min(0);
const money = num.nullable().transform((v) => (v == null ? null : String(v)));

const ITEM: CatalogSpec = {
  name: "items",
  table: itemTable,
  keys: [
    "id",
    "code",
    "name",
    "category",
    "uom",
    "critical",
    "rotable",
    "minQty",
    "maxQty",
    "leadTimeDays",
    "unitCost",
    "batchTracked",
    "erpCode",
  ],
  search: ["code", "name", "category"],
  unique: ["code"],
  filters: { category: "category" },
  create: z.object({
    code: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(80).default(""),
    uom: z.string().trim().min(1).max(20).default("pcs"),
    critical: z.boolean().default(false),
    rotable: z.boolean().default(false),
    minQty: num.default(0).transform(String),
    maxQty: money.default(null),
    leadTimeDays: z.coerce.number().int().min(0).nullable().default(null),
    unitCost: money.default(null),
    batchTracked: z.boolean().default(false),
    erpCode: z.string().trim().max(60).default(""),
  }),
};
const STORE: CatalogSpec = {
  name: "stores",
  table: storeTable,
  keys: ["id", "code", "name", "siteId", "workUnitId"],
  search: ["code", "name"],
  unique: ["code"],
  filters: { siteId: "siteId" },
  create: z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    siteId: z.string().default(""),
    workUnitId: z.string().default(""),
  }),
};
const BIN: CatalogSpec = {
  name: "bins",
  table: binTable,
  keys: ["id", "storeId", "code", "tag"],
  search: ["code", "tag"],
  unique: ["storeId", "code"],
  filters: { storeId: "storeId" },
  create: z.object({
    storeId: z.string().min(1),
    code: z.string().trim().min(1).max(40),
    tag: z.string().trim().max(120).default(""),
  }),
};
const FAILURE_CODE: CatalogSpec = {
  name: "failure-codes",
  table: failureCodeTable,
  keys: ["id", "iso14224Class", "kind", "code", "labelId", "labelEn", "custom"],
  search: ["code", "labelId", "labelEn", "iso14224Class"],
  unique: ["iso14224Class", "kind", "code"],
  filters: { iso14224Class: "iso14224Class", kind: "kind" },
  create: z.object({
    iso14224Class: z.string().trim().min(1).max(60),
    kind: z.enum(["mode", "mechanism", "cause"]),
    code: z.string().trim().min(1).max(20),
    labelId: z.string().trim().min(1).max(200),
    labelEn: z.string().trim().min(1).max(200),
    custom: z.boolean().default(false),
  }),
};

const COST_KEYS = [
  "id",
  "itemId",
  "source",
  "oldCost",
  "newCost",
  "price",
  "quantity",
  "onHand",
  "reference",
  "reason",
  "byName",
  "at",
];
const costSchema = z.object({
  source: z.enum(["receipt", "manual"]),
  newCost: z.coerce.number().min(0),
  price: z.coerce.number().min(0).nullable().default(null),
  quantity: z.coerce.number().nullable().default(null),
  onHand: z.coerce.number().nullable().default(null),
  reference: z.string().max(200).default(""),
  reason: z.string().max(500).default(""),
  byName: z.string().max(160).default(""),
  at: z.string().optional(),
});

/** Item valuation: the cost history, and a new cost (a receipt from Maintenance, or a revaluation here). */
function createItemCostHandler(items: CatalogStore, deps: DbDeps) {
  const costs = openRepo<Row>(deps, itemCostTable, COST_KEYS);
  const app = new Hono();
  app.get("/:id/costs", async (c) => {
    const id = c.req.param("id");
    await items.get(id);
    const rows = (await costs!.list(eq(itemCostTable.itemId, id))).sort((a, b) =>
      String(b.at).localeCompare(String(a.at)),
    );
    return c.json(WebResponse.builder<Row[]>().data(rows).build(), 200);
  });
  app.post("/:id/costs", jsonValidator(costSchema), async (c) => {
    const id = c.req.param("id");
    const item = await items.get(id);
    const input = c.req.valid("json");
    if (input.source === "manual" && !input.reason.trim())
      throw new HTTPException(422, { message: "a revaluation needs a reason" });
    // the item first: a refused change (no reason) then leaves no history row behind
    await items.update(id, { unitCost: String(input.newCost) });
    const row = await costs!.insert({
      id: ulid(),
      itemId: id,
      source: input.source,
      oldCost: item.unitCost ?? null,
      newCost: String(input.newCost),
      price: input.price == null ? null : String(input.price),
      quantity: input.quantity == null ? null : String(input.quantity),
      onHand: input.onHand == null ? null : String(input.onHand),
      reference: input.reference,
      reason: input.reason,
      byName: input.byName,
      at: input.at ? new Date(input.at) : new Date(),
      validFrom: null,
      validTo: null,
    } as unknown as Row);
    return c.json(WebResponse.builder<Row>().data(row).build(), 201);
  });
  return app;
}

/** Mounts /items, /stores, /bins and /failure-codes on the API. */
function mountMroCatalog(api: Hono, container: AwilixContainer) {
  const deps: DbDeps = { db: container.resolve("db"), region: container.resolve("region") };
  const items = new CatalogStore(ITEM, deps);
  const item = createCatalogHandler(() => items);
  item.route("/", createItemCostHandler(items, deps));
  api.route("/items", item);
  for (const spec of [STORE, BIN, FAILURE_CODE]) {
    const store = new CatalogStore(spec, deps);
    api.route(
      `/${spec.name}`,
      createCatalogHandler(() => store),
    );
  }
}

export { mountMroCatalog };
