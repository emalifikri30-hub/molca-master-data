import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const measurementGroupTable = masterData.table(
  "measurement_group",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    // F-05 §9.4: deactivate rather than hard-delete, like every other master.
    ...dating(),
  },
  scopeIdx("measurement_group"),
);
