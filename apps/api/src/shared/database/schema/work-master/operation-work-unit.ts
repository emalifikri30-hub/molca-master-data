import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const operationWorkUnitTable = masterData.table(
  "operation_work_unit",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    routingId: p.text("routing_id").notNull(),
    stepId: p.text("step_id").notNull(),
    workUnitId: p.text("work_unit_id").notNull(),
    cycleTimeValue: p.doublePrecision("cycle_time_value"),
    ...datingDays(),
  },
  scopeIdx("operation_work_unit"),
);
