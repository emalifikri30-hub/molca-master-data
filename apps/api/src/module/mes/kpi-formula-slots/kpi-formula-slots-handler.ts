import { Hono } from "hono";

import { kpiFormulaSlotsValidator } from "./kpi-formula-slots-dto.js";
import { WebResponse } from "@molca/network";

import type { KpiFormulaSlot } from "./kpi-formula-slots.js";
import type { TKpiFormulaSlotsService } from "./kpi-formula-slots-service.js";

type KpiFormulaSlotsHandlerDeps = {
  kpiFormulaSlotsService: TKpiFormulaSlotsService;
};

function createKpiFormulaSlotsHandler({ kpiFormulaSlotsService }: KpiFormulaSlotsHandlerDeps) {
  const app = new Hono();

  app.get("/", kpiFormulaSlotsValidator.list, async (c) => {
    const { page, size, metric, bindable } = c.req.valid("query");
    const { items, meta } = await kpiFormulaSlotsService.getPaged(page, size, { metric, bindable });
    return c.json(WebResponse.builder<KpiFormulaSlot[]>().data(items).meta(meta).build(), 200);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await kpiFormulaSlotsService.get(id);
    return c.json(WebResponse.builder<KpiFormulaSlot>().data(row).build(), 200);
  });

  return app;
}

export { createKpiFormulaSlotsHandler };
export type { KpiFormulaSlotsHandlerDeps };
