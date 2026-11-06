import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const auditLogTable = masterData.table(
  "audit_log",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    occurredAt: p.text("occurred_at").notNull(),
    action: p.text("action").notNull(),
    entityType: p.text("entity_type").notNull(),
    entityId: p.text("entity_id").notNull(),
    entityCode: p.text("entity_code").notNull().default(""),
    previousVersionEntityId: p.text("previous_version_entity_id"),
    effectiveFrom: p.text("effective_from"),
    effectiveTo: p.text("effective_to"),
    changes: p
      .jsonb("changes")
      .$type<Array<{ field: string; before: unknown; after: unknown }>>()
      .notNull(),
    reason: p.text("reason").notNull().default(""),
    source: p.text("source").notNull(),
    domainCode: p.text("domain_code").notNull(),
    moduleCode: p.text("module_code").notNull(),
    importBatchId: p.text("import_batch_id"),
    transactionId: p.text("transaction_id").notNull(),
    actorType: p.text("actor_type").notNull(),
    actorSubjectId: p.text("actor_subject_id").notNull(),
    actorDisplayName: p.text("actor_display_name").notNull(),
    // TNT-G7: the person a service account wrote for (the superadmin behind dx-platform-svc).
    onBehalfOfSubjectId: p.text("on_behalf_of_subject_id"),
    onBehalfOfDisplayName: p.text("on_behalf_of_display_name"),
    // F-14 §9.1 scope snapshot at write time (tenant_id: F-00 rule 6, set by the repository).
    enterpriseId: p.text("enterprise_id"),
    siteId: p.text("site_id"),
    areaId: p.text("area_id"),
    workCenterId: p.text("work_center_id"),
    workUnitId: p.text("work_unit_id"),
    scopeLevel: p.text("scope_level").notNull().default("tenant"),
    downloadFilter: p.text("download_filter"),
    downloadRowCount: p.integer("download_row_count"),
  },
  scopeIdx("audit_log"),
);
