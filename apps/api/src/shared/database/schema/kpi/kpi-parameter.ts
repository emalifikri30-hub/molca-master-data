import * as p from "drizzle-orm/pg-core";

import { masterData, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const kpiParameterTable = masterData.table(
  "kpi_parameter",
  {
    parameterId: p.text("parameter_id").primaryKey(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    slotId: p.text("slot_id").notNull(),
    tagRole: p.text("tag_role").notNull(),
    transform: p.text("transform").notNull(),
    rank: p.integer("rank"),
    ...dating(),
  },
  scopeIdx("kpi_parameter"),
);
