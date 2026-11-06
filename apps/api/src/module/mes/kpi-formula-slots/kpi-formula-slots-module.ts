import { asClass, type AwilixContainer } from "awilix";

import { KpiFormulaSlotsStore } from "./kpi-formula-slots-store.js";
import { KpiFormulaSlotsService } from "./kpi-formula-slots-service.js";

function registerKpiFormulaSlots(container: AwilixContainer) {
  container.register({
    kpiFormulaSlotsStore: asClass(KpiFormulaSlotsStore).scoped(),
    kpiFormulaSlotsService: asClass(KpiFormulaSlotsService).scoped(),
  });
}

export { registerKpiFormulaSlots };
