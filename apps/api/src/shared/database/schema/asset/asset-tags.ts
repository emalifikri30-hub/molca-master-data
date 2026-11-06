import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const assetTagTable = masterData.table(
  "asset_tags",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    assetId: p.text("asset_id").notNull(),
    dataSourceId: p.text("data_source_id").notNull(),
    tagName: p.text("tag_name").notNull().default(""),
    node: p.text("node").notNull(),
    workUnitId: p.text("work_unit_id"), // optional link: NULL = none (nullable-links.ts)
    kind: p.text("kind").notNull(),
    // Nullable only for seeded signals with no F-04 role (Film_Yield, ping): docs-molcadx#85.
    tagRole: p.text("tag_role"),
    rejectReasonId: p.text("reject_reason_id"), // optional link: NULL = none (nullable-links.ts)
    downtimeReasonId: p.text("downtime_reason_id"), // optional link: NULL = none (nullable-links.ts)
    uomId: p.text("uom_id"), // optional link: NULL = none (nullable-links.ts)
    countBasis: p.text("count_basis"),
    // F-04 §9.7 (issue #58): `output` / `input` on total/good/reject; "" otherwise.
    countSide: p.text("count_side"),
    ...datingDays(),
  },
  scopeIdx("asset_tags"),
);
