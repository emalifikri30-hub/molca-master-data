import { and, eq, getTableName, is, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";

import { currentTenantId } from "../tenant/tenant-context.js";
import {
  areaClassTable,
  areaTable,
  assetClassTable,
  assetProductCodeTable,
  assetTable,
  assetTagTable,
  assetTypeTable,
  bomTable,
  dataSourceTable,
  downtimeReasonTable,
  enterpriseShiftTable,
  enterpriseTable,
  fiscalYearTable,
  kpiFormulaSlotTable,
  measurementGroupTable,
  operationTable,
  productFlowTable,
  productTable,
  rejectReasonTable,
  routingTable,
  siteClassTable,
  siteShiftTable,
  siteTable,
  timeConversionTable,
  unitOfMeasurementTable,
  workCenterClassTable,
  workCenterTable,
  workUnitClassTable,
  workUnitKpiBindingTable,
  workUnitTable,
} from "./schema/schema.js";

import type { PostgresDB } from "./postgres.js";

/**
 * Where a link points. A plain table means that table's `id`. The step keys
 * (`operation.stepId`) and the KPI slot key (`kpi_formula_slot.slotId`) are not
 * `id` columns, so those targets name the column too.
 */
type LinkTarget = PgTable | { table: PgTable; column: string };

/** One resolved link: the row's property `key` must name a row of `foreignTable` in this tenant. */
type TenantLink = {
  key: string;
  foreignTable: PgTable;
  foreignColumn: PgColumn;
  tenantColumn: PgColumn;
};

/** The step key every dated version of one step shares (F-08); not `operation.id`. */
const STEP = { table: operationTable, column: "stepId" } as const;
/** The KPI formula slot code (catalog key, PK `slot_id`); not `kpi_formula_slot.id`. */
const KPI_SLOT = { table: kpiFormulaSlotTable, column: "slotId" } as const;

/**
 * Every `*_id` column that points at another master-data row, keyed by table name
 * (`getTableName`) and then by the JS key. The schema declares no foreign keys (only
 * tenant_id has one), so links are listed here and checked on write (F-00 rule 6).
 * Verified against the module code that writes each column. NOT_LINKS documents the rest.
 */
const TENANT_LINKS: Record<string, Record<string, LinkTarget>> = {
  area: { siteId: siteTable, classId: areaClassTable },
  asset_class: { parentClassId: assetClassTable },
  asset_placement: { assetId: assetTable, workUnitId: workUnitTable },
  asset_product_code_change: {
    assetProductCodeId: assetProductCodeTable,
    workUnitId: workUnitTable,
  },
  // tagId is an asset_tags row (store: "tag not found"); productId a product.
  asset_product_code: { tagId: assetTagTable, productId: productTable },
  asset: { assetTypeId: assetTypeTable, parentAssetId: assetTable },
  asset_tags: {
    assetId: assetTable,
    dataSourceId: dataSourceTable,
    workUnitId: workUnitTable,
    rejectReasonId: rejectReasonTable,
    downtimeReasonId: downtimeReasonTable,
    uomId: unitOfMeasurementTable,
  },
  asset_type: { assetClassId: assetClassTable },
  bom_line: {
    bomId: bomTable,
    componentProductId: productTable,
    stepId: STEP,
    uomId: unitOfMeasurementTable,
  },
  // flowId: the product's flow (PRODUCT_FLOW; every product has a "Standard" one).
  bom: { productId: productTable, flowId: productFlowTable, baseUomId: unitOfMeasurementTable },
  data_source: { siteId: siteTable },
  // The tick tables: a reason tick points at its own reason table and an asset.
  downtime_reason_asset: { reasonId: downtimeReasonTable, assetId: assetTable },
  reject_reason_asset: { reasonId: rejectReasonTable, assetId: assetTable },
  equipment_flow: {
    workCenterId: workCenterTable,
    fromWorkUnitId: workUnitTable,
    toWorkUnitId: workUnitTable,
  },
  // previousVersionId: the earlier version of the same fiscal year (self link);
  // enterpriseId: UX-SIT-6 (PO, 2026-10-19), each enterprise declares its own years.
  fiscal_year: { enterpriseId: enterpriseTable, previousVersionId: fiscalYearTable },
  kpi_parameter: { slotId: KPI_SLOT },
  operation_check: {
    routingId: routingTable,
    stepId: STEP,
    uomId: unitOfMeasurementTable,
    frequencyIntervalConversionId: timeConversionTable,
  },
  operation_dependency: { routingId: routingTable, stepId: STEP, predecessorStepId: STEP },
  operation_instruction: { routingId: routingTable, stepId: STEP },
  operation: {
    routingId: routingTable,
    workUnitId: workUnitTable,
    requiredWorkUnitClassId: workUnitClassTable,
    uomId: unitOfMeasurementTable,
    timeConversionId: timeConversionTable,
    speedUomId: unitOfMeasurementTable,
    setupTimeConversionId: timeConversionTable,
    holdTimeConversionId: timeConversionTable,
  },
  operation_work_unit: { routingId: routingTable, stepId: STEP, workUnitId: workUnitTable },
  product_detail: {
    productId: productTable,
    weightUomId: unitOfMeasurementTable,
    dimensionUomId: unitOfMeasurementTable,
  },
  product_flow: { productId: productTable },
  product: { baseUomId: unitOfMeasurementTable },
  product_uom_conversion: {
    productId: productTable,
    fromUomId: unitOfMeasurementTable,
    toUomId: unitOfMeasurementTable,
  },
  product_uom_measurement: { productId: productTable, uomId: unitOfMeasurementTable },
  routing: { productId: productTable, workCenterId: workCenterTable, flowId: productFlowTable },
  shift_instance: {
    siteShiftId: siteShiftTable,
    siteId: siteTable,
    enterpriseShiftId: enterpriseShiftTable,
  },
  // UX-SIT-6 (PO, 2026-10-19): an enterprise shift belongs to one enterprise.
  enterprise_shift: { enterpriseId: enterpriseTable },
  site_shift: { enterpriseShiftId: enterpriseShiftTable, siteId: siteTable },
  site: { enterpriseId: enterpriseTable, classId: siteClassTable },
  unit_of_measurement: { measurementGroupId: measurementGroupTable },
  work_center: { areaId: areaTable, classId: workCenterClassTable },
  work_unit: { workCenterId: workCenterTable, classId: workUnitClassTable },
  // bindingId: the binding row this change is about (add, edit or end).
  work_unit_kpi_binding_change: {
    bindingId: workUnitKpiBindingTable,
    workUnitId: workUnitTable,
    slotId: KPI_SLOT,
  },
  work_unit_kpi_binding: {
    workUnitId: workUnitTable,
    slotId: KPI_SLOT,
    assetTagId: assetTagTable,
    secondAssetTagId: assetTagTable,
  },
};

/** The tenant scope column of every master-data table: scoping stamps and filters it. */
const SCOPED = {
  tenantId:
    "tenant scope column (F-00 rule 6): stamped and filtered by the tenant scope, not a link",
};

/**
 * Every other `*_id` column of every tenant-scoped table, with the reason it is not a link.
 * Together with TENANT_LINKS this covers each such column exactly once (checked by
 * tenant-links.test.ts).
 */
const NOT_LINKS: Record<string, Record<string, string>> = {
  // MolcaDx local fork tables (mounted handlers that query within the tenant themselves)
  asset_label: {
    ...SCOPED,
    assetId: "local MolcaDx fork: the handler reads it with a tenant filter (asset-labels.ts)",
  },
  change_request: {
    ...SCOPED,
    entityId: "polymorphic: id of the row the change targets; its table is entity",
    makerId: "Keycloak subject of the person who asked, not a row",
  },
  person: {
    ...SCOPED,
    siteId: "local MolcaDx fork: the handler reads it with a tenant filter (people)",
  },
  crew: {
    ...SCOPED,
    siteId: "local MolcaDx fork: the handler reads it with a tenant filter (crews)",
    leaderId: "local MolcaDx fork: the handler reads it with a tenant filter (crews)",
  },
  item: { ...SCOPED },
  item_cost: {
    ...SCOPED,
    itemId: "local MolcaDx fork: the handler reads it with a tenant filter (mro-catalog.ts)",
  },
  store: {
    ...SCOPED,
    siteId: "local MolcaDx fork: the handler reads it with a tenant filter (mro-catalog.ts)",
    workUnitId: "local MolcaDx fork: the handler reads it with a tenant filter (mro-catalog.ts)",
  },
  bin: {
    ...SCOPED,
    storeId: "local MolcaDx fork: the handler reads it with a tenant filter (mro-catalog.ts)",
  },
  failure_code: {
    ...SCOPED,
    labelId: "local MolcaDx fork: the handler reads it with a tenant filter (mro-catalog.ts)",
  },
  area_class: { ...SCOPED },
  area: { ...SCOPED },
  asset_class: { ...SCOPED },
  asset_placement: { ...SCOPED },
  asset_product_code_change: {
    ...SCOPED,
    changeId: "primary key of this change row (generated id)",
  },
  asset_product_code: { ...SCOPED },
  asset: { ...SCOPED },
  asset_tags: { ...SCOPED },
  asset_type: { ...SCOPED },
  audit_log: {
    ...SCOPED,
    entityId: "polymorphic: id of the row this entry describes; its table is entity_type",
    previousVersionEntityId: "polymorphic: id of the earlier version of that same row",
    importBatchId: "generated id of one import batch; no table holds it",
    transactionId: "generated id of one save's transaction; no table holds it",
    actorSubjectId: "Keycloak subject of the actor (identity provider), not a row",
    onBehalfOfSubjectId:
      "TNT-G7: Keycloak subject of the person a service account wrote for, not a row",
    enterpriseId:
      "F-14 §9.1 scope snapshot written with the entry (where the change was), not checked",
    siteId: "F-14 §9.1 scope snapshot written with the entry, not checked",
    areaId: "F-14 §9.1 scope snapshot written with the entry, not checked",
    workCenterId: "F-14 §9.1 scope snapshot written with the entry, not checked",
    workUnitId: "F-14 §9.1 scope snapshot written with the entry, not checked",
  },
  bom_line: { ...SCOPED },
  bom: { ...SCOPED },
  data_source: { ...SCOPED },
  downtime_action: { ...SCOPED },
  downtime_reason_asset: { ...SCOPED },
  downtime_reason: { ...SCOPED },
  enterprise_shift: { ...SCOPED },
  enterprise: { ...SCOPED },
  equipment_flow: { ...SCOPED },
  fiscal_year: {
    ...SCOPED,
    lineageId: "version lineage key shared by every version of one fiscal year (not a row link)",
  },
  kpi_formula_slot: {
    ...SCOPED,
    slotId: "primary key: the KPI formula slot code (referenced by kpi_parameter and bindings)",
  },
  kpi_parameter: { ...SCOPED, parameterId: "primary key of this parameter row" },
  measurement_group: { ...SCOPED },
  operation_check: {
    ...SCOPED,
    checkId: "identity shared by the dated rows of one check (F-08 §9.2.6), not a row link",
  },
  operation_dependency: { ...SCOPED },
  operation_instruction: {
    ...SCOPED,
    instructionId: "identity shared by the dated rows of one instruction (F-08 §9.2.5)",
  },
  operation: {
    ...SCOPED,
    stepId: "identity shared by every dated version of one step; other step tables link to it",
  },
  operation_work_unit: { ...SCOPED },
  product_detail: { ...SCOPED },
  product_flow: { ...SCOPED },
  product: { ...SCOPED },
  product_uom_conversion: { ...SCOPED },
  product_uom_measurement: { ...SCOPED },
  reject_reason_asset: { ...SCOPED },
  reject_reason: { ...SCOPED },
  routing: { ...SCOPED },
  shift_instance: { ...SCOPED },
  site_class: { ...SCOPED },
  site_shift: { ...SCOPED },
  site: { ...SCOPED },
  tenant: { tenantId: "primary key: the Keycloak organization id of the tenant itself" },
  time_conversion: { ...SCOPED },
  unit_of_measurement: { ...SCOPED },
  work_center_class: { ...SCOPED },
  work_center: { ...SCOPED },
  work_unit_class: { ...SCOPED },
  work_unit_kpi_binding_change: {
    ...SCOPED,
    changeId: "primary key of this change row (generated id)",
  },
  work_unit_kpi_binding: { ...SCOPED },
  work_unit: { ...SCOPED },
};

/** Per table object, resolved once: the registry is static. */
const cache = new WeakMap<PgTable, readonly TenantLink[]>();

function tenantLinks(table: PgTable): readonly TenantLink[] {
  const cached = cache.get(table);
  if (cached) return cached;
  const name = getTableName(table);
  const links: TenantLink[] = [];
  for (const [key, target] of Object.entries(TENANT_LINKS[name] ?? {})) {
    const foreignTable = is(target, PgTable) ? target : target.table;
    const columns = foreignTable as unknown as Record<string, PgColumn | undefined>;
    const foreignColumn = is(target, PgTable) ? columns.id : columns[target.column];
    const tenantColumn = columns.tenantId;
    if (!foreignColumn || !tenantColumn) {
      throw new Error(`${name}.${key} links to a table without the needed columns`);
    }
    links.push({ key, foreignTable, foreignColumn, tenantColumn });
  }
  cache.set(table, links);
  return links;
}

/**
 * A link must point inside the same tenant (F-00 rule 6): the schema has no foreign keys,
 * so an id alone would accept another tenant's row. Checks every link key present in `row`
 * with a value (NULL and "" mean "none"). Runs on `conn`, so rows written earlier in the
 * same transaction are visible.
 */
async function assertLinksInTenant(
  conn: PostgresDB,
  table: PgTable,
  row: Record<string, unknown>,
): Promise<void> {
  const links = tenantLinks(table);
  if (links.length === 0) return;
  const tenantId = currentTenantId();
  for (const link of links) {
    const value = row[link.key];
    if (value === undefined || value === null || value === "") continue;
    const found = await conn
      .select({ one: sql`1` })
      .from(link.foreignTable as never)
      .where(and(eq(link.foreignColumn, value as string), eq(link.tenantColumn, tenantId)))
      .limit(1);
    if (found.length === 0) throw new HTTPException(404, { message: `${link.key} not found` });
  }
}

export { assertLinksInTenant, NOT_LINKS, tenantLinks, TENANT_LINKS };
export type { LinkTarget, TenantLink };
