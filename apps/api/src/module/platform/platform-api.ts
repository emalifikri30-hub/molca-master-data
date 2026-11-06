import { Hono } from "hono";

import { transactionMiddleware } from "../../shared/database/transaction-middleware.js";
import { createPlatformGate } from "./platform-gate.js";
import { createPlatformTenantsHandler } from "./platform-tenants-handler.js";

import type { MiddlewareHandler } from "hono";
import type { Transact } from "../../shared/database/transaction.js";
import type { TPlatformTenantsService } from "./platform-tenants-service.js";

type PlatformApiDeps = {
  authMw: MiddlewareHandler;
  transact: Transact;
  platformTenantsService: TPlatformTenantsService;
};

/**
 * `/api/v1/platform/*`: the routes dx-platform calls with its service account
 * (cross-repo contract §0). Mounted before the tenant API, with its own chain:
 * auth → platform gate (E-2 exception) → one transaction per write. It has no
 * organization or tenant middleware: the tenant is named in the path.
 */
function createPlatformApi({ authMw, transact, platformTenantsService }: PlatformApiDeps) {
  const platform = new Hono().basePath("/api/v1/platform");
  platform.use("*", authMw);
  platform.use("*", createPlatformGate());
  platform.use("*", transactionMiddleware(transact));
  platform.route("/tenants", createPlatformTenantsHandler({ platformTenantsService }));
  return platform;
}

export { createPlatformApi };
export type { PlatformApiDeps };
