import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { AuthEnv } from "@molca/mes";
import type { AuditLog } from "./audit-log.js";
import type { TAuditLogService } from "./audit-log-service.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const filterSchema = z.object({
  from: day.optional(),
  to: day.optional(),
  domainCode: z.string().optional(),
  moduleCode: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  source: z.string().optional(),
  siteId: z.string().optional(),
  person: z.string().optional(),
});

const downloadSchema = z.object({
  filter: filterSchema,
  /** Modules the reader may download (AUD-004); only their rows go in the file. */
  modules: z.array(z.string()),
  fileName: z.string().min(1).max(200),
});

const historySchema = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) });

type AuditLogHandlerDeps = { auditLogService: TAuditLogService };

/**
 * Read only, plus the download. There is no route to write or change a row:
 * the system writes them with each save (F-14 §9.2, AUD-001 rule 6).
 */
function createAuditLogHandler({ auditLogService }: AuditLogHandlerDeps) {
  const app = new Hono<AuthEnv>();

  app.get("/", queryValidator(filterSchema), async (c) => {
    const rows = await auditLogService.list(c.req.valid("query"));
    return c.json(WebResponse.builder<AuditLog[]>().data(rows).build(), 200);
  });

  app.get("/history", queryValidator(historySchema), async (c) => {
    const { entityType, entityId } = c.req.valid("query");
    const rows = await auditLogService.history(entityType, entityId);
    return c.json(WebResponse.builder<AuditLog[]>().data(rows).build(), 200);
  });

  app.get("/started", async (c) => {
    const startedAt = await auditLogService.startedAt();
    return c.json(
      WebResponse.builder<{ startedAt: string | null }>().data({ startedAt }).build(),
      200,
    );
  });

  // AUD-004: returns the file's rows and records the download in one transaction.
  app.post("/downloads", jsonValidator(downloadSchema), async (c) => {
    const { filter, modules, fileName } = c.req.valid("json");
    const jwt = c.get("jwtPayload");
    const rows = await auditLogService.download({ ...filter, modules }, fileName, {
      subjectId: jwt?.sub ?? "",
      displayName: jwt?.name ?? jwt?.preferred_username ?? jwt?.email ?? jwt?.sub ?? "",
    });
    return c.json(WebResponse.builder<AuditLog[]>().data(rows).build(), 200);
  });

  return app;
}

export { createAuditLogHandler };
