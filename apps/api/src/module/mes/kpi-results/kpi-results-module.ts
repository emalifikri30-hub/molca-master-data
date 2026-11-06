import { asClass, type AwilixContainer } from "awilix";

import { KpiResultsService } from "./kpi-results-service.js";

function registerKpiResults(container: AwilixContainer) {
  container.register({ kpiResultsService: asClass(KpiResultsService).scoped() });
}

export { registerKpiResults };
