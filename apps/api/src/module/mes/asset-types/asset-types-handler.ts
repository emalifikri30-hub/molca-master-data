import { Hono } from "hono";

import { assetTypesValidator } from "./asset-types-dto.js";
import { WebResponse } from "@molca/network";

import type { AssetTypes } from "./asset-types.js";
import type { TAssetTypesService } from "./asset-types-service.js";

type AssetTypesHandlerDeps = {
  assetTypesService: TAssetTypesService;
};

function createAssetTypesHandler({ assetTypesService }: AssetTypesHandlerDeps) {
  const app = new Hono();

  app.get("/", assetTypesValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = { q };
    const { items, meta } = await assetTypesService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<AssetTypes[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", assetTypesValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetTypesService.create(input);
    return c.json(WebResponse.builder<AssetTypes>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetTypesService.get(id);
    return c.json(WebResponse.builder<AssetTypes>().data(row).build(), 200);
  });

  app.put("/:id", assetTypesValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await assetTypesService.update(id, patch);
    return c.json(WebResponse.builder<AssetTypes>().data(updated).build(), 200);
  });

  // Never deleted (PRD-003 US-FND-AST-001 rule 3) — deactivation sets validTo.
  app.post("/:id/deactivate", assetTypesValidator.deactivate, async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const updated = await assetTypesService.deactivate(id, input);
    return c.json(WebResponse.builder<AssetTypes>().data(updated).build(), 200);
  });

  return app;
}

export { createAssetTypesHandler };
export type { AssetTypesHandlerDeps };
