import { bearerToken } from "@molca/mes";

import { runInTenant } from "./tenant-context.js";

import type { MiddlewareHandler } from "hono";
import type { TenantEnv } from "@molca/security";
import type { FindTenant, Tenant } from "./tenant-store.js";

type TenantMiddlewareDeps = {
  findTenant: FindTenant;
  /** IANA zone of the install (`INSTALL_TIME_ZONE`, TNT-G8 b). */
  timeZone: string;
  /** The clock; tests pin it. */
  now?: () => Date;
};

/** The request after the tenant middleware: the organization, and the tenant it resolved to. */
type TenantRequestEnv = {
  Variables: TenantEnv["Variables"] & { tenant: Tenant };
};

/**
 * The date `now` falls on in `timeZone`, as YYYY-MM-DD (TNT-G8 b). A tenant whose last
 * day is 31 Dec closes at midnight in the install's zone, not at midnight UTC. Same
 * rule as dx-platform's `todayIn` (module/tnt/tnt-rules.ts).
 */
function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * Every request works in the one tenant of its signed-in organization (F-00 rule 6, E-2).
 * Must run after `createOrganizationMiddleware`. An organization with no tenant in
 * force today (in the install's time zone) is refused; the handlers and the repositories below run inside the tenant.
 */
function createTenantMiddleware({
  findTenant,
  timeZone,
  now = () => new Date(),
}: TenantMiddlewareDeps): MiddlewareHandler<TenantRequestEnv> {
  return async (c, next) => {
    const { id } = c.get("organization");
    const tenant = await findTenant(id, todayIn(timeZone, now()));
    if (!tenant) return c.json({ error: "no active tenant" }, 403);
    c.set("tenant", tenant);
    await runInTenant({ tenantId: id, bearer: bearerToken()(c) }, () => next());
  };
}

export { createTenantMiddleware, todayIn };
export type { TenantMiddlewareDeps, TenantRequestEnv };
