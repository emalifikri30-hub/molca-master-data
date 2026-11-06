import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";

import { createOrganizationMiddleware } from "@molca/security";
import { currentBearer, currentTenantId } from "./tenant-context.js";
import { createTenantMiddleware, todayIn, type TenantRequestEnv } from "./tenant-middleware.js";

import type { FindTenant } from "./tenant-store.js";

const ZONE = "Asia/Jakarta";
const today = () => todayIn(ZONE, new Date());

/** A session whose token names one Keycloak organization, the way the login token does. */
function appWith(findTenant: FindTenant, now?: () => Date) {
  const app = new Hono<TenantRequestEnv>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", {
      sub: "sub-1",
      organization: { "molca-a": { id: "org-a", name: "Molca A" } },
    } as never);
    await next();
  });
  app.use("*", createOrganizationMiddleware());
  app.use("*", createTenantMiddleware({ findTenant, timeZone: ZONE, now }));
  app.get("/who", (c) =>
    c.json({
      inTenant: currentTenantId(),
      tenantCode: c.get("tenant").tenantCode,
      bearer: currentBearer(),
    }),
  );
  return app;
}

describe("tenant middleware (F-00 rule 6, E-2)", () => {
  it("refuses an organization with no active tenant (F-00 rule 6)", async () => {
    const res = await appWith(async () => undefined).request("/who");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "no active tenant" });
  });

  it("looks the tenant up on today's date, so a tenant past its valid_to is refused", async () => {
    const asked: Array<[string, string]> = [];
    const findTenant: FindTenant = async (tenantId, day) => {
      asked.push([tenantId, day]);
      return undefined;
    };
    const res = await appWith(findTenant).request("/who");
    expect(res.status).toBe(403);
    expect(asked).toEqual([["org-a", today()]]);
  });

  it("runs the handler inside the organization's tenant (F-00 rule 6)", async () => {
    const findTenant: FindTenant = async (tenantId) => ({
      tenantId,
      tenantCode: "A",
      tenantName: "Molca A",
    });
    const res = await appWith(findTenant).request("/who", {
      headers: { Authorization: "Bearer tok-a" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inTenant: "org-a", tenantCode: "A", bearer: "tok-a" });
  });

  it("decides 'today' in the install's time zone, not UTC (TNT-G8 b)", async () => {
    const asked: string[] = [];
    const findTenant: FindTenant = async (_tenantId, day) => {
      asked.push(day);
      return undefined;
    };
    // 31 Dec 17:30 UTC is already 1 Jan 00:30 in Jakarta (UTC+7): a tenant whose last
    // day was 31 Dec (valid_to 1 Jan) has closed there.
    await appWith(findTenant, () => new Date("2026-12-31T17:30:00Z")).request("/who");
    // 31 Dec 16:59 UTC is 23:59 in Jakarta: still 31 Dec.
    await appWith(findTenant, () => new Date("2026-12-31T16:59:00Z")).request("/who");
    expect(asked).toEqual(["2027-01-01", "2026-12-31"]);
  });
});

describe("todayIn", () => {
  it("formats the local date of the zone as YYYY-MM-DD", () => {
    const at = new Date("2026-10-12T20:00:00Z");
    expect(todayIn("UTC", at)).toBe("2026-10-12");
    expect(todayIn("Asia/Jakarta", at)).toBe("2026-10-13");
    expect(todayIn("America/New_York", at)).toBe("2026-10-12");
  });
});
