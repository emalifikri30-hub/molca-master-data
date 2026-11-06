import { asClass, type AwilixContainer } from "awilix";

import { AssetProductCodesStore } from "./asset-product-codes-store.js";
import { AssetProductCodesService } from "./asset-product-codes-service.js";

function registerAssetProductCodes(container: AwilixContainer) {
  container.register({
    assetProductCodesStore: asClass(AssetProductCodesStore).scoped(),
    assetProductCodesService: asClass(AssetProductCodesService).scoped(),
  });
}

export { registerAssetProductCodes };
