import { asFunction, type AwilixContainer } from "awilix";

import { createFindTenant } from "./tenant-store.js";

function registerTenant(container: AwilixContainer) {
  container.register({
    findTenant: asFunction(({ db }) => createFindTenant(db)).singleton(),
  });
}

export { registerTenant };
