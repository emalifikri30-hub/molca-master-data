import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

export const siteTable = masterData.table(
  "site",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    enterpriseId: p.text("enterprise_id").notNull(),
    classId: p.text("site_class_id"), // optional link: NULL = none (nullable-links.ts)
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    timezone: p.text("timezone").notNull(),
    ...dating(),
  },
  scopeIdx("site"),
);
