import { Hono } from "hono";

import { assetProductCodesValidator } from "./asset-product-codes-dto.js";
import { WebResponse } from "@molca/network";

import type { AssetProductCodes } from "./asset-product-codes.js";
import type { TAssetProductCodesService } from "./asset-product-codes-service.js";

type AssetProductCodesHandlerDeps = {
  assetProductCodesService: TAssetProductCodesService;
};

function createAssetProductCodesHandler({
  assetProductCodesService,
}: AssetProductCodesHandlerDeps) {
  const app = new Hono();

  app.get("/", assetProductCodesValidator.list, async (c) => {
    const { page, size, tagId, productId } = c.req.valid("query");
    const filter = { tagId, productId };
    const { items, meta } = await assetProductCodesService.getPaged(page, size, filter);
    return c.json(WebResponse.builder<AssetProductCodes[]>().data(items).meta(meta).build(), 200);
  });

  // WMS-006 §4 / F-07.1: which product a reading means. `productId: null` = unmapped.
  app.get("/resolve", assetProductCodesValidator.resolve, async (c) => {
    const { tagId, rawValue, at } = c.req.valid("query");
    const productId = await assetProductCodesService.resolve(tagId, rawValue, at);
    return c.json(
      WebResponse.builder<{ productId: string | null }>().data({ productId }).build(),
      200,
    );
  });

  app.post("/", assetProductCodesValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await assetProductCodesService.create(input);
    return c.json(WebResponse.builder<AssetProductCodes>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await assetProductCodesService.get(id);
    return c.json(WebResponse.builder<AssetProductCodes>().data(row).build(), 200);
  });

  // WMS-006 rule 5 (PO 2026-10-04): Edit ends the row and opens a new one in
  // one save; a row not yet in force is changed in place.
  app.post("/:id/edit", assetProductCodesValidator.edit, async (c) => {
    const id = c.req.param("id");
    const { reason, ...input } = c.req.valid("json");
    const edited = await assetProductCodesService.edit(id, input, reason);
    return c.json(WebResponse.builder<AssetProductCodes>().data(edited).build(), 200);
  });

  // A row in force takes an end.
  app.post("/:id/end", assetProductCodesValidator.end, async (c) => {
    const id = c.req.param("id");
    const { validTo, reason } = c.req.valid("json");
    const ended = await assetProductCodesService.end(id, validTo, reason);
    return c.json(WebResponse.builder<AssetProductCodes>().data(ended).build(), 200);
  });

  app.delete("/:id", assetProductCodesValidator.remove, async (c) => {
    const id = c.req.param("id");
    const { reason } = c.req.valid("json");
    const deleted = await assetProductCodesService.remove(id, reason);
    return c.json(WebResponse.builder<string>().data(deleted).build(), 200);
  });

  return app;
}

export { createAssetProductCodesHandler };
export type { AssetProductCodesHandlerDeps };
