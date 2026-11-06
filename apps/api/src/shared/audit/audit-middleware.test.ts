import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";

import { reasonRequired } from "../../module/mes/audit-log/audit-log-service.js";
import { refusal } from "../errors/refusal.js";
import { transactionMiddleware } from "../database/transaction-middleware.js";
import { captureWrite, declareAuditAction } from "./audit-context.js";
import { auditMiddleware } from "./audit-middleware.js";

import type { AuthEnv } from "@molca/mes";
import type { TAuditLogService } from "../../module/mes/audit-log/audit-log-service.js";
import type { CreateAuditLog } from "../../module/mes/audit-log/audit-log.js";
import type { Transact } from "../database/transaction.js";

function setup() {
  const log: string[] = [];
  const recorded: CreateAuditLog[] = [];
  const transact: Transact = async (work) => {
    log.push("begin");
    try {
      const out = await work();
      log.push("commit");
      return out;
    } catch (err) {
      log.push("rollback");
      throw err;
    }
  };
  // Same reason rule as the real service (AUD-001 rule 5).
  const auditLogService = {
    record: async (row: CreateAuditLog) => {
      if (row.actorType === "user" && reasonRequired(row.action) && !row.reason) {
        throw refusal(422, "reason_required");
      }
      recorded.push(row);
      return { ...row, id: "a" } as never;
    },
  } as unknown as TAuditLogService;

  const api = new Hono<AuthEnv>().basePath("/api/v1");
  api.use("*", async (c, next) => {
    c.set("jwtPayload", { sub: "sub-123", name: "Ani", email: "ani@molca.id" });
    await next();
  });
  api.use("*", transactionMiddleware(transact));
  api.use("*", auditMiddleware(auditLogService));
  api.get("/areas", (c) => c.json({ ok: true }));
  api.post("/areas", (c) => {
    captureWrite({
      table: "area",
      kind: "insert",
      before: null,
      after: { id: "a1", code: "FI-2" },
    });
    return c.json({ ok: true }, 201);
  });
  api.put("/areas/a1", (c) => {
    captureWrite({
      table: "area",
      kind: "update",
      before: { id: "a1", code: "FI-2", name: "Old" },
      after: { id: "a1", code: "FI-2", name: "New" },
    });
    return c.json({ ok: true });
  });
  api.post("/routings/rt/release", (c) => {
    declareAuditAction("ROUTING", "release");
    captureWrite({
      table: "routing",
      kind: "update",
      before: { id: "rt", version: 1, status: "draft" },
      after: { id: "rt", version: 1, status: "released" },
    });
    return c.json({ ok: true });
  });
  api.post("/refused", () => {
    captureWrite({ table: "area", kind: "insert", before: null, after: { id: "a2" } });
    throw new HTTPException(409, { message: "taken" });
  });
  const app = new Hono();
  app.route("/", api);
  app.onError((err, c) =>
    c.json({ error: err.message }, err instanceof HTTPException ? err.status : 500),
  );
  return { app, log, recorded };
}

describe("auditMiddleware", () => {
  it("writes the row in the save's transaction, actor from the token", async () => {
    const { app, log, recorded } = setup();
    const res = await app.request("/api/v1/areas", {
      method: "POST",
      headers: { "x-audit-source": "ui" },
    });
    expect(res.status).toBe(201);
    expect(log).toEqual(["begin", "commit"]);
    expect(recorded).toEqual([
      expect.objectContaining({
        action: "create",
        entityType: "AREA",
        entityId: "a1",
        actorType: "user",
        actorSubjectId: "sub-123",
        actorDisplayName: "Ani",
        source: "ui",
      }),
    ]);
  });

  it("takes the reason from the header, URI-decoded", async () => {
    const { app, recorded } = setup();
    const res = await app.request("/api/v1/areas/a1", {
      method: "PUT",
      headers: { "x-audit-reason": encodeURIComponent("Rename — per PO") },
    });
    expect(res.status).toBe(200);
    expect(recorded[0]).toMatchObject({
      action: "update",
      reason: "Rename — per PO",
      source: "api",
    });
  });

  it("refuses an update with no reason and rolls the save back", async () => {
    const { app, log, recorded } = setup();
    const res = await app.request("/api/v1/areas/a1", { method: "PUT" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'REFUSAL:{"code":"reason_required"}' });
    expect(log).toEqual(["begin", "rollback"]);
    expect(recorded).toEqual([]);
  });

  it("records a declared business action", async () => {
    const { app, recorded } = setup();
    await app.request("/api/v1/routings/rt/release", {
      method: "POST",
      headers: { "x-audit-reason": "go live" },
    });
    expect(recorded[0]).toMatchObject({ action: "release", entityType: "ROUTING" });
  });

  it("writes nothing for a refused save or a read", async () => {
    const { app, recorded } = setup();
    expect((await app.request("/api/v1/refused", { method: "POST" })).status).toBe(409);
    expect((await app.request("/api/v1/areas")).status).toBe(200);
    expect(recorded).toEqual([]);
  });
});
