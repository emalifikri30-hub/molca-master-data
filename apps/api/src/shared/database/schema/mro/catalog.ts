import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

// MRO catalogue owned by Master Data (MolcaDx MAM, 6 Nov 2026): spare-part items with their valuation (unit cost =
// moving average) and its history, stores and bins, and the ISO 14224 failure-code catalogue. Maintenance keeps the
// transactions (stock, receipts, issues, counts) against these ids and writes each new cost back here.

export const itemTable = masterData.table(
  "item",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    category: p.text("category").notNull().default(""),
    uom: p.text("uom").notNull().default("pcs"),
    critical: p.boolean("critical").notNull().default(false),
    rotable: p.boolean("rotable").notNull().default(false),
    minQty: p.numeric("min_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    maxQty: p.numeric("max_qty", { precision: 14, scale: 3 }),
    leadTimeDays: p.integer("lead_time_days"),
    unitCost: p.numeric("unit_cost", { precision: 18, scale: 2 }),
    batchTracked: p.boolean("batch_tracked").notNull().default(false),
    erpCode: p.text("erp_code").notNull().default(""),
    ...dating(),
  },
  scopeIdx("item"),
);

/** Every change of an item's unit cost: a receipt at a price (moving average, from Maintenance) or a revaluation. */
export const itemCostTable = masterData.table(
  "item_cost",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    itemId: p.text("item_id").notNull(),
    source: p.text("source").notNull(),
    oldCost: p.numeric("old_cost", { precision: 18, scale: 2 }),
    newCost: p.numeric("new_cost", { precision: 18, scale: 2 }).notNull(),
    price: p.numeric("price", { precision: 18, scale: 2 }),
    quantity: p.numeric("quantity", { precision: 14, scale: 3 }),
    onHand: p.numeric("on_hand", { precision: 14, scale: 3 }),
    reference: p.text("reference").notNull().default(""),
    reason: p.text("reason").notNull().default(""),
    byName: p.text("by_name").notNull().default(""),
    at: p.timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  scopeIdx("item_cost"),
);

export const storeTable = masterData.table(
  "store",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    siteId: p.text("site_id").notNull().default(""),
    workUnitId: p.text("work_unit_id").notNull().default(""),
    ...dating(),
  },
  scopeIdx("store"),
);

export const binTable = masterData.table(
  "bin",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    storeId: p.text("store_id").notNull(),
    code: p.text("code").notNull(),
    tag: p.text("tag").notNull().default(""),
    ...dating(),
  },
  scopeIdx("bin"),
);

/** ISO 14224 failure modes, mechanisms and causes per equipment class (Table B.6 style), plus the plant's own. */
export const failureCodeTable = masterData.table(
  "failure_code",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    iso14224Class: p.text("iso14224_class").notNull(),
    kind: p.text("kind").notNull(),
    code: p.text("code").notNull(),
    labelId: p.text("label_id").notNull(),
    labelEn: p.text("label_en").notNull(),
    custom: p.boolean("custom").notNull().default(false),
    ...dating(),
  },
  scopeIdx("failure_code"),
);
