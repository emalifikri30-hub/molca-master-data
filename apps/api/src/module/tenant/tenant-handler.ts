import { Hono } from "hono";

import { WebResponse } from "@molca/network";

import type { TenantRequestEnv } from "../../shared/tenant/tenant-middleware.js";

/** The tenant a request works in, as the other MolcaDx modules read it. */
type CurrentTenant = { id: string; code: string; name: string };

/**
 * GET /api/v1/tenant. Other MolcaDx modules call it with the user's token to check the
 * tenant is still active. The tenant middleware has already refused an inactive one.
 */
function createTenantHandler() {
  const app = new Hono<TenantRequestEnv>();

  app.get("/", (c) => {
    const tenant = c.get("tenant");
    const current: CurrentTenant = {
      id: tenant.tenantId,
      code: tenant.tenantCode,
      name: tenant.tenantName,
    };
    return c.json(WebResponse.builder<CurrentTenant>().data(current).build(), 200);
  });

  return app;
}

export { createTenantHandler };
export type { CurrentTenant };
