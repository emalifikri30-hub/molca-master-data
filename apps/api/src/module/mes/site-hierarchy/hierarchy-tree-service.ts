import { HTTPException } from "hono/http-exception";

import { today } from "./hierarchy-rules.js";
import { buildHierarchyTree, findNode, type TreeNode, type TreeTenant } from "./hierarchy-tree.js";

import type { HierarchyTreeRepository } from "./hierarchy-tree-repository.js";

type HierarchyTreeServiceDeps = {
  hierarchyTreeRepository: HierarchyTreeRepository;
};

type TreeQuery = {
  /** false (default): inactive nodes and their branches are left out. */
  includeInactive: boolean;
  /** The tenant id returns the whole tree; any other id returns that node's subtree. */
  rootId?: string;
};

/** F-01 §9.14: the Site Hierarchy as one nested tree for other modules. Read-only. */
class HierarchyTreeService {
  private hierarchyTreeRepository: HierarchyTreeRepository;

  constructor({ hierarchyTreeRepository }: HierarchyTreeServiceDeps) {
    this.hierarchyTreeRepository = hierarchyTreeRepository;
  }

  /**
   * Throws 404 when `rootId` is not a node of this tenant, or is inactive while
   * `includeInactive` is false (the pruned tree does not contain it).
   */
  async tree(tenant: TreeTenant, query: TreeQuery): Promise<TreeNode> {
    const rows = await this.hierarchyTreeRepository.load();
    const root = buildHierarchyTree(tenant, rows, {
      includeInactive: query.includeInactive,
      today: today(),
    });
    if (query.rootId === undefined || query.rootId === tenant.tenantId) return root;
    const node = findNode(root, query.rootId);
    if (!node) throw new HTTPException(404, { message: "site hierarchy node not found" });
    return node;
  }
}

export { HierarchyTreeService };
export type { HierarchyTreeServiceDeps, TreeQuery };
