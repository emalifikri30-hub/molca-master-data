import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";

import { transactionMiddleware } from "./transaction-middleware.js";

import type { Transact } from "./transaction.js";

/** Records begin/commit/rollback like a real transaction would. */
function recordingTransact() {
  const log: string[] = [];
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
  return { transact, log };
}

function appWith(transact: Transact) {
  const app = new Hono();
  app.use("*", transactionMiddleware(transact));
  app.get("/rows", (c) => c.json({ ok: true }));
  app.post("/rows", (c) => c.json({ ok: true }, 201));
  app.post("/refused", () => {
    throw new HTTPException(422, { message: "REFUSAL:{}" });
  });
  app.post("/manual-409", (c) => c.json({ error: "taken" }, 409));
  app.post("/crash", () => {
    throw new Error("boom");
  });
  app.onError((err, c) =>
    c.json({ error: err.message }, err instanceof HTTPException ? err.status : 500),
  );
  return app;
}

describe("transactionMiddleware", () => {
  it("does not open a transaction for reads", async () => {
    const { transact, log } = recordingTransact();
    const res = await appWith(transact).request("/rows");
    expect(res.status).toBe(200);
    expect(log).toEqual([]);
  });

  it("commits a successful write", async () => {
    const { transact, log } = recordingTransact();
    const res = await appWith(transact).request("/rows", { method: "POST" });
    expect(res.status).toBe(201);
    expect(log).toEqual(["begin", "commit"]);
  });

  it("rolls back a refusal and still sends the refusal", async () => {
    const { transact, log } = recordingTransact();
    const res = await appWith(transact).request("/refused", { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "REFUSAL:{}" });
    expect(log).toEqual(["begin", "rollback"]);
  });

  it("rolls back a 4xx a handler returns without throwing", async () => {
    const { transact, log } = recordingTransact();
    const res = await appWith(transact).request("/manual-409", { method: "POST" });
    expect(res.status).toBe(409);
    expect(log).toEqual(["begin", "rollback"]);
  });

  it("rolls back when onError lives on the root app, as in cmd/api/app.ts", async () => {
    const { transact, log } = recordingTransact();
    const api = new Hono().basePath("/api/v1");
    api.use("*", transactionMiddleware(transact));
    api.post("/rows", () => {
      throw new HTTPException(409, { message: "REFUSAL:{}" });
    });
    const root = new Hono();
    root.route("/", api);
    root.onError((err, c) => c.json({ error: err.message }, 409));
    const res = await root.request("/api/v1/rows", { method: "POST" });
    expect(res.status).toBe(409);
    expect(log).toEqual(["begin", "rollback"]);
  });

  it("rolls back a crash and still sends the 500", async () => {
    const { transact, log } = recordingTransact();
    const res = await appWith(transact).request("/crash", { method: "POST" });
    expect(res.status).toBe(500);
    expect(log).toEqual(["begin", "rollback"]);
  });
});
