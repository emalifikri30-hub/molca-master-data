import { asClass, type AwilixContainer } from "awilix";

import { ShiftsService } from "./shifts-service.js";
import { ShiftsStore } from "./shifts-store.js";

function registerShifts(container: AwilixContainer) {
  container.register({
    shiftsStore: asClass(ShiftsStore).scoped(),
    shiftsService: asClass(ShiftsService).scoped(),
  });
}

export { registerShifts };
