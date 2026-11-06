import { Hono } from "hono";

import { workUnitKpiBindingsValidator } from "./work-unit-kpi-bindings-dto.js";
import { WebResponse } from "@molca/network";

import type { WorkUnitKpiBinding } from "./work-unit-kpi-bindings.js";
import type { TWorkUnitKpiBindingsService } from "./work-unit-kpi-bindings-service.js";

type WorkUnitKpiBindingsHandlerDeps = {
  workUnitKpiBindingsService: TWorkUnitKpiBindingsService;
};

function createWorkUnitKpiBindingsHandler({
  workUnitKpiBindingsService,
}: WorkUnitKpiBindingsHandlerDeps) {
  const app = new Hono();

  app.get("/", workUnitKpiBindingsValidator.list, async (c) => {
    const { page, size, workUnitId, slotId } = c.req.valid("query");
    const { items, meta } = await workUnitKpiBindingsService.getPaged(page, size, {
      workUnitId,
      slotId,
    });
    return c.json(WebResponse.builder<WorkUnitKpiBinding[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", workUnitKpiBindingsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await workUnitKpiBindingsService.create(input);
    return c.json(WebResponse.builder<WorkUnitKpiBinding>().data(created).build(), 201);
  });

  // PO 2026-11-04 (answer 6): all-or-nothing save of several rows in one request.
  app.post("/batch", workUnitKpiBindingsValidator.batch, async (c) => {
    const input = c.req.valid("json");
    const created = await workUnitKpiBindingsService.createBatch(input);
    return c.json(WebResponse.builder<WorkUnitKpiBinding[]>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await workUnitKpiBindingsService.get(id);
    return c.json(WebResponse.builder<WorkUnitKpiBinding>().data(row).build(), 200);
  });

  app.put("/:id", workUnitKpiBindingsValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await workUnitKpiBindingsService.update(id, patch);
    return c.json(WebResponse.builder<WorkUnitKpiBinding>().data(updated).build(), 200);
  });

  // No DELETE: bindings are deactivated (closed), never hard-deleted.

  return app;
}

export { createWorkUnitKpiBindingsHandler };
export type { WorkUnitKpiBindingsHandlerDeps };
