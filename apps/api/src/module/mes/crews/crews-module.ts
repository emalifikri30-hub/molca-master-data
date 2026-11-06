import { asClass, type AwilixContainer } from "awilix";

import { CrewsStore } from "./crews-store.js";
import { CrewsService } from "./crews-service.js";

function registerCrews(container: AwilixContainer) {
  container.register({
    crewsStore: asClass(CrewsStore).scoped(),
    crewsService: asClass(CrewsService).scoped(),
  });
}

export { registerCrews };
