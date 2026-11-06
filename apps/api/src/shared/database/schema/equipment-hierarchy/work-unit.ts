import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const workUnitTable = masterData.table(
  "work_unit",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    workCenterId: p.text("work_center_id").notNull(),
    classId: p.text("work_unit_class_id"), // optional link: NULL = none (nullable-links.ts)
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    ...dating(),
  },
  scopeIdx("work_unit"),
);
