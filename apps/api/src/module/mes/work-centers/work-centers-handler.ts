import { Hono } from "hono";

import { workCentersValidator } from "./work-centers-dto.js";
import { WebResponse } from "@molca/network";

import type { WorkCenters } from "./work-centers.js";
import type { TWorkCentersService } from "./work-centers-service.js";

type WorkCentersHandlerDeps = {
  workCentersService: TWorkCentersService;
};

function createWorkCentersHandler({ workCentersService }: WorkCentersHandlerDeps) {
  const app = new Hono();

  app.get("/", workCentersValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await workCentersService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<WorkCenters[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", workCentersValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await workCentersService.create(input);
    return c.json(WebResponse.builder<WorkCenters>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await workCentersService.get(id);
    return c.json(WebResponse.builder<WorkCenters>().data(row).build(), 200);
  });

  app.put("/:id", workCentersValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await workCentersService.update(id, patch);
    return c.json(WebResponse.builder<WorkCenters>().data(updated).build(), 200);
  });

  return app;
}

export { createWorkCentersHandler };
export type { WorkCentersHandlerDeps };
