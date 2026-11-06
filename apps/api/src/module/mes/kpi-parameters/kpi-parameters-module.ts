import { asClass, type AwilixContainer } from "awilix";

import { KpiParametersStore } from "./kpi-parameters-store.js";
import { KpiParametersService } from "./kpi-parameters-service.js";

function registerKpiParameters(container: AwilixContainer) {
  container.register({
    kpiParametersStore: asClass(KpiParametersStore).scoped(),
    kpiParametersService: asClass(KpiParametersService).scoped(),
  });
}

export { registerKpiParameters };
