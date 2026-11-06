import { and, eq, gte, ilike, inArray, lt, type SQL } from "drizzle-orm";
import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { auditLogTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { AuditLog, AuditLogFilter } from "./audit-log.js";

const KEYS = [
  "id",
  "occurredAt",
  "action",
  "entityType",
  "entityId",
  "entityCode",
  "previousVersionEntityId",
  "effectiveFrom",
  "effectiveTo",
  "changes",
  "reason",
  "source",
  "domainCode",
  "moduleCode",
  "importBatchId",
  "transactionId",
  "actorType",
  "actorSubjectId",
  "actorDisplayName",
  "onBehalfOfSubjectId",
  "onBehalfOfDisplayName",
  "enterpriseId",
  "siteId",
  "areaId",
  "workCenterId",
  "workUnitId",
  "scopeLevel",
  "downloadFilter",
  "downloadRowCount",
];

// Append-only: no update, no delete (AUD-001 rule 3).
class AuditLogStore {
  private repo?: EntityRepository<AuditLog>;
  private items: AuditLog[] = [];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<AuditLog>(deps, auditLogTable, KEYS);
  }

  async append(row: Omit<AuditLog, "id">): Promise<AuditLog> {
    const created = { ...row, id: ulid() };
    if (this.repo) return this.repo.insert(created);
    this.items.push(created);
    return created;
  }

  /** When the trail started: the oldest row's write time, or null when it's empty. */
  async startedAt(): Promise<string | null> {
    if (this.repo) {
      const { items } = await this.repo.paginate({ limit: 1, offset: 0 }, []);
      return items[0]?.occurredAt ?? null;
    }
    return this.items[0]?.occurredAt ?? null;
  }

  /** Oldest first (ids are ULIDs). The period is filtered in the database, not in memory. */
  async query(filter: AuditLogFilter): Promise<AuditLog[]> {
    if (this.repo) return this.repo.list(where(filter));
    return this.items.filter((row) => matches(row, filter));
  }
}

export { AuditLogStore };

/** `to` is a whole day: rows before the next midnight (UTC). */
function dayAfter(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function where(f: AuditLogFilter): SQL | undefined {
  const t = auditLogTable;
  const conds: SQL[] = [];
  if (f.from) conds.push(gte(t.occurredAt, f.from));
  if (f.to) conds.push(lt(t.occurredAt, dayAfter(f.to)));
  if (f.domainCode) conds.push(eq(t.domainCode, f.domainCode));
  if (f.moduleCode) conds.push(eq(t.moduleCode, f.moduleCode));
  if (f.modules) conds.push(inArray(t.moduleCode, f.modules.length ? f.modules : [""]));
  if (f.entityType) conds.push(eq(t.entityType, f.entityType));
  if (f.action) conds.push(eq(t.action, f.action));
  if (f.source) conds.push(eq(t.source, f.source as AuditLog["source"]));
  if (f.siteId) conds.push(eq(t.siteId, f.siteId));
  if (f.person) conds.push(ilike(t.actorDisplayName, `%${f.person}%`));
  return conds.length ? and(...conds) : undefined;
}

function matches(r: AuditLog, f: AuditLogFilter): boolean {
  if (f.from && r.occurredAt < f.from) return false;
  if (f.to && r.occurredAt >= dayAfter(f.to)) return false;
  if (f.domainCode && r.domainCode !== f.domainCode) return false;
  if (f.moduleCode && r.moduleCode !== f.moduleCode) return false;
  if (f.modules && !f.modules.includes(r.moduleCode)) return false;
  if (f.entityType && r.entityType !== f.entityType) return false;
  if (f.action && r.action !== f.action) return false;
  if (f.source && r.source !== f.source) return false;
  if (f.siteId && r.siteId !== f.siteId) return false;
  if (f.person && !r.actorDisplayName.toLowerCase().includes(f.person.toLowerCase())) return false;
  return true;
}
