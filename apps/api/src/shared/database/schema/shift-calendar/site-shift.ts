import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const siteShiftTable = masterData.table(
  "site_shift",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    enterpriseShiftId: p.text("enterprise_shift_id").notNull(),
    siteId: p.text("site_id").notNull(),
    startTime: p.text("start_time").notNull(),
    endTime: p.text("end_time").notNull(),
    ...datingDays(),
  },
  scopeIdx("site_shift"),
);
