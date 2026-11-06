import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const assetPlacementTable = masterData.table(
  "asset_placement",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    assetId: p.text("asset_id").notNull(),
    workUnitId: p.text("work_unit_id").notNull(),
    placementRole: p.text("placement_role").notNull(),
    ...datingDays(),
  },
  scopeIdx("asset_placement"),
);
