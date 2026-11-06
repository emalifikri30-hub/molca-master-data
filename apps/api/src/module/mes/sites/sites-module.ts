import { asClass, type AwilixContainer } from "awilix";

import { SitesReaderRepository, SitesWriterRepository } from "./sites-repository.js";
import { SitesService } from "./sites-service.js";
import { SitesStore } from "./sites-store.js";

function registerSites(container: AwilixContainer) {
  container.register({
    sitesStore: asClass(SitesStore).scoped(),
    sitesReaderRepository: asClass(SitesReaderRepository).scoped(),
    sitesWriterRepository: asClass(SitesWriterRepository).scoped(),
    sitesService: asClass(SitesService).scoped(),
  });
}

export { registerSites };
