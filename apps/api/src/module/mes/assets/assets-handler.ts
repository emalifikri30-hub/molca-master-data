import { Hono } from "hono";

import { assetsValidator } from "./assets-dto.js";
import { WebResponse } from "@molca/network";

import type { Assets } from "./assets.js";
import type { TAssetsService } from "./assets-service.js";

type AssetsHandlerDeps = {
  assetsService: TAssetsService;
};

function createAssetsHandler({ assetsService }: AssetsHandlerDeps) {
  const app = new Hono();

  app.get("/", assetsValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await assetsService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<Assets[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", assetsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetsService.create(input);
    return c.json(WebResponse.builder<Assets>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetsService.get(id);
    return c.json(WebResponse.builder<Assets>().data(row).build(), 200);
  });

  app.put("/:id", assetsValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await assetsService.update(id, patch);
    return c.json(WebResponse.builder<Assets>().data(updated).build(), 200);
  });

  // No DELETE: assets are never deleted — setting lifecycleStatus to
  // "decommissioned" (PUT) closes the record with validTo (US-FND-AST-002 rule 5).

  return app;
}

export { createAssetsHandler };
export type { AssetsHandlerDeps };
