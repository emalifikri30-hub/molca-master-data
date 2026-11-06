import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

// Change control (PRD Workflow & approval, Master Data change approval): a sensitive change — retiring an asset,
// deactivating a catalogue record or a hierarchy node, revaluing an item — is held as a request and only replayed
// once someone other than its maker approves it. The original request (method, path, body, reason) is kept whole.
export const changeRequestTable = masterData.table(
  "change_request",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    entity: p.text("entity").notNull(),
    entityId: p.text("entity_id").notNull(),
    entityLabel: p.text("entity_label").notNull().default(""),
    action: p.text("action").notNull(),
    method: p.text("method").notNull(),
    path: p.text("path").notNull(),
    body: p.jsonb("body").$type<Record<string, unknown>>(),
    reason: p.text("reason").notNull().default(""),
    status: p.text("status").notNull().default("pending"),
    makerId: p.text("maker_id").notNull(),
    makerName: p.text("maker_name").notNull().default(""),
    decidedBy: p.text("decided_by"),
    decidedByName: p.text("decided_by_name").notNull().default(""),
    decisionNote: p.text("decision_note").notNull().default(""),
    decidedAt: p.timestamp("decided_at", { withTimezone: true, mode: "string" }),
  },
  scopeIdx("change_request"),
);
