import { asClass, type AwilixContainer } from "awilix";

import { EquipmentFlowsStore } from "./equipment-flows-store.js";
import { EquipmentFlowsService } from "./equipment-flows-service.js";

function registerEquipmentFlows(container: AwilixContainer) {
  container.register({
    equipmentFlowsStore: asClass(EquipmentFlowsStore).scoped(),
    equipmentFlowsService: asClass(EquipmentFlowsService).scoped(),
  });
}

export { registerEquipmentFlows };
