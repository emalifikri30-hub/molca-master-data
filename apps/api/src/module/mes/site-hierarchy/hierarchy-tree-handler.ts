import * as z from "zod";
import { Hono } from "hono";

import { queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { TenantRequestEnv } from "../../../shared/tenant/tenant-middleware.js";
import type { TreeNode } from "./hierarchy-tree.js";
import type { HierarchyTreeService } from "./hierarchy-tree-service.js";

const treeQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  rootId: z.string().min(1).optional(),
});

type HierarchyTreeHandlerDeps = {
  hierarchyTreeService: HierarchyTreeService;
};

/** F-01 §9.14: `GET /site-hierarchy/tree?includeInactive=&rootId=`. */
function createHierarchyTreeHandler({ hierarchyTreeService }: HierarchyTreeHandlerDeps) {
  const app = new Hono<TenantRequestEnv>();

  app.get("/", queryValidator(treeQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const tree = await hierarchyTreeService.tree(c.get("tenant"), query);
    return c.json(WebResponse.builder<TreeNode>().data(tree).build(), 200);
  });

  return app;
}

export { createHierarchyTreeHandler };
