import { Hono } from "hono";

import { areasValidator } from "./areas-dto.js";
import { WebResponse } from "@molca/network";

import type { Areas } from "./areas.js";
import type { TAreasService } from "./areas-service.js";

type AreasHandlerDeps = {
  areasService: TAreasService;
};

function createAreasHandler({ areasService }: AreasHandlerDeps) {
  const app = new Hono();

  app.get("/", areasValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await areasService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<Areas[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", areasValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await areasService.create(input);
    return c.json(WebResponse.builder<Areas>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await areasService.get(id);
    return c.json(WebResponse.builder<Areas>().data(row).build(), 200);
  });

  app.put("/:id", areasValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await areasService.update(id, patch);
    return c.json(WebResponse.builder<Areas>().data(updated).build(), 200);
  });

  return app;
}

export { createAreasHandler };
export type { AreasHandlerDeps };
