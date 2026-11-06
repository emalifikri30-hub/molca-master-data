import { Hono } from "hono";

import { assetPlacementsValidator } from "./asset-placements-dto.js";
import { WebResponse } from "@molca/network";

import type { AssetPlacements } from "./asset-placements.js";
import type { TAssetPlacementsService } from "./asset-placements-service.js";

type AssetPlacementsHandlerDeps = {
  assetPlacementsService: TAssetPlacementsService;
};

function createAssetPlacementsHandler({ assetPlacementsService }: AssetPlacementsHandlerDeps) {
  const app = new Hono();

  app.get("/", assetPlacementsValidator.list, async (c) => {
    const { page, size, workUnitId } = c.req.valid("query");
    const filter = { workUnitId };
    const { items, meta } = await assetPlacementsService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<AssetPlacements[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", assetPlacementsValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetPlacementsService.create(input);
    return c.json(WebResponse.builder<AssetPlacements>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetPlacementsService.get(id);
    return c.json(WebResponse.builder<AssetPlacements>().data(row).build(), 200);
  });

  app.post("/:id/change-role", assetPlacementsValidator.changeRole, async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const changed = await assetPlacementsService.changeRole(id, input);
    return c.json(WebResponse.builder<AssetPlacements>().data(changed).build(), 201);
  });

  // Unplace (US-FND-AST-003 AC-5). No DELETE — placement history is never removed.
  app.post("/:id/close", assetPlacementsValidator.close, async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const closed = await assetPlacementsService.close(id, input);
    return c.json(WebResponse.builder<AssetPlacements>().data(closed).build(), 200);
  });

  return app;
}

export { createAssetPlacementsHandler };
export type { AssetPlacementsHandlerDeps };
