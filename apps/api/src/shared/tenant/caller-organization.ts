import { createMiddleware } from "hono/factory";
import { sessionOrganization } from "@molca/security";

import type { TenantEnv } from "@molca/security";

/**
 * Service clients that may read one tenant's data with a client-credentials token
 * (cross-repo contract §0b). Their token has no `organization` claim, so they name
 * the tenant in {@link TENANT_HEADER}. Today: USR (dx-user-management), which reads
 * the Site Hierarchy for its scope pickers, Production Planning (dx-production-planning-svc),
 * and Production Reports (dx-production-reports-svc, the Monitoring and Performance apps),
 * which read the recipe, calendar and reference data.
 */
const TENANT_READ_CLIENTS: ReadonlySet<string> = new Set([
  "dx-user-management-svc",
  "dx-production-planning-svc",
  "dx-production-reports-svc",
]);

/** The header a service client names its tenant in. */
const TENANT_HEADER = "x-tenant-id";

const READ_ONLY = new Set(["GET", "HEAD"]);

/**
 * Who the request works for, as an organization (F-00 rule 6, E-2). Replaces
 * `createOrganizationMiddleware` on the tenant API; must run after the auth middleware.
 *
 * - A token with an `organization` claim: that organization, exactly as before. The
 *   tenant header is ignored, so a person can never reach another tenant.
 * - A token with no `organization` claim, issued (`azp`) to a client in
 *   {@link TENANT_READ_CLIENTS}, on a read, with {@link TENANT_HEADER} set: the
 *   tenant named in the header. The tenant middleware then refuses it unless that
 *   tenant is in force today, as for a person.
 * - Anything else is refused as before (403 "no organization", …). A service client
 *   never writes through this API: writes need a person (actor and reason, F-14 §9.2).
 */
function createCallerOrganizationMiddleware(
  readClients: ReadonlySet<string> = TENANT_READ_CLIENTS,
) {
  return createMiddleware<TenantEnv>(async (c, next) => {
    const payload = c.get("jwtPayload");
    const result = sessionOrganization(payload);
    if (result.ok) {
      c.set("organization", result.organization);
      return next();
    }
    const serviceRead =
      result.refusal === "no organization" &&
      typeof payload.azp === "string" &&
      readClients.has(payload.azp) &&
      READ_ONLY.has(c.req.method);
    const tenantId = c.req.header(TENANT_HEADER)?.trim();
    if (!serviceRead || !tenantId) {
      return c.json({ error: result.refusal }, 403);
    }
    c.set("organization", { id: tenantId, alias: tenantId, name: tenantId });
    await next();
  });
}

export { createCallerOrganizationMiddleware, TENANT_HEADER, TENANT_READ_CLIENTS };
