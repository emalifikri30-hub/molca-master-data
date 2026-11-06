import { asClass, type AwilixContainer } from "awilix";

import { LocationClassesService } from "./location-classes-service.js";
import { LocationClassesStore } from "./location-classes-store.js";

function registerLocationClasses(container: AwilixContainer) {
  container.register({
    locationClassesStore: asClass(LocationClassesStore).scoped(),
    locationClassesService: asClass(LocationClassesService).scoped(),
  });
}

export { registerLocationClasses };
