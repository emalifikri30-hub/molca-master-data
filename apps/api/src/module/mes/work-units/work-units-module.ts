import { asClass, type AwilixContainer } from "awilix";

import { WorkUnitsStore } from "./work-units-store.js";
import { WorkUnitsService } from "./work-units-service.js";

function registerWorkUnits(container: AwilixContainer) {
  container.register({
    workUnitsStore: asClass(WorkUnitsStore).scoped(),
    workUnitsService: asClass(WorkUnitsService).scoped(),
  });
}

export { registerWorkUnits };
