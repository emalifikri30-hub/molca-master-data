import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { PERIOD_PATTERNS } from "./fiscal-years.js";

import type { PeriodPattern } from "./fiscal-years.js";
import type { TFiscalYearsService } from "./fiscal-years-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// FYR-001 rules 2/3: month fields only in monthly mode, pattern only in weekly.
const declareSchema = z.discriminatedUnion("calendarBasis", [
  z.object({
    enterpriseId: z.string().min(1),
    label: z.string().min(1).max(20),
    calendarBasis: z.literal("monthly"),
    startMonth: z.number().int().min(1).max(12),
    endMonth: z.number().int().min(1).max(12),
    startDate: date,
    endDate: date,
  }),
  z.object({
    enterpriseId: z.string().min(1),
    label: z.string().min(1).max(20),
    calendarBasis: z.literal("weekly_iso"),
    periodPattern: z.enum(PERIOD_PATTERNS as [PeriodPattern, ...PeriodPattern[]]),
    startDate: date,
    endDate: date,
  }),
]);

const amendSchema = z.intersection(declareSchema, z.object({ effectiveDate: date }));

type FiscalYearsHandlerDeps = { fiscalYearsService: TFiscalYearsService };

function createFiscalYearsHandler({ fiscalYearsService }: FiscalYearsHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  // UX-SIT-6 (PO, 2026-10-19): one enterprise's years when `enterpriseId` is given.
  const scope = z.object({ enterpriseId: z.string().optional() });
  app.get("/", queryValidator(scope), async (c) =>
    c.json(ok(await fiscalYearsService.current(c.req.valid("query").enterpriseId)), 200),
  );
  app.get("/versions", queryValidator(scope), async (c) =>
    c.json(ok(await fiscalYearsService.versions(c.req.valid("query").enterpriseId)), 200),
  );
  app.get("/resolve", queryValidator(scope.extend({ date })), async (c) => {
    const { date: businessDate, enterpriseId } = c.req.valid("query");
    return c.json(ok(await fiscalYearsService.resolve(businessDate, enterpriseId)), 200);
  });
  app.post("/", jsonValidator(declareSchema), async (c) =>
    c.json(ok(await fiscalYearsService.declare(c.req.valid("json"))), 201),
  );
  app.post("/:id/impact", jsonValidator(declareSchema), async (c) =>
    c.json(ok(await fiscalYearsService.impact(c.req.param("id"), c.req.valid("json"))), 200),
  );
  app.post("/:id/amend", jsonValidator(amendSchema), async (c) =>
    c.json(ok(await fiscalYearsService.amend(c.req.param("id"), c.req.valid("json"))), 200),
  );

  return app;
}

export { createFiscalYearsHandler };
