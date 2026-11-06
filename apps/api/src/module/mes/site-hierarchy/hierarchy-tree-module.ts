import { asClass, type AwilixContainer } from "awilix";

import { HierarchyTreeRepository } from "./hierarchy-tree-repository.js";
import { HierarchyTreeService } from "./hierarchy-tree-service.js";

function registerHierarchyTree(container: AwilixContainer) {
  container.register({
    hierarchyTreeRepository: asClass(HierarchyTreeRepository).scoped(),
    hierarchyTreeService: asClass(HierarchyTreeService).scoped(),
  });
}

export { registerHierarchyTree };
