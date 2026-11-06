import { asClass, type AwilixContainer } from "awilix";

import { HierarchyDeactivationService } from "./hierarchy-deactivation.js";

function registerHierarchyDeactivation(container: AwilixContainer) {
  container.register({
    hierarchyDeactivationService: asClass(HierarchyDeactivationService).scoped(),
  });
}

export { registerHierarchyDeactivation };
