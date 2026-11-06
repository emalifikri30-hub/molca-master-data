import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const areaTable = masterData.table(
  "area",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    siteId: p.text("site_id").notNull(),
    classId: p.text("area_class_id"), // optional link: NULL = none (nullable-links.ts)
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    ...dating(),
  },
  scopeIdx("area"),
);
