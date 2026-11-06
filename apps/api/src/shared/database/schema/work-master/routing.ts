import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const routingTable = masterData.table(
  "routing",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    productId: p.text("product_id").notNull(),
    workCenterId: p.text("work_center_id").notNull(),
    flowId: p.text("flow_id").notNull(),
    version: p.integer("version").notNull(),
    status: p.text("status").notNull(),
    isPrimary: p.boolean("is_primary").notNull(),
    enforceSequence: p.boolean("enforce_sequence").notNull(),
    ...datingDays(),
  },
  (t) => [
    ...scopeIdx("routing")(t),
    // F-08 ROUTING: versions numbered 1, 2, 3… per flow + work center.
    p.unique("routing_flow_wc_version_key").on(t.flowId, t.workCenterId, t.version),
  ],
);
