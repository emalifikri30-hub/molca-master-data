import { and, eq } from "drizzle-orm";

import { currentTenantId } from "../tenant/tenant-context.js";
import { connection } from "../database/transaction.js";
import { areaTable, siteTable, workCenterTable, workUnitTable } from "../database/schema/schema.js";

import type { PostgresDB } from "../database/postgres.js";
import type { Row } from "./audit-context.js";

/** F-14 §9.1 `scope_level`: the deepest level of the scope snapshot that is filled. */
type ScopeLevel = "tenant" | "enterprise" | "site" | "area" | "work_center" | "work_unit";

/** The level a record names itself, and its id there. */
type ScopeHint = { level: Exclude<ScopeLevel, "tenant">; id: string };

/** F-14 §9.1 scope snapshot (tenant_id is set from the tenant context on insert, F-00 rule 6). */
type ScopeSnapshot = {
  enterpriseId: string | null;
  siteId: string | null;
  areaId: string | null;
  workCenterId: string | null;
  workUnitId: string | null;
  scopeLevel: ScopeLevel;
};

const SELF: Record<string, ScopeHint["level"]> = {
  ENTERPRISE: "enterprise",
  SITE: "site",
  AREA: "area",
  WORK_CENTER: "work_center",
  WORK_UNIT: "work_unit",
};

const filled = (value: unknown): value is string => typeof value === "string" && value !== "";

/**
 * The deepest hierarchy level a changed record resolves to: itself for a
 * hierarchy record, else the work unit / work center / area / site /
 * enterprise it points at. None = tenant scope (e.g. a product, F-14 P-1).
 */
function scopeHint(entityType: string, record: Row): ScopeHint | null {
  const self = SELF[entityType];
  if (self && filled(record.id)) return { level: self, id: record.id };
  if (filled(record.workUnitId)) return { level: "work_unit", id: record.workUnitId };
  if (filled(record.workCenterId)) return { level: "work_center", id: record.workCenterId };
  if (filled(record.areaId)) return { level: "area", id: record.areaId };
  if (filled(record.siteId)) return { level: "site", id: record.siteId };
  if (filled(record.enterpriseId)) return { level: "enterprise", id: record.enterpriseId };
  return null;
}

const TENANT: ScopeSnapshot = {
  enterpriseId: null,
  siteId: null,
  areaId: null,
  workCenterId: null,
  workUnitId: null,
  scopeLevel: "tenant",
};

/**
 * Fills the snapshot from the hinted level up to the enterprise, reading the
 * hierarchy inside the save's transaction (so a record created in the same
 * save is found). An unknown id leaves the levels above it empty. Each level is
 * read within the current tenant (F-00 rule 6), so another tenant's id resolves to nothing.
 */
async function resolveScope(db: PostgresDB, hint: ScopeHint | null): Promise<ScopeSnapshot> {
  if (!hint) return TENANT;
  const conn = connection(db);
  const out: ScopeSnapshot = { ...TENANT, scopeLevel: hint.level };
  let level: ScopeLevel = hint.level;
  let id: string | null = hint.id;
  while (id && level !== "tenant") {
    if (level === "work_unit") {
      out.workUnitId = id;
      const [r] = await conn
        .select({ up: workUnitTable.workCenterId })
        .from(workUnitTable)
        .where(and(eq(workUnitTable.id, id), eq(workUnitTable.tenantId, currentTenantId())));
      [level, id] = ["work_center", r?.up ?? null];
    } else if (level === "work_center") {
      out.workCenterId = id;
      const [r] = await conn
        .select({ up: workCenterTable.areaId })
        .from(workCenterTable)
        .where(and(eq(workCenterTable.id, id), eq(workCenterTable.tenantId, currentTenantId())));
      [level, id] = ["area", r?.up ?? null];
    } else if (level === "area") {
      out.areaId = id;
      const [r] = await conn
        .select({ up: areaTable.siteId })
        .from(areaTable)
        .where(and(eq(areaTable.id, id), eq(areaTable.tenantId, currentTenantId())));
      [level, id] = ["site", r?.up ?? null];
    } else if (level === "site") {
      out.siteId = id;
      const [r] = await conn
        .select({ up: siteTable.enterpriseId })
        .from(siteTable)
        .where(and(eq(siteTable.id, id), eq(siteTable.tenantId, currentTenantId())));
      [level, id] = ["enterprise", r?.up ?? null];
    } else {
      out.enterpriseId = id;
      level = "tenant";
    }
  }
  return out;
}

export { resolveScope, scopeHint };
export type { ScopeHint, ScopeLevel, ScopeSnapshot };
