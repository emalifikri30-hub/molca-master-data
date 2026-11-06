import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const dataSourceTable = masterData.table(
  "data_source",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    // F-13 §9.1 (PO 2026-09-04): the one site the connection is wired into.
    // Required on every new source; nullable only for rows from before it.
    siteId: p.text("site_id"),
    name: p.text("name").notNull(),
    protocol: p.text("protocol").notNull(),
    nodeNaming: p.text("node_naming").notNull(),
    namespaceUri: p.text("namespace_uri").notNull().default(""),
    topicRoot: p.text("topic_root").notNull().default(""),
    connectionConfig: p
      .jsonb("connection_config")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    ...dating(),
  },
  scopeIdx("data_source"),
);
