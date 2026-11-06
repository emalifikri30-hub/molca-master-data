import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { refusal } from "../../shared/errors/refusal.js";

import type { Context } from "hono";
import type { PlatformEnv } from "./platform-gate.js";
import type { PlatformWriteContext } from "./platform-tenants.js";
import type { TPlatformTenantsService } from "./platform-tenants-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().trim().min(1);

const findSchema = z.object({ code: z.string().optional(), name: z.string().optional() });

const createSchema = z.object({
  tenantId: text,
  tenantCode: text,
  tenantName: text,
  validFrom: date,
});

// tenantCode is read only to refuse it: the code is frozen (TNT-009).
const renameSchema = z.object({
  tenantName: text,
  reason: z.string().optional(),
  tenantCode: z.unknown().optional(),
});

// The reason is checked by the service, so a missing one is `reason_required`, not a 400.
const validToSchema = z.object({ validTo: date.nullable(), reason: z.string().optional() });

/** Headers travel URI-encoded so any name fits (same as `x-audit-reason`). */
function decoded(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Who a write is for (TNT-G7): `X-On-Behalf-Of` (the superadmin's `sub`) and
 * `X-On-Behalf-Of-Name` (URI-encoded). Every platform write carries them; one
 * without is refused before anything is written.
 */
function writeContext(c: Context<PlatformEnv>, reason: string | undefined): PlatformWriteContext {
  const subjectId = decoded(c.req.header("x-on-behalf-of"));
  if (!subjectId) throw refusal(422, "on_behalf_of_required");
  const displayName = decoded(c.req.header("x-on-behalf-of-name")) || subjectId;
  return { caller: c.get("caller"), onBehalfOf: { subjectId, displayName }, reason: reason ?? "" };
}

type PlatformTenantsHandlerDeps = { platformTenantsService: TPlatformTenantsService };

/**
 * `/api/v1/platform/tenants` (dx-platform cross-repo contract §1). Reached only
 * through the platform gate: a `dx-platform-svc` token, no organization.
 *
 * - M-1 `GET /` every tenant, inactive ones included
 * - M-3 `GET /?code=` / `?name=` the matching tenant as a list of zero or one
 * - M-2 `GET /:tenantId`
 * - M-4 `POST /`
 * - M-5 `PATCH /:tenantId` rename
 * - M-6 `PUT /:tenantId/valid-to`
 */
function createPlatformTenantsHandler({ platformTenantsService }: PlatformTenantsHandlerDeps) {
  const app = new Hono<PlatformEnv>();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  app.get("/", queryValidator(findSchema), async (c) => {
    const { code, name } = c.req.valid("query");
    if (code !== undefined && name !== undefined) throw refusal(400, "one_filter_only");
    if (code !== undefined) {
      const row = await platformTenantsService.findByCode(code);
      return c.json(ok(row ? [row] : []), 200);
    }
    if (name !== undefined) {
      const row = await platformTenantsService.findByName(name);
      return c.json(ok(row ? [row] : []), 200);
    }
    return c.json(ok(await platformTenantsService.list()), 200);
  });

  app.get("/:tenantId", async (c) =>
    c.json(ok(await platformTenantsService.get(c.req.param("tenantId"))), 200),
  );

  app.post("/", jsonValidator(createSchema), async (c) => {
    const ctx = writeContext(c, undefined);
    return c.json(ok(await platformTenantsService.create(c.req.valid("json"), ctx)), 201);
  });

  app.patch("/:tenantId", jsonValidator(renameSchema), async (c) => {
    const body = c.req.valid("json");
    if (body.tenantCode !== undefined) throw refusal(422, "code_frozen");
    const ctx = writeContext(c, body.reason);
    const row = await platformTenantsService.rename(c.req.param("tenantId"), body.tenantName, ctx);
    return c.json(ok(row), 200);
  });

  app.put("/:tenantId/valid-to", jsonValidator(validToSchema), async (c) => {
    const body = c.req.valid("json");
    const ctx = writeContext(c, body.reason);
    const row = await platformTenantsService.setValidTo(c.req.param("tenantId"), body.validTo, ctx);
    return c.json(ok(row), 200);
  });

  return app;
}

export { createPlatformTenantsHandler };
