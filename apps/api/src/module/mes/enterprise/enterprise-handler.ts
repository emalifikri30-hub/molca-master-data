import { Hono } from "hono";

import { enterpriseValidator } from "./enterprise-dto.js";
import { WebResponse } from "@molca/network";

import type { Enterprise } from "./enterprise.js";
import type { TEnterpriseService } from "./enterprise-service.js";

type EnterpriseHandlerDeps = {
  enterpriseService: TEnterpriseService;
};

function createEnterpriseHandler({ enterpriseService }: EnterpriseHandlerDeps) {
  const app = new Hono();

  app.get("/", enterpriseValidator.list, async (c) => {
    const { page, size } = c.req.valid("query");
    const { items, meta } = await enterpriseService.getPaged(page, size, {});
    return c.json(WebResponse.builder<Enterprise[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", enterpriseValidator.create, async (c) => {
    const input = c.req.valid("json");
    const created = await enterpriseService.create(input);
    return c.json(WebResponse.builder<Enterprise>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const row = await enterpriseService.get(id);
    return c.json(WebResponse.builder<Enterprise>().data(row).build(), 200);
  });

  app.put("/:id", enterpriseValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await enterpriseService.update(id, patch);
    return c.json(WebResponse.builder<Enterprise>().data(updated).build(), 200);
  });

  // Never deleted (F-00, F-14 has no `delete` action) — deactivation sets valid_to.
  app.post("/:id/deactivate", async (c) => {
    const row = await enterpriseService.deactivate(c.req.param("id"));
    return c.json(WebResponse.builder<Enterprise>().data(row).build(), 200);
  });

  return app;
}

export { createEnterpriseHandler };
export type { EnterpriseHandlerDeps };
