import { asClass, type AwilixContainer } from "awilix";

import { PlatformTenantsService } from "./platform-tenants-service.js";
import { PlatformTenantsStore } from "./platform-tenants-store.js";

function registerPlatform(container: AwilixContainer) {
  container.register({
    platformTenantsStore: asClass(PlatformTenantsStore).singleton(),
    platformTenantsService: asClass(PlatformTenantsService).scoped(),
  });
}

export { registerPlatform };
