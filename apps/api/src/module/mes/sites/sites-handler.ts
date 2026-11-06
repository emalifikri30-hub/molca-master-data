import { Hono } from "hono";

import { sitesValidator } from "./sites-dto.js";
import { WebResponse } from "@molca/network";

import type { Sites } from "./sites.js";
import type { TSitesService } from "./sites-service.js";

type SitesHandlerDeps = {
  sitesService: TSitesService;
};

function createSitesHandler({ sitesService }: SitesHandlerDeps) {
  const app = new Hono();

  app.get("/", sitesValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await sitesService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<Sites[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", sitesValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await sitesService.create(input);
    return c.json(WebResponse.builder<Sites>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await sitesService.get(id);
    return c.json(WebResponse.builder<Sites>().data(row).build(), 200);
  });

  app.put("/:id", sitesValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await sitesService.update(id, patch);
    return c.json(WebResponse.builder<Sites>().data(updated).build(), 200);
  });

  return app;
}

export { createSitesHandler };
export type { SitesHandlerDeps };
