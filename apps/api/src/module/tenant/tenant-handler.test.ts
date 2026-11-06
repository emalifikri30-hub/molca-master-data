import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";

import { createTenantHandler } from "./tenant-handler.js";

describe("GET /api/v1/tenant", () => {
  it("returns the current tenant as id, code and name", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set(
        "tenant" as never,
        { tenantId: "org-a", tenantCode: "A", tenantName: "Molca A" } as never,
      );
      await next();
    });
    app.route("/tenant", createTenantHandler());
    const res = await app.request("/tenant");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "org-a", code: "A", name: "Molca A" });
  });
});
