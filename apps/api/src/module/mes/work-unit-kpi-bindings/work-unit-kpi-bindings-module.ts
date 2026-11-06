import { asClass, type AwilixContainer } from "awilix";

import { WorkUnitKpiBindingsStore } from "./work-unit-kpi-bindings-store.js";
import { WorkUnitKpiBindingsService } from "./work-unit-kpi-bindings-service.js";

function registerWorkUnitKpiBindings(container: AwilixContainer) {
  container.register({
    workUnitKpiBindingsStore: asClass(WorkUnitKpiBindingsStore).scoped(),
    workUnitKpiBindingsService: asClass(WorkUnitKpiBindingsService).scoped(),
  });
}

export { registerWorkUnitKpiBindings };
