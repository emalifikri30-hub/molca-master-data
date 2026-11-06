import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, scopeIdx } from "../columns.js";

export const shiftInstanceTable = masterData.table(
  "shift_instance",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    siteShiftId: p.text("site_shift_id").notNull(),
    siteId: p.text("site_id").notNull(),
    enterpriseShiftId: p.text("enterprise_shift_id").notNull(),
    businessDate: p.text("business_date").notNull(),
    startDatetime: p.text("start_datetime").notNull(),
    endDatetime: p.text("end_datetime").notNull(),
    status: p.text("status").notNull(),
  },
  (t) => [
    ...scopeIdx("shift_instance")(t),
    // F-02 §9.3: one shift instance per site shift and business date.
    p.unique("shift_instance_site_shift_date_key").on(t.siteShiftId, t.businessDate),
  ],
);
