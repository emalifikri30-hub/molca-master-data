import { describe, it, expect } from "vite-plus/test";
import { Hono } from "hono";

import type { AppJwtPayload } from "../src/claims.js";
import { sessionOrganization, createOrganizationMiddleware } from "../src/organization.js";

const ORG_ID = "7d1c2f0e-1111-4a2b-9c3d-000000000001";

function payload(organization: unknown): AppJwtPayload {
  return { sub: "u1", organization } as AppJwtPayload;
}

describe("sessionOrganization", () => {
  it("refuses a token with no organization claim (F-00 rule 6)", () => {
    expect(sessionOrganization(payload(undefined))).toEqual({
      ok: false,
      refusal: "no organization",
    });
  });

  it("refuses a null, empty array or empty object organization claim (F-00 rule 6)", () => {
    for (const claim of [null, [], {}]) {
      expect(sessionOrganization(payload(claim))).toEqual({
        ok: false,
        refusal: "no organization",
      });
    }
  });

  it("refuses several organizations in an array (F-00 rule 6)", () => {
    expect(sessionOrganization(payload(["acme", "globex"]))).toEqual({
      ok: false,
      refusal: "several organizations",
    });
  });

  it("refuses several organizations in an object (F-00 rule 6)", () => {
    expect(sessionOrganization(payload({ acme: { id: ORG_ID }, globex: { id: "x" } }))).toEqual({
      ok: false,
      refusal: "several organizations",
    });
  });

  it("refuses a single alias string without an id (F-00 rule 6)", () => {
    expect(sessionOrganization(payload(["acme"]))).toEqual({
      ok: false,
      refusal: "organization id missing",
    });
  });

  it("refuses a single organization whose value has no non-empty id (F-00 rule 6)", () => {
    expect(sessionOrganization(payload({ acme: { name: "Acme" } }))).toEqual({
      ok: false,
      refusal: "organization id missing",
    });
    expect(sessionOrganization(payload({ acme: { id: "", name: "Acme" } }))).toEqual({
      ok: false,
      refusal: "organization id missing",
    });
  });

  it("returns the organization with id, alias and name (F-00 rule 6)", () => {
    expect(sessionOrganization(payload({ acme: { id: ORG_ID, name: "Acme Ltd" } }))).toEqual({
      ok: true,
      organization: { id: ORG_ID, alias: "acme", name: "Acme Ltd" },
    });
  });

  it("falls back to the alias when the organization has no name (F-00 rule 6)", () => {
    expect(sessionOrganization(payload({ acme: { id: ORG_ID } }))).toEqual({
      ok: true,
      organization: { id: ORG_ID, alias: "acme", name: "acme" },
    });
  });
});

describe("createOrganizationMiddleware", () => {
  function app(organization: unknown) {
    const a = new Hono<any>();
    a.use("*", async (c, next) => {
      c.set("jwtPayload", payload(organization));
      await next();
    });
    a.use("*", createOrganizationMiddleware());
    a.get("/", (c) => c.json(c.get("organization")));
    return a;
  }

  it("refuses a token with no organization with 403 (F-00 rule 6)", async () => {
    const res = await app(undefined).request("/");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no organization" });
  });

  it("refuses several organizations with 403 (F-00 rule 6)", async () => {
    const res = await app(["acme", "globex"]).request("/");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "several organizations" });
  });

  it("refuses a missing organization id with 403 (F-00 rule 6)", async () => {
    const res = await app(["acme"]).request("/");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "organization id missing" });
  });

  it("passes one organization and exposes it as c.get('organization') (F-00 rule 6)", async () => {
    const res = await app({ acme: { id: ORG_ID, name: "Acme Ltd" } }).request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ORG_ID, alias: "acme", name: "Acme Ltd" });
  });
});
