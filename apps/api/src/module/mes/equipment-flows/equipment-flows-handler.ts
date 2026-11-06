import { Hono } from "hono";

import { equipmentFlowsValidator } from "./equipment-flows-dto.js";
import { WebResponse } from "@molca/network";

import type { EquipmentFlows } from "./equipment-flows.js";
import type { TEquipmentFlowsService } from "./equipment-flows-service.js";

type EquipmentFlowsHandlerDeps = {
  equipmentFlowsService: TEquipmentFlowsService;
};

function createEquipmentFlowsHandler({ equipmentFlowsService }: EquipmentFlowsHandlerDeps) {
  const app = new Hono();

  app.get("/", equipmentFlowsValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await equipmentFlowsService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<EquipmentFlows[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", equipmentFlowsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await equipmentFlowsService.create(input);
    return c.json(WebResponse.builder<EquipmentFlows>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await equipmentFlowsService.get(id);
    return c.json(WebResponse.builder<EquipmentFlows>().data(row).build(), 200);
  });

  app.put("/:id", equipmentFlowsValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await equipmentFlowsService.update(id, patch);
    return c.json(WebResponse.builder<EquipmentFlows>().data(updated).build(), 200);
  });

  // Never deleted (F-00, F-14 has no `delete` action) — deactivation sets valid_to.
  app.post("/:id/deactivate", async (c) => {
    const row = await equipmentFlowsService.deactivate(c.req.param("id"));
    return c.json(WebResponse.builder<EquipmentFlows>().data(row).build(), 200);
  });

  return app;
}

export { createEquipmentFlowsHandler };
export type { EquipmentFlowsHandlerDeps };
