import { createMiddleware } from "hono/factory";

import type { AppJwtPayload, AuthEnv } from "./claims.js";

// The organization claim as Keycloak emits it: an object keyed by alias, or a bare array of aliases.
type OrganizationClaim = Record<string, { id?: string; name?: string }> | string[];

// The tenant id IS the Keycloak organization id.
type SessionOrganization = { id: string; alias: string; name: string };

type OrganizationRefusal = "no organization" | "several organizations" | "organization id missing";

type TenantEnv = {
  Variables: AuthEnv["Variables"] & { organization: SessionOrganization };
};

// Reads the one organization a session carries. The claim is either absent, an array of
// alias strings (Keycloak without the id mapper), or an object keyed by alias.
function sessionOrganization(
  payload: AppJwtPayload,
): { ok: true; organization: SessionOrganization } | { ok: false; refusal: OrganizationRefusal } {
  const claim = payload.organization as OrganizationClaim | undefined;
  if (!claim) return { ok: false, refusal: "no organization" };

  if (Array.isArray(claim)) {
    if (claim.length === 0) return { ok: false, refusal: "no organization" };
    if (claim.length > 1) return { ok: false, refusal: "several organizations" };
    return { ok: false, refusal: "organization id missing" };
  }

  const aliases = Object.keys(claim);
  if (aliases.length === 0) return { ok: false, refusal: "no organization" };
  if (aliases.length > 1) return { ok: false, refusal: "several organizations" };

  const alias = aliases[0];
  const value = claim[alias];
  if (typeof value?.id !== "string" || value.id === "") {
    return { ok: false, refusal: "organization id missing" };
  }
  const name = typeof value.name === "string" && value.name !== "" ? value.name : alias;
  return { ok: true, organization: { id: value.id, alias, name } };
}

// FOUNDATION F-00 rule 6 (E-2): one organization per session; none → refused.
function createOrganizationMiddleware() {
  return createMiddleware<TenantEnv>(async (c, next) => {
    const result = sessionOrganization(c.get("jwtPayload"));
    if (!result.ok) {
      return c.json({ error: result.refusal }, 403);
    }
    c.set("organization", result.organization);
    await next();
  });
}

export { sessionOrganization, createOrganizationMiddleware };
export type { SessionOrganization, OrganizationRefusal, TenantEnv };
