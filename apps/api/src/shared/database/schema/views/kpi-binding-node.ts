import { and, eq, sql } from "drizzle-orm";
import { masterData } from "../columns.js";
import { kpiFormulaSlotTable } from "../kpi/kpi-formula-slot.js";
import { workUnitKpiBindingTable } from "../kpi/work-unit-kpi-binding.js";
import { assetTagAddressView } from "./asset-tag-address.js";

// Which KPI slot each node feeds: one row per WORK_UNIT_KPI_BINDING, with the
// bound tag's node (and the second tag's, for two-tag transforms). Bindings
// stay keyed on asset_tag_id; the node is only read through
// `asset_tag_address`, so renaming a code or moving a machine changes the node
// here and never breaks a binding.

export const kpiBindingNodeView = masterData.view("kpi_binding_node").as((qb) => {
  // The second tag's node, through a CTE: an aliased view keeps the view's
  // own name on its columns, so it can't be joined twice.
  const second = qb.$with("second").as(
    qb
      .select({
        assetTagId: sql<string>`${assetTagAddressView.assetTagId}`.as("second_asset_tag_id"),
        region: sql<string>`${assetTagAddressView.region}`.as("second_region"),
        node: sql<string | null>`${assetTagAddressView.node}`.as("second_node"),
      })
      .from(assetTagAddressView),
  );
  return qb
    .with(second)
    .select({
      bindingId: sql<string>`${workUnitKpiBindingTable.id}`.as("binding_id"),
      region: workUnitKpiBindingTable.region,
      workUnitId: workUnitKpiBindingTable.workUnitId,
      slotId: workUnitKpiBindingTable.slotId,
      domain: kpiFormulaSlotTable.domain,
      metric: kpiFormulaSlotTable.metric,
      isoElement: kpiFormulaSlotTable.isoElement,
      transform: workUnitKpiBindingTable.transform,
      assetTagId: workUnitKpiBindingTable.assetTagId,
      path: assetTagAddressView.path,
      node: assetTagAddressView.node,
      tagName: assetTagAddressView.tagName,
      tagRole: assetTagAddressView.tagRole,
      assetId: assetTagAddressView.assetId,
      assetTag: assetTagAddressView.assetTag,
      secondAssetTagId: workUnitKpiBindingTable.secondAssetTagId,
      secondNode: second.node,
      validFrom: workUnitKpiBindingTable.validFrom,
      validTo: workUnitKpiBindingTable.validTo,
    })
    .from(workUnitKpiBindingTable)
    .leftJoin(kpiFormulaSlotTable, eq(kpiFormulaSlotTable.slotId, workUnitKpiBindingTable.slotId))
    .leftJoin(
      assetTagAddressView,
      and(
        eq(assetTagAddressView.assetTagId, workUnitKpiBindingTable.assetTagId),
        eq(assetTagAddressView.region, workUnitKpiBindingTable.region),
      ),
    )
    .leftJoin(
      second,
      and(
        eq(second.assetTagId, workUnitKpiBindingTable.secondAssetTagId),
        eq(second.region, workUnitKpiBindingTable.region),
      ),
    );
});
