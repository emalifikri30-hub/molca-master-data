import { Hono } from "hono";

import { kpiParametersValidator } from "./kpi-parameters-dto.js";
import { WebResponse } from "@molca/network";

import type { KpiParameter } from "./kpi-parameters.js";
import type { TKpiParametersService } from "./kpi-parameters-service.js";

type KpiParametersHandlerDeps = {
  kpiParametersService: TKpiParametersService;
};

/** GET only — the catalog of legal combinations is seeded, never written here. */
function createKpiParametersHandler({ kpiParametersService }: KpiParametersHandlerDeps) {
  const app = new Hono();

  app.get("/", kpiParametersValidator.list, async (c) => {
    const { page, size, slotId, tagRole } = c.req.valid("query");
    const { items, meta } = await kpiParametersService.getPaged(page, size, { slotId, tagRole });
    return c.json(WebResponse.builder<KpiParameter[]>().data(items).meta(meta).build(), 200);
  });

  app.get("/:id", async (c) => {
    const row = await kpiParametersService.get(c.req.param("id"));
    return c.json(WebResponse.builder<KpiParameter>().data(row).build(), 200);
  });

  return app;
}

export { createKpiParametersHandler };
export type { KpiParametersHandlerDeps };
