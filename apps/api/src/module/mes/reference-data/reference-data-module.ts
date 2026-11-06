import { asClass, type AwilixContainer } from "awilix";

import { ReferenceDataService } from "./reference-data-service.js";
import { ReferenceDataStore } from "./reference-data-store.js";

function registerReferenceData(container: AwilixContainer) {
  container.register({
    referenceDataStore: asClass(ReferenceDataStore).scoped(),
    referenceDataService: asClass(ReferenceDataService).scoped(),
  });
}

export { registerReferenceData };
