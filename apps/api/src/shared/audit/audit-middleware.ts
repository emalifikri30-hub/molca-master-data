import { ulid } from "ulidx";

import { runAudited } from "./audit-context.js";
import { buildAuditRows } from "./audit-rows.js";
import { resolveScope } from "./audit-scope.js";

import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "@molca/mes";
import type { TAuditLogService } from "../../module/mes/audit-log/audit-log-service.js";
import type { AuditActor, AuditContext } from "./audit-context.js";
import type { PostgresDB } from "../database/postgres.js";

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

/** The reason travels URI-encoded so any text fits in a header. */
function decodeReason(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Writes the audit rows of a save on the server, in the save's transaction
 * (F-14 §9.2: written by the system only, same transaction, actor from the
 * token). Must run inside `transactionMiddleware`.
 *
 * - The actor is the token's `sub` and display name, never a request field.
 * - The person's reason comes in the `x-audit-reason` header (URI-encoded).
 * - Repositories record each write while the handler runs; the rows are built
 *   from them once it succeeds. A missing reason is refused by the audit
 *   service, which rolls back the whole save: nothing is written.
 */
function auditMiddleware(
  auditLogService: TAuditLogService,
  db?: PostgresDB,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if (READ_ONLY.has(c.req.method)) return next();
    const jwt = c.get("jwtPayload");
    const actor: AuditActor = {
      type: "user",
      subjectId: jwt?.sub ?? "",
      displayName: jwt?.name ?? jwt?.preferred_username ?? jwt?.email ?? jwt?.sub ?? "",
      source: c.req.header("x-audit-source") === "ui" ? "ui" : "api",
    };
    const context: AuditContext = {
      actor,
      reason: decodeReason(c.req.header("x-audit-reason")),
      writes: [],
      actions: new Map(),
    };
    await runAudited(context, () => next());
    if (c.error || c.res.status >= 400) return;
    const transactionId = ulid();
    for (const row of buildAuditRows(context, transactionId)) {
      // F-14 §9.1: the scope snapshot, resolved inside the save's transaction.
      const scope = db ? await resolveScope(db, row.scope ?? null) : null;
      // Throws a 422 `reason_required` refusal when a person's change has no
      // reason; the transaction middleware then rolls the save back.
      await auditLogService.record(
        scope ? { ...row, ...scope, siteId: scope.siteId ?? row.siteId } : row,
      );
    }
  };
}

export { auditMiddleware };
