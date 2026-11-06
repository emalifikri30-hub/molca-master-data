import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { TShiftsService } from "./shifts-service.js";

const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type ShiftsHandlerDeps = { shiftsService: TShiftsService };

/** `/shifts/enterprise`, `/shifts/site`, `/shifts/instances` (PRD-003 SHF-001/002). */
function createShiftsHandler({ shiftsService }: ShiftsHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  // UX-SIT-6 (PO, 2026-10-19): shifts belong to one enterprise. Without
  // `enterpriseId` the list holds every enterprise's (Production readers).
  app.get(
    "/enterprise",
    queryValidator(z.object({ enterpriseId: z.string().optional() })),
    async (c) =>
      c.json(ok(await shiftsService.listEnterprise(c.req.valid("query").enterpriseId)), 200),
  );
  app.post(
    "/enterprise",
    jsonValidator(z.object({ enterpriseId: z.string().min(1), label: z.string().min(1) })),
    async (c) => {
      const { enterpriseId, label } = c.req.valid("json");
      return c.json(ok(await shiftsService.createEnterprise(enterpriseId, label)), 201);
    },
  );
  app.put("/enterprise/:id", jsonValidator(z.object({ label: z.string().min(1) })), async (c) =>
    c.json(
      ok(await shiftsService.updateEnterprise(c.req.param("id"), c.req.valid("json").label)),
      200,
    ),
  );
  app.post("/enterprise/:id/retire", async (c) =>
    c.json(ok(await shiftsService.retireEnterprise(c.req.param("id"))), 200),
  );

  app.get("/site", async (c) => c.json(ok(await shiftsService.listSite()), 200));
  app.post(
    "/site",
    jsonValidator(
      z.object({
        enterpriseShiftId: z.string().min(1),
        siteId: z.string().min(1),
        startTime: time,
        endTime: time,
      }),
    ),
    async (c) => c.json(ok(await shiftsService.declareSite(c.req.valid("json"))), 201),
  );

  app.get("/instances", queryValidator(z.object({ siteId: z.string().optional() })), async (c) =>
    c.json(ok(await shiftsService.listInstances(c.req.valid("query").siteId)), 200),
  );
  app.post(
    "/instances/generate",
    jsonValidator(z.object({ siteId: z.string().min(1), from: date, to: date })),
    async (c) => {
      const { siteId, from, to } = c.req.valid("json");
      return c.json(ok(await shiftsService.generate(siteId, from, to)), 200);
    },
  );

  return app;
}

export { createShiftsHandler };
