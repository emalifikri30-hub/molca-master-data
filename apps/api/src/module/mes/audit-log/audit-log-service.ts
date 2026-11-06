import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";

import { MASK, maskConfig } from "../data-sources/connection-secrets.js";

import type { AuditLog, AuditLogFilter, CreateAuditLog } from "./audit-log.js";
import type { AuditLogStore } from "./audit-log-store.js";

// AUD-001 rule 9: domain_code + module_code name the owner of the written
// entity. FOUNDATION entity types resolve here; other domains send theirs.
const FOUNDATION_MODULE: Record<string, string> = {
  // F-14 §9 module list: TENANT is Site Hierarchy's (F-01 §9.1).
  TENANT: "SIT",
  ENTERPRISE: "SIT",
  SITE: "SIT",
  AREA: "SIT",
  WORK_CENTER: "SIT",
  WORK_UNIT: "SIT",
  EQUIPMENT_FLOW: "SIT",
  SITE_CLASS: "SIT",
  AREA_CLASS: "SIT",
  WORK_CENTER_CLASS: "SIT",
  WORK_UNIT_CLASS: "SIT",
  SHIFT_DEFINITION: "SHF",
  SITE_SHIFT: "SHF",
  SHIFT_INSTANCE: "SHF",
  FISCAL_YEAR: "FYR",
  ASSET_CLASS: "AST",
  ASSET_TYPE: "AST",
  ASSET: "AST",
  ASSET_PLACEMENT: "AST",
  ASSET_TAGS: "AST",
  // PRD-003 WMS-006: authored on the Routing tab, owned by Equipment Taxonomy (F-04 §9.7).
  ASSET_PRODUCT_CODES: "AST",
  DOWNTIME_REASON: "REF",
  REJECT_REASON: "REF",
  DOWNTIME_REASON_ASSET: "REF",
  REJECT_REASON_ASSET: "REF",
  UNIT_OF_MEASUREMENTS: "REF",
  TIME_CONVERSIONS: "REF",
  PRODUCT: "PRO",
  PRODUCT_MEASUREMENT: "PRO",
  PRODUCT_UOM_CONVERSION: "PRO",
  PRODUCT_CYCLE_TIME: "PRO",
  KPI_FORMULA_SLOT: "KPI",
  WORK_UNIT_KPI_BINDING: "KPI",
  KPI_PARAMETER: "KPI",
  MEASUREMENT_GROUP: "REF",
  PRODUCT_FLOW: "WMS",
  BOM: "WMS",
  BOM_LINE: "WMS",
  ROUTING: "WMS",
  OPERATION: "WMS",
  DATA_SOURCE: "DSR",
  AUDIT_LOG: "AUD",
};

const SECRET_FIELDS = new Set(["connectionConfig"]);

/**
 * AUD-001 AC-8 / F-14 core concept 8 (PO 2026-10-02): in `connection_config`
 * only the credentials are secret — the endpoint is logged in clear so an IP
 * change can be traced. A value that isn't a key/value object can't be split
 * and is masked whole.
 */
function maskSecret(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return maskConfig(value as Record<string, unknown>);
  }
  return MASK;
}

// AUD-001 rule 5 (PO 2026-10-02, prd-molcadx#24 item 23): `release` and
// `upload` need a reason too (an upload: one per batch, copied to every row).
// Only create, downloads and a refused release (`release_blocked`, which
// changes nothing) take none.
const NO_REASON_ACTIONS = new Set(["create", "download", "release_blocked"]);

/** Actions a person must give a reason for (AUD-001 rule 5). Downloads never ask. */
function reasonRequired(action: string): boolean {
  return !NO_REASON_ACTIONS.has(action) && !action.endsWith("_downloaded");
}

/** AUD-003 [proposed]: one search covers at most 366 days. */
const MAX_PERIOD_DAYS = 366;

/** Who downloads, from the token (never from the request body). */
type DownloadActor = { subjectId: string; displayName: string };

type TAuditLogService = {
  record: (input: CreateAuditLog) => Promise<AuditLog>;
  list: (filter: AuditLogFilter) => Promise<AuditLog[]>;
  history: (entityType: string, entityId: string) => Promise<AuditLog[]>;
  startedAt: () => Promise<string | null>;
  download: (filter: AuditLogFilter, fileName: string, actor: DownloadActor) => Promise<AuditLog[]>;
};

