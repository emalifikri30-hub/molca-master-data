import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const workCenterTable = masterData.table(
  "work_center",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    areaId: p.text("area_id").notNull(),
    classId: p.text("work_center_class_id"), // optional link: NULL = none (nullable-links.ts)
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    type: p.text("work_center_type").notNull(),
    ...dating(),
  },
  scopeIdx("work_center"),
);
