import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const operationDependencyTable = masterData.table(
  "operation_dependency",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    routingId: p.text("routing_id").notNull(),
    stepId: p.text("step_id").notNull(),
    predecessorStepId: p.text("predecessor_step_id").notNull(),
  },
  scopeIdx("operation_dependency"),
);
