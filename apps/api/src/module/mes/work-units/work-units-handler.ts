import { Hono } from "hono";

import { workUnitsValidator } from "./work-units-dto.js";
import { WebResponse } from "@molca/network";

import type { WorkUnits } from "./work-units.js";
import type { TWorkUnitsService } from "./work-units-service.js";

type WorkUnitsHandlerDeps = {
  workUnitsService: TWorkUnitsService;
};

function createWorkUnitsHandler({ workUnitsService }: WorkUnitsHandlerDeps) {
  const app = new Hono();

  app.get("/", workUnitsValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await workUnitsService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<WorkUnits[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", workUnitsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await workUnitsService.create(input);
    return c.json(WebResponse.builder<WorkUnits>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await workUnitsService.get(id);
    return c.json(WebResponse.builder<WorkUnits>().data(row).build(), 200);
  });

  app.put("/:id", workUnitsValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await workUnitsService.update(id, patch);
    return c.json(WebResponse.builder<WorkUnits>().data(updated).build(), 200);
  });

  return app;
}

export { createWorkUnitsHandler };
export type { WorkUnitsHandlerDeps };
