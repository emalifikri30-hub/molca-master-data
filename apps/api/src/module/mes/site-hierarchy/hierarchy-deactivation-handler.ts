import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type {
  DeactivationImpact,
  DeactivationResult,
  HierarchyDeactivationService,
} from "./hierarchy-deactivation.js";

const kindSchema = z.enum(["site", "area", "work-center", "work-unit"]);

const impactSchema = z.object({ kind: kindSchema, id: z.string().min(1) });

const deactivateSchema = z.object({
  kind: kindSchema,
  id: z.string().min(1),
  validTo: z.string().min(1).optional(),
});

type HierarchyDeactivationHandlerDeps = {
  hierarchyDeactivationService: HierarchyDeactivationService;
};

/** PRD-003 US-FND-SIT-002: `GET /impact` before confirming, `POST /deactivate` to do it. */
function createHierarchyDeactivationHandler({
  hierarchyDeactivationService,
}: HierarchyDeactivationHandlerDeps) {
  const app = new Hono();

  app.get("/impact", queryValidator(impactSchema), async (c) => {
    const { kind, id } = c.req.valid("query");
    const impact = await hierarchyDeactivationService.impact(kind, id);
    return c.json(WebResponse.builder<DeactivationImpact>().data(impact).build(), 200);
  });

  app.post("/deactivate", jsonValidator(deactivateSchema), async (c) => {
    const { kind, id, validTo } = c.req.valid("json");
    const result = await hierarchyDeactivationService.deactivate(kind, id, validTo);
    return c.json(WebResponse.builder<DeactivationResult>().data(result).build(), 200);
  });

  return app;
}

export { createHierarchyDeactivationHandler };
