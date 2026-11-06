import { Hono } from "hono";

import { assetClassesValidator } from "./asset-classes-dto.js";
import { WebResponse } from "@molca/network";

import type { AssetClasses } from "./asset-classes.js";
import type { TAssetClassesService } from "./asset-classes-service.js";

type AssetClassesHandlerDeps = {
  assetClassesService: TAssetClassesService;
};

function createAssetClassesHandler({ assetClassesService }: AssetClassesHandlerDeps) {
  const app = new Hono();

  app.get("/", assetClassesValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await assetClassesService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<AssetClasses[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", assetClassesValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetClassesService.create(input);
    return c.json(WebResponse.builder<AssetClasses>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetClassesService.get(id);
    return c.json(WebResponse.builder<AssetClasses>().data(row).build(), 200);
  });

  app.put("/:id", assetClassesValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await assetClassesService.update(id, patch);
    return c.json(WebResponse.builder<AssetClasses>().data(updated).build(), 200);
  });

  // Never deleted (PRD-003 US-FND-AST-001 rule 3) — deactivation sets validTo.
  app.post("/:id/deactivate", assetClassesValidator.deactivate, async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const updated = await assetClassesService.deactivate(id, input);
    return c.json(WebResponse.builder<AssetClasses>().data(updated).build(), 200);
  });

  return app;
}

export { createAssetClassesHandler };
export type { AssetClassesHandlerDeps };
