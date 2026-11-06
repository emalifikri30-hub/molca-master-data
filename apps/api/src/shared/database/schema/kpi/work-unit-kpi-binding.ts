import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const workUnitKpiBindingTable = masterData.table(
  "work_unit_kpi_binding",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    workUnitId: p.text("work_unit_id").notNull(),
    slotId: p.text("slot_id").notNull(),
    assetTagId: p.text("asset_tag_id").notNull(),
    transform: p.text("transform").notNull(),
    secondAssetTagId: p.text("second_asset_tag_id"),
    ...datingDays(),
  },
  scopeIdx("work_unit_kpi_binding"),
);
