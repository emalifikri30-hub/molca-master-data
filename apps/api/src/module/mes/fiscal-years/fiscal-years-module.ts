import { asClass, type AwilixContainer } from "awilix";

import { FiscalYearsService } from "./fiscal-years-service.js";
import { FiscalYearsStore } from "./fiscal-years-store.js";

function registerFiscalYears(container: AwilixContainer) {
  container.register({
    fiscalYearsStore: asClass(FiscalYearsStore).scoped(),
    fiscalYearsService: asClass(FiscalYearsService).scoped(),
  });
}

export { registerFiscalYears };
