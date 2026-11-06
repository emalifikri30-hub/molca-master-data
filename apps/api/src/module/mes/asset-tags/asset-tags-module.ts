import { asClass, type AwilixContainer } from "awilix";

import { AssetTagsStore } from "./asset-tags-store.js";
import { AssetTagsService } from "./asset-tags-service.js";

function registerAssetTags(container: AwilixContainer) {
  container.register({
    assetTagsStore: asClass(AssetTagsStore).scoped(),
    assetTagsService: asClass(AssetTagsService).scoped(),
  });
}

export { registerAssetTags };
