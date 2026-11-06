import { asClass, type AwilixContainer } from "awilix";

import { EnterpriseStore } from "./enterprise-store.js";
import { EnterpriseService } from "./enterprise-service.js";

function registerEnterprise(container: AwilixContainer) {
  container.register({
    enterpriseStore: asClass(EnterpriseStore).scoped(),
    enterpriseService: asClass(EnterpriseService).scoped(),
  });
}

export { registerEnterprise };
