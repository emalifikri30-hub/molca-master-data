import { asClass, type AwilixContainer } from "awilix";

import { AreasReaderRepository, AreasWriterRepository } from "./areas-repository.js";
import { AreasService } from "./areas-service.js";
import { AreasStore } from "./areas-store.js";

function registerAreas(container: AwilixContainer) {
  container.register({
    areasStore: asClass(AreasStore).scoped(),
    areasReaderRepository: asClass(AreasReaderRepository).scoped(),
    areasWriterRepository: asClass(AreasWriterRepository).scoped(),
    areasService: asClass(AreasService).scoped(),
  });
}

export { registerAreas };
