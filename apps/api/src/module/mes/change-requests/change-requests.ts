import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import { desc, eq } from "drizzle-orm";
import { ulid } from "ulidx";
import * as z from "zod";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { changeRequestTable } from "../../../shared/database/schema/schema.js";
import { APPROVER_ROLES, sensitive } from "./change-rules.js";

import type { AwilixContainer } from "awilix";
import type { EntityRepository } from "../../../shared/database/entity-repository.js";

// Change control for Master Data (PRD Workflow & approval): a sensitive request is not run but kept as a change
// request (202); a second person approves it and the original request is replayed as them, through the same
// routes, validation and audit as any change. Rejected or withdrawn requests never touch the data.

type ChangeRequest = {
  id: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  action: string;
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "failed";
  makerId: string;
  makerName: string;
  decidedBy: string | null;
  decidedByName: string;
  decisionNote: string;
  decidedAt: string | null;
  createdAt?: string;
};

const KEYS = [
  "id",
  "entity",
  "entityId",
  "entityLabel",
  "action",
  "method",
  "path",
  "body",
  "reason",
  "status",
  "makerId",
  "makerName",
  "decidedBy",
  "decidedByName",
  "decisionNote",
  "decidedAt",
  "createdAt",
];

type Jwt = {
  sub?: string;
  name?: string;
  preferred_username?: string;
  resource_access?: Record<string, { roles?: string[] }>;
};
const who = (jwt: Jwt | undefined) => ({
  id: jwt?.sub ?? "",
  name: jwt?.name ?? jwt?.preferred_username ?? "",
  roles: jwt?.resource_access?.["dx-maintenance"]?.roles ?? [],
});
const decode = (raw: string | undefined) => {
  try {
    return raw ? decodeURIComponent(raw) : "";
  } catch {
    return raw ?? "";
  }
};

/** One-time tokens that let the approved replay of a change pass the change control (process-local). */
const REPLAY = new Map<string, string>();

function mountChangeRequests(api: Hono, container: AwilixContainer) {
  const deps: DbDeps = { db: container.resolve("db"), region: container.resolve("region") };
  const repo = (): EntityRepository<ChangeRequest> => {
    const r = openRepo<ChangeRequest>(deps, changeRequestTable, KEYS);
    if (!r) throw new HTTPException(503, { message: "database unavailable" });
    return r;
  };

  // the control itself: in front of every route
  api.use(
    "*",
    createMiddleware(async (c, next) => {
      if (c.req.method !== "POST" && c.req.method !== "PUT") return next();
      const token = c.req.header("x-change-replay");
      if (token && REPLAY.has(token)) {
        REPLAY.delete(token);
        return next();
      }
      const body = (await c.req.raw
        .clone()
        .json()
        .catch(() => null)) as Record<string, unknown> | null;
      const hit = sensitive(c.req.method, new URL(c.req.url).pathname, body);
      if (!hit) return next();
      const me = who(c.get("jwtPayload" as never) as Jwt);
      const reason = decode(c.req.header("x-audit-reason"));
      if (!reason.trim()) return c.json({ data: null, error: "reason_required" }, 422);
      const row = await repo().insert({
        id: ulid(),
        ...hit,
        entityLabel: String(body?.assetTag ?? body?.code ?? body?.label ?? ""),
        method: c.req.method,
        path: new URL(c.req.url).pathname.replace(/^\/api\/v1/, ""),
        body,
        reason,
        status: "pending",
        makerId: me.id,
        makerName: me.name,
        decidedBy: null,
        decidedByName: "",
        decisionNote: "",
        decidedAt: null,
      } as ChangeRequest);
      // 202: accepted for approval, nothing changed yet
      return c.json({ data: { pendingApproval: true, changeRequest: row }, error: null }, 202);
    }),
  );

  const app = new Hono();
  app.get("/", async (c) => {
    const status = c.req.query("status");
    const rows = (
      await repo().list(status ? eq(changeRequestTable.status, status) : undefined)
    ).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return c.json(WebResponse.builder<ChangeRequest[]>().data(rows.slice(0, 300)).build(), 200);
  });

  app.post(
    "/:id/decision",
    jsonValidator(
      z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() }),
    ),
    async (c) => {
      const { decision, note } = c.req.valid("json");
      const me = who(c.get("jwtPayload" as never) as Jwt);
      const cr = await repo().get(c.req.param("id"));
      if (!cr) throw new HTTPException(404, { message: "change request not found" });
      if (cr.status !== "pending")
        throw new HTTPException(409, { message: `this change is already ${cr.status}` });
      if (cr.makerId === me.id)
        throw new HTTPException(403, {
          message: "you made this: someone else approves it (maker ≠ checker)",
        });
      if (!me.roles.some((r) => APPROVER_ROLES.includes(r)))
        throw new HTTPException(403, {
          message: "Master Data changes are approved by the maintenance manager or the plant admin",
        });
      if (decision === "reject" && !note?.trim())
        throw new HTTPException(400, { message: "a rejection needs a reason" });
      const decided = {
        decidedBy: me.id,
        decidedByName: me.name,
        decisionNote: note?.trim() ?? "",
        decidedAt: new Date().toISOString(),
      };
      if (decision === "reject") {
        const row = await repo().update(cr.id, { ...decided, status: "rejected" });
        return c.json(WebResponse.builder<ChangeRequest>().data(row!).build(), 200);
      }
      // replay the original request as the approver, through the same routes (validation, audit, rules)
      const token = ulid();
      REPLAY.set(token, cr.id);
      const res = await api.request(`/api/v1${cr.path}`, {
        method: cr.method,
        headers: {
          authorization: c.req.header("authorization") ?? "",
          "content-type": "application/json",
          "x-audit-reason": encodeURIComponent(`Disetujui (${cr.id.slice(-6)}): ${cr.reason}`),
          "x-change-replay": token,
        },
        body: cr.body ? JSON.stringify(cr.body) : "{}",
      });
      REPLAY.delete(token);
      if (!res.ok) {
        const msg =
          ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
          `HTTP ${res.status}`;
        const row = await repo().update(cr.id, {
          ...decided,
          status: "failed",
          decisionNote: `${decided.decisionNote} [${msg}]`.trim(),
        });
        return c.json(WebResponse.builder<ChangeRequest>().data(row!).build(), 200);
      }
      const row = await repo().update(cr.id, { ...decided, status: "approved" });
      return c.json(WebResponse.builder<ChangeRequest>().data(row!).build(), 200);
    },
  );

  app.post("/:id/withdraw", async (c) => {
    const me = who(c.get("jwtPayload" as never) as Jwt);
    const cr = await repo().get(c.req.param("id"));
    if (!cr) throw new HTTPException(404, { message: "change request not found" });
    if (cr.makerId !== me.id)
      throw new HTTPException(403, { message: "only its maker withdraws a change" });
    if (cr.status !== "pending")
      throw new HTTPException(409, { message: `this change is already ${cr.status}` });
    const row = await repo().update(cr.id, {
      status: "withdrawn",
      decidedAt: new Date().toISOString(),
    });
    return c.json(WebResponse.builder<ChangeRequest>().data(row!).build(), 200);
  });

  api.route("/change-requests", app);
}

export { mountChangeRequests };
export type { ChangeRequest };
