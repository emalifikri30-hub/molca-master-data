import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "@molca/mes";

/**
 * The one client allowed on `/platform/*`: dx-platform's provisioning service account
 * (dx-platform cross-repo contract §0, client credentials in realm dx-molca).
 */
const PLATFORM_CLIENT_ID = "dx-platform-svc";

/** Who called a platform route: the service account, as its token names it. */
type ServiceCaller = { subjectId: string; displayName: string };

type PlatformEnv = {
  Variables: AuthEnv["Variables"] & { caller: ServiceCaller };
};

/**
 * The E-2 exception for `/platform/*` (contract §0). Must run after the auth middleware.
 *
 * - Only a token issued to `dx-platform-svc` (`azp`) passes. Roles are never read, so
 *   a person's token with the realm role `dx-superadmin` is refused like any other (TNT-G1).
 * - That token carries no `organization` claim; one that does is refused: the tenant
 *   comes from the path, never from the token.
 *
 * Every other route keeps `createOrganizationMiddleware`, which refuses a token without
 * an organization, so this token cannot reach them.
 */
function createPlatformGate(): MiddlewareHandler<PlatformEnv> {
  return async (c, next) => {
    const jwt = c.get("jwtPayload");
    if (jwt?.azp !== PLATFORM_CLIENT_ID) {
      return c.json({ error: "platform service only" }, 403);
    }
    if (jwt.organization !== undefined && jwt.organization !== null) {
      return c.json({ error: "platform token must not name an organization" }, 403);
    }
    c.set("caller", {
      subjectId: jwt.sub ?? "",
      displayName: jwt.preferred_username ?? jwt.azp,
    });
    await next();
  };
}

export { createPlatformGate, PLATFORM_CLIENT_ID };
export type { PlatformEnv, ServiceCaller };
