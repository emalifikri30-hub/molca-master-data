import { asClass, type AwilixContainer } from "awilix";

import { PeopleStore } from "./people-store.js";
import { PeopleService } from "./people-service.js";

function registerPeople(container: AwilixContainer) {
  container.register({
    peopleStore: asClass(PeopleStore).scoped(),
    peopleService: asClass(PeopleService).scoped(),
  });
}

export { registerPeople };
