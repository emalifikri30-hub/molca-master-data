import { asClass, type AwilixContainer } from "awilix";

import { WorkMasterService } from "./work-master-service.js";
import { WorkMasterStore } from "./work-master-store.js";

function registerWorkMaster(container: AwilixContainer) {
  container.register({
    workMasterStore: asClass(WorkMasterStore).scoped(),
    workMasterService: asClass(WorkMasterService).scoped(),
  });
}

export { registerWorkMaster };
