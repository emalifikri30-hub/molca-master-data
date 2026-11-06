import { asClass, type AwilixContainer } from "awilix";

import { WorkCentersStore } from "./work-centers-store.js";
import { WorkCentersService } from "./work-centers-service.js";

function registerWorkCenters(container: AwilixContainer) {
  container.register({
    workCentersStore: asClass(WorkCentersStore).scoped(),
    workCentersService: asClass(WorkCentersService).scoped(),
  });
}

export { registerWorkCenters };
