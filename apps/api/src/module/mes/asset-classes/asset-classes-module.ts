import { asClass, type AwilixContainer } from "awilix";

import { AssetClassesStore } from "./asset-classes-store.js";
import { AssetClassesService } from "./asset-classes-service.js";

function registerAssetClasses(container: AwilixContainer) {
  container.register({
    assetClassesStore: asClass(AssetClassesStore).scoped(),
    assetClassesService: asClass(AssetClassesService).scoped(),
  });
}

export { registerAssetClasses };
