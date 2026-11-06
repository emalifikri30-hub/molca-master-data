import { asClass, type AwilixContainer } from "awilix";

import { AssetTypesStore } from "./asset-types-store.js";
import { AssetTypesService } from "./asset-types-service.js";

function registerAssetTypes(container: AwilixContainer) {
  container.register({
    assetTypesStore: asClass(AssetTypesStore).scoped(),
    assetTypesService: asClass(AssetTypesService).scoped(),
  });
}

export { registerAssetTypes };
