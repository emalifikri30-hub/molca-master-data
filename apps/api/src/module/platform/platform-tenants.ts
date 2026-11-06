import type { ServiceCaller } from "./platform-gate.js";

/**
 * A TENANT row as dx-platform reads it (F-01 §9.1; dx-platform `TenantRow` in
 * module/tnt/ports.ts, minus `keycloakOrgId`, which is always `tenantId`).
 * Dates are YYYY-MM-DD; `validTo` is the exclusive end (last day + 1, TNT-G8 a).
 */
type PlatformTenant = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  validFrom: string;
  validTo: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

type CreatePlatformTenant = Pick<
  PlatformTenant,
  "tenantId" | "tenantCode" | "tenantName" | "validFrom"
>;

/** The person a platform write is for: the superadmin behind dx-platform (TNT-G7). */
type OnBehalfOf = { subjectId: string; displayName: string };

/** Who wrote, for whom, and why: what every platform write audits (TNT-G3, TNT-G7). */
type PlatformWriteContext = {
  caller: ServiceCaller;
  onBehalfOf: OnBehalfOf;
  /** "" when the caller gave none. */
  reason: string;
};

export type { CreatePlatformTenant, OnBehalfOf, PlatformTenant, PlatformWriteContext };
