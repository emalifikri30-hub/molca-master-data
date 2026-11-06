import { asClass, type AwilixContainer } from "awilix";

import { AssetsStore } from "./assets-store.js";
import { AssetsService } from "./assets-service.js";

function registerAssets(container: AwilixContainer) {
  container.register({
    assetsStore: asClass(AssetsStore).scoped(),
    assetsService: asClass(AssetsService).scoped(),
  });
}

export { registerAssets };
