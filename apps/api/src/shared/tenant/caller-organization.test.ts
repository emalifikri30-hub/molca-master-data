import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";

import { createCallerOrganizationMiddleware } from "./caller-organization.js";

import type { TenantEnv } from "@molca/security";

const PERSON = { sub: "sub-1", azp: "dx-master-data", organization: { a: { id: "org-a" } } };
const USR_SVC = { sub: "svc-1", azp: "dx-user-management-svc" };
const REPORTS_SVC = { sub: "svc-2", azp: "dx-production-reports-svc" };

function appWith(payload: object) {
  const app = new Hono<TenantEnv>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", payload as never);
    await next();
  });
  app.use("*", createCallerOrganizationMiddleware());
  app.on(["GET", "POST"], "/who", (c) => c.json({ tenant: c.get("organization").id }));
  return app;
}

describe("caller organization (E-2, contract §0b)", () => {
  it("a person works in the organization of the token; the tenant header is ignored", async () => {
    const res = await appWith(PERSON).request("/who", { headers: { "x-tenant-id": "org-b" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenant: "org-a" });
  });

  it("USR's service client reads the tenant it names", async () => {
    const res = await appWith(USR_SVC).request("/who", { headers: { "x-tenant-id": "org-b" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenant: "org-b" });
  });

  it("Production Reports' service client reads the tenant it names", async () => {
    const res = await appWith(REPORTS_SVC).request("/who", {
      headers: { "x-tenant-id": "org-b" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenant: "org-b" });
  });

  it("refuses the reports client's write and a missing header, like USR's", async () => {
    const noHeader = await appWith(REPORTS_SVC).request("/who");
    expect(noHeader.status).toBe(403);
    const write = await appWith(REPORTS_SVC).request("/who", {
      method: "POST",
      headers: { "x-tenant-id": "org-b" },
    });
    expect(write.status).toBe(403);
  });

  it("refuses USR's service client without the header", async () => {
    const res = await appWith(USR_SVC).request("/who");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no organization" });
  });

  it("refuses a write by USR's service client", async () => {
    const res = await appWith(USR_SVC).request("/who", {
      method: "POST",
      headers: { "x-tenant-id": "org-b" },
    });
    expect(res.status).toBe(403);
  });

  it("refuses any other client without an organization, header or not", async () => {
    for (const azp of ["dx-platform-svc", "dx-master-data-svc", undefined]) {
      const res = await appWith({ sub: "x", azp }).request("/who", {
        headers: { "x-tenant-id": "org-b" },
      });
      expect(res.status).toBe(403);
    }
  });
});