const DAY_MS = 86_400_000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

/** A search needs a period of at most 366 days; the default is the last 7. */
function period(filter: AuditLogFilter): AuditLogFilter {
  const from = filter.from ?? daysAgo(7);
  const to = filter.to ?? daysAgo(0);
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (!(span >= 0)) throw refusal(422, "period_invalid", { from, to });
  if (span > MAX_PERIOD_DAYS) {
    throw refusal(422, "period_too_long", { from, to, maxDays: MAX_PERIOD_DAYS });
  }
  return { ...filter, from, to };
}

type AuditLogServiceDeps = { auditLogStore: AuditLogStore };

class AuditLogService implements TAuditLogService {
  private store: AuditLogStore;

  constructor({ auditLogStore }: AuditLogServiceDeps) {
    this.store = auditLogStore;
  }

  async record(input: CreateAuditLog): Promise<AuditLog> {
    const reason = (input.reason ?? "").trim();
    // AUD-001 AC-9: a person's edit without a reason is refused; nothing is written.
    const { reasonOptional, scope: _scope, ...fields } = input;
    if (input.actorType === "user" && reasonRequired(input.action) && !reason && !reasonOptional) {
      throw refusal(422, "reason_required");
    }
    const moduleCode = input.moduleCode ?? FOUNDATION_MODULE[input.entityType] ?? "SIT";
    return await this.store.append({
      scopeLevel: "tenant",
      ...fields,
      occurredAt: new Date().toISOString(),
      reason,
      domainCode: input.domainCode ?? "FND",
      moduleCode,
      transactionId: input.transactionId ?? ulid(),
      source: input.source ?? (input.actorType === "service" ? "system" : "ui"),
      // AUD-001 AC-8: secrets are masked whatever the client sent.
      changes: input.changes.map((c) =>
        SECRET_FIELDS.has(c.field)
          ? { field: c.field, before: maskSecret(c.before), after: maskSecret(c.after) }
          : c,
      ),
    });
  }

  /** AUD-003: newest first, filtered in the database, within a period of at most 366 days. */
  async list(filter: AuditLogFilter): Promise<AuditLog[]> {
    return [...(await this.store.query(period(filter)))].reverse();
  }

  /**
   * AUD-004: the rows of the file, and the `download` row that records it,
   * in one transaction (F-14 §9.2 "Downloads are recorded"). `filter.modules`
   * holds the modules the reader may download, so the count matches the file.
   */
  async download(
    filter: AuditLogFilter,
    fileName: string,
    actor: DownloadActor,
  ): Promise<AuditLog[]> {
    const rows = await this.list(filter);
    await this.record({
      action: "download",
      entityType: "AUDIT_LOG",
      entityId: fileName,
      entityCode: fileName,
      previousVersionEntityId: null,
      effectiveFrom: null,
      effectiveTo: null,
      changes: [],
      importBatchId: null,
      actorType: "user",
      actorSubjectId: actor.subjectId,
      actorDisplayName: actor.displayName,
      siteId: null,
      domainCode: "FND",
      moduleCode: "AUD",
      downloadFilter: JSON.stringify(filter),
      downloadRowCount: rows.length,
    });
    return rows;
  }

  /** AUD-002 empty state: when the trail started. */
  startedAt(): Promise<string | null> {
    return this.store.startedAt();
  }

  /** AUD-002 AC-2: every version of a record, joined through previousVersionEntityId. */
  async history(entityType: string, entityId: string): Promise<AuditLog[]> {
    const ofType = await this.store.query({ entityType });
    const ids = new Set([entityId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of ofType) {
        if (
          !ids.has(r.entityId) &&
          !(r.previousVersionEntityId && ids.has(r.previousVersionEntityId))
        )
          continue;
        for (const id of [r.entityId, r.previousVersionEntityId]) {
          if (id && !ids.has(id)) {
            ids.add(id);
            grew = true;
          }
        }
      }
    }
    return ofType.filter((r) => ids.has(r.entityId)).reverse();
  }
}

export { AuditLogService, reasonRequired };
export type { TAuditLogService, AuditLogServiceDeps };
