import { asClass, type AwilixContainer } from "awilix";

import { DataSourcesService } from "./data-sources-service.js";
import { DataSourcesStore } from "./data-sources-store.js";

function registerDataSources(container: AwilixContainer) {
  container.register({
    dataSourcesStore: asClass(DataSourcesStore).scoped(),
    dataSourcesService: asClass(DataSourcesService).scoped(),
  });
}

export { registerDataSources };
