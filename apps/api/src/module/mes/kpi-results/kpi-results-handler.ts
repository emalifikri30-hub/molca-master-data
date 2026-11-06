import * as z from "zod";
import { Hono } from "hono";

import { queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { KpiResult } from "./kpi-results.js";
import type { TKpiResultsService } from "./kpi-results-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  level: z.enum(["work_unit", "work_center", "area", "site", "work_order"]),
  shiftInstanceId: z.string().optional(),
  from: date.optional(),
  to: date.optional(),
  siteId: z.string().optional(),
  workOrderId: z.string().optional(),
});

type KpiResultsHandlerDeps = { kpiResultsService: TKpiResultsService };

/** `/kpi-results` — read-only KPI_RESULT for the Production apps (PRD-004 MON-001, PRF-001…003). */
function createKpiResultsHandler({ kpiResultsService }: KpiResultsHandlerDeps) {
  const app = new Hono();
  app.get("/", queryValidator(querySchema), async (c) => {
    const rows = await kpiResultsService.results(c.req.valid("query"));
    return c.json(WebResponse.builder<KpiResult[]>().data(rows).build(), 200);
  });
  app.get(
    "/running-product",
    queryValidator(z.object({ workUnitId: z.string().min(1) })),
    async (c) =>
      c.json(
        WebResponse.builder()
          .data(await kpiResultsService.runningProduct(c.req.valid("query").workUnitId))
          .build(),
        200,
      ),
  );
  return app;
}

export { createKpiResultsHandler };
