import type { ScopeHint } from "../../../shared/audit/audit-scope.js";
import type {
  AUDIT_ACTOR_TYPE_VALUES,
  AUDIT_SOURCE_VALUES,
} from "../../../shared/database/schema/value-lists.js";

// FOUNDATION F-14 `AUDIT_LOG` (PRD-003 14-audit-trail.md): one append-only
// row per change, in every domain. FOUNDATION owns it; every domain's app
// writes to it (PRD-003 AUD-001, PRD-004 PLN-011 / MON-007 / PRF-007).
//
// Rows are written by the system only (F-14 §9.2): shared/audit captures each
// save's writes and appends its rows in the save's own transaction, with the
// actor taken from the token. There is no public write route.

type ActorType = (typeof AUDIT_ACTOR_TYPE_VALUES)[number];
type AuditSource = (typeof AUDIT_SOURCE_VALUES)[number];

type AuditChange = { field: string; before: unknown; after: unknown };

type AuditLog = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string;
  entityCode: string;
  previousVersionEntityId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  changes: AuditChange[];
  reason: string;
  source: AuditSource;
  /** Owner of the written entity (AUD-001 rule 9), e.g. FND / PROD. */
  domainCode: string;
  /** e.g. SIT, PLN, MON. */
  moduleCode: string;
  importBatchId: string | null;
  transactionId: string;
  actorType: ActorType;
  actorSubjectId: string;
  actorDisplayName: string;
  /** TNT-G7: the person a service account wrote for (dx-platform-svc for the superadmin). */
  onBehalfOfSubjectId?: string | null;
  onBehalfOfDisplayName?: string | null;
  /** F-14 §9.1 scope snapshot at write time, down to the level the record resolved to. */
  enterpriseId?: string | null;
  siteId: string | null;
  areaId?: string | null;
  workCenterId?: string | null;
  workUnitId?: string | null;
  /** The deepest level filled: tenant / enterprise / site / area / work_center / work_unit. */
  scopeLevel?: string;
  downloadFilter?: string;
  downloadRowCount?: number;
};

type CreateAuditLog = Omit<
  AuditLog,
  "id" | "occurredAt" | "domainCode" | "moduleCode" | "transactionId" | "source" | "reason"
> & {
  domainCode?: string;
  moduleCode?: string;
  transactionId?: string;
  source?: AuditSource;
  reason?: string;
  /** Not stored. A draft edit's row: written without a reason (interim rule). */
  reasonOptional?: boolean;
  /** Not stored. The level the record names; the audit middleware resolves the snapshot. */
  scope?: ScopeHint | null;
};

/** AUD-003 search. Dates are `YYYY-MM-DD`, both ends included. */
type AuditLogFilter = {
  from?: string;
  to?: string;
  domainCode?: string;
  moduleCode?: string;
  /** Only rows of these modules (AUD-004: what the reader may download). */
  modules?: string[];
  entityType?: string;
  action?: string;
  source?: string;
  siteId?: string;
  /** Part of the actor's display name, any case. */
  person?: string;
};

export type { AuditLog, CreateAuditLog, AuditChange, AuditLogFilter, ActorType, AuditSource };
