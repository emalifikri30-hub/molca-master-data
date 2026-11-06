import { refusal } from "../../shared/errors/refusal.js";
import { runInTenant } from "../../shared/tenant/tenant-context.js";

import type { AuditChange } from "../mes/audit-log/audit-log.js";
import type { TAuditLogService } from "../mes/audit-log/audit-log-service.js";
import type {
  CreatePlatformTenant,
  PlatformTenant,
  PlatformWriteContext,
} from "./platform-tenants.js";
import type { PlatformTenantsStore } from "./platform-tenants-store.js";

/** The audit actions of the TENANT registry, as dx-platform's History reads them (TNT-008). */
type TenantAction = "tenant.create" | "tenant.rename" | "tenant.deactivate" | "tenant.reactivate";

type TPlatformTenantsService = {
  list: () => Promise<PlatformTenant[]>;
  get: (tenantId: string) => Promise<PlatformTenant>;
  findByCode: (tenantCode: string) => Promise<PlatformTenant | undefined>;
  findByName: (tenantName: string) => Promise<PlatformTenant | undefined>;
  create: (input: CreatePlatformTenant, ctx: PlatformWriteContext) => Promise<PlatformTenant>;
  rename: (
    tenantId: string,
    tenantName: string,
    ctx: PlatformWriteContext,
  ) => Promise<PlatformTenant>;
  setValidTo: (
    tenantId: string,
    validTo: string | null,
    ctx: PlatformWriteContext,
  ) => Promise<PlatformTenant>;
};

type PlatformTenantsServiceDeps = {
  platformTenantsStore: PlatformTenantsStore;
  auditLogService: TAuditLogService;
};

/** TNT-G15: codes are stored upper-case and trimmed. */
const normalCode = (code: string) => code.trim().toUpperCase();

/**
 * The TENANT registry as dx-platform provisions it (contract §1, M-1…M-6). The rules
 * mirror dx-platform's in-memory stand-in (module/tnt/foundation.ts); the database
 * keys (`tenant_code_key`, `tenant_name_key`) back the checks up when two writes race.
 *
 * Each write appends its own AUDIT_LOG row in the request's transaction, in the
 * tenant it touches (TNT-G3): actor = the service account, plus the superadmin it
 * acted for (TNT-G7).
 */
class PlatformTenantsService implements TPlatformTenantsService {
  private store: PlatformTenantsStore;
  private audit: TAuditLogService;

  constructor({ platformTenantsStore, auditLogService }: PlatformTenantsServiceDeps) {
    this.store = platformTenantsStore;
    this.audit = auditLogService;
  }

  list(): Promise<PlatformTenant[]> {
    return this.store.list();
  }

  async get(tenantId: string): Promise<PlatformTenant> {
    const row = await this.store.get(tenantId);
    if (!row) throw refusal(404, "not_found");
    return row;
  }

  findByCode(tenantCode: string): Promise<PlatformTenant | undefined> {
    return this.store.findByCode(normalCode(tenantCode));
  }

  findByName(tenantName: string): Promise<PlatformTenant | undefined> {
    return this.store.findByName(tenantName);
  }

  async create(input: CreatePlatformTenant, ctx: PlatformWriteContext): Promise<PlatformTenant> {
    const tenantCode = normalCode(input.tenantCode);
    const tenantName = input.tenantName.trim();
    if (await this.store.get(input.tenantId)) throw refusal(409, "tenant_exists");
    if (await this.store.findByCode(tenantCode)) throw refusal(409, "code_taken");
    if (await this.store.findByName(tenantName)) throw refusal(409, "name_taken");
    const row = await this.store.insert({ ...input, tenantCode, tenantName });
    await this.store.seedMeasurementGroups(row.tenantId, row.validFrom);
    await this.store.seedUnits(row.tenantId);
    await this.record(row, "tenant.create", ctx, {
      effectiveFrom: row.validFrom,
      changes: [
        { field: "tenantCode", before: null, after: row.tenantCode },
        { field: "tenantName", before: null, after: row.tenantName },
      ],
    });
    return row;
  }

  /** TNT-009: the name only; the code is frozen. Same name rule as create. */
  async rename(
    tenantId: string,
    tenantName: string,
    ctx: PlatformWriteContext,
  ): Promise<PlatformTenant> {
    const before = await this.get(tenantId);
    const name = tenantName.trim();
    const clash = await this.store.findByName(name);
    if (clash && clash.tenantId !== tenantId) throw refusal(409, "name_taken");
    const row = await this.store.update(tenantId, { tenantName: name });
    await this.record(row, "tenant.rename", ctx, {
      changes: [{ field: "tenantName", before: before.tenantName, after: row.tenantName }],
    });
    return row;
  }

  /**
   * TNT-007: `validTo` is the last day + 1 (TNT-G8 a) and deactivates; `null`
   * reactivates and also cancels a pending deactivation (TNT-G8 d). A reason is
   * required both ways (AU-2).
   */
  async setValidTo(
    tenantId: string,
    validTo: string | null,
    ctx: PlatformWriteContext,
  ): Promise<PlatformTenant> {
    if (!ctx.reason.trim()) throw refusal(422, "reason_required");
    const before = await this.get(tenantId);
    const row = await this.store.update(tenantId, { validTo });
    await this.record(row, validTo === null ? "tenant.reactivate" : "tenant.deactivate", ctx, {
      effectiveTo: validTo,
      changes: [{ field: "validTo", before: before.validTo, after: row.validTo }],
    });
    return row;
  }

  private async record(
    row: PlatformTenant,
    action: TenantAction,
    ctx: PlatformWriteContext,
    fields: { changes: AuditChange[]; effectiveFrom?: string | null; effectiveTo?: string | null },
  ): Promise<void> {
    // The row belongs to the tenant it touches, so that tenant's audit log shows it (TNT-G3).
    await runInTenant({ tenantId: row.tenantId }, () =>
      this.audit.record({
        action,
        entityType: "TENANT",
        entityId: row.tenantId,
        entityCode: row.tenantCode,
        previousVersionEntityId: null,
        effectiveFrom: fields.effectiveFrom ?? null,
        effectiveTo: fields.effectiveTo ?? null,
        changes: fields.changes,
        importBatchId: null,
        siteId: null,
        actorType: "service",
        actorSubjectId: ctx.caller.subjectId,
        actorDisplayName: ctx.caller.displayName,
        onBehalfOfSubjectId: ctx.onBehalfOf.subjectId,
        onBehalfOfDisplayName: ctx.onBehalfOf.displayName,
        source: "api",
        reason: ctx.reason,
      }),
    );
  }
}

export { PlatformTenantsService };
export type { PlatformTenantsServiceDeps, TenantAction, TPlatformTenantsService };
