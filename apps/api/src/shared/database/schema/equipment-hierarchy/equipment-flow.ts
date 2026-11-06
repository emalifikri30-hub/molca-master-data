import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const equipmentFlowTable = masterData.table(
  "equipment_flow",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    workCenterId: p.text("work_center_id").notNull(),
    fromWorkUnitId: p.text("from_work_unit_id").notNull(),
    toWorkUnitId: p.text("to_work_unit_id").notNull(),
    ...dating(),
  },
  scopeIdx("equipment_flow"),
);
