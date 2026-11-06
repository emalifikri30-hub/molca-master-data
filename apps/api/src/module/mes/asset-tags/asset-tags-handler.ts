import { Hono } from "hono";

import { assetTagsValidator } from "./asset-tags-dto.js";
import { WebResponse } from "@molca/network";

import type { AssetTags } from "./asset-tags.js";
import type { TAssetTagsService } from "./asset-tags-service.js";

type AssetTagsHandlerDeps = {
  assetTagsService: TAssetTagsService;
};

function createAssetTagsHandler({ assetTagsService }: AssetTagsHandlerDeps) {
  const app = new Hono();

  app.get("/", assetTagsValidator.list, async (c) => {
    const { page, size, assetId } = c.req.valid("query");
    const filter = { assetId };
    const { items, meta } = await assetTagsService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<AssetTags[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", assetTagsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetTagsService.create(input);
    return c.json(WebResponse.builder<AssetTags>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetTagsService.get(id);
    return c.json(WebResponse.builder<AssetTags>().data(row).build(), 200);
  });

  app.put("/:id", assetTagsValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await assetTagsService.update(id, patch);
    return c.json(WebResponse.builder<AssetTags>().data(updated).build(), 200);
  });

  // Never deleted (F-00, F-14 has no `delete` action) — deactivation sets valid_to.
  app.post("/:id/deactivate", async (c) => {
    const row = await assetTagsService.deactivate(c.req.param("id"));
    return c.json(WebResponse.builder<AssetTags>().data(row).build(), 200);
  });

  return app;
}

export { createAssetTagsHandler };
export type { AssetTagsHandlerDeps };
