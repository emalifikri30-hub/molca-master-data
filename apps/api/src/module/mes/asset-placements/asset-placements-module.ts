import { asClass, type AwilixContainer } from "awilix";

import { AssetPlacementsStore } from "./asset-placements-store.js";
import { AssetPlacementsService } from "./asset-placements-service.js";

function registerAssetPlacements(container: AwilixContainer) {
  container.register({
    assetPlacementsStore: asClass(AssetPlacementsStore).scoped(),
    assetPlacementsService: asClass(AssetPlacementsService).scoped(),
  });
}

export { registerAssetPlacements };
