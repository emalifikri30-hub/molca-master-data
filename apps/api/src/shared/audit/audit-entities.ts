import type { Row } from "./audit-context.js";

/**
 * How a table's writes become audit rows (F-14 §9.1). Every master-data table
 * a person can change is listed here. A table that isn't listed is not
 * audited: the audit log itself and the template's posts/comments.
 */
type AuditedTable = {
  /** Canonical entity name (F-14 `entity_type`), as the web's History reads it. */
  entityType: string | ((row: Row) => string);
  /** Business code snapshot for `entity_code`. Defaults to code / tag / name / id. */
  code?: (row: Row) => string;
  /**
   * Rows of one business record across versions share this key. A close and
   * an insert with the same key are one effective-dated edit = one `update`
   * row (F-14 "one close-and-open = one audit row").
   */
  versionKey?: (row: Row) => string;
  /**
   * A child table whose rows belong to a parent record (BOM lines, a step's
   * checks). Its writes are folded into one change on the parent's row
   * instead of a row each.
   */
  rollUp?: { entityType: string; parentId: (row: Row) => string; field: string };
  /** Site of the record for the scope snapshot, when the row carries it. */
  siteId?: (row: Row) => string | null;
};

const str = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
};

const AUDITED_TABLES: Record<string, AuditedTable> = {
  // SIT
  enterprise: { entityType: "ENTERPRISE" },
  site: { entityType: "SITE", siteId: (r) => str(r.id) || null },
  area: { entityType: "AREA" },
  work_center: { entityType: "WORK_CENTER" },
  work_unit: { entityType: "WORK_UNIT" },
  equipment_flow: {
    entityType: "EQUIPMENT_FLOW",
    code: (r) => `${str(r.fromWorkUnitId)} → ${str(r.toWorkUnitId)}`,
  },
  site_class: { entityType: "SITE_CLASS" },
  area_class: { entityType: "AREA_CLASS" },
  work_center_class: { entityType: "WORK_CENTER_CLASS" },
  work_unit_class: { entityType: "WORK_UNIT_CLASS" },
  // SHF / FYR
  enterprise_shift: { entityType: "SHIFT_DEFINITION", code: (r) => str(r.label) },
  site_shift: {
    entityType: "SITE_SHIFT",
    code: (r) => `${str(r.startTime)}–${str(r.endTime)}`,
    versionKey: (r) => `${str(r.siteId)}|${str(r.enterpriseShiftId)}`,
  },
  shift_instance: {
    entityType: "SHIFT_INSTANCE",
    code: (r) => str(r.businessDate),
  },
  fiscal_year: {
    entityType: "FISCAL_YEAR",
    code: (r) => str(r.label),
    versionKey: (r) => str(r.lineageId),
  },
  // PPL (MolcaDx MAM)
  person: { entityType: "PERSON", code: (r) => str(r.code) },
  crew: { entityType: "CREW", code: (r) => str(r.code) },
  // MRO catalogue (MolcaDx MAM)
  item: { entityType: "ITEM", code: (r) => str(r.code) },
  item_cost: { entityType: "ITEM_COST", code: (r) => str(r.itemId) },
  store: { entityType: "STORE", code: (r) => str(r.code) },
  bin: { entityType: "BIN", code: (r) => str(r.code) },
  failure_code: {
    entityType: "FAILURE_CODE",
    code: (r) => `${str(r.iso14224Class)}/${str(r.kind)}/${str(r.code)}`,
  },
  // AST
  asset_class: { entityType: "ASSET_CLASS" },
  asset_type: { entityType: "ASSET_TYPE" },
  asset: { entityType: "ASSET", code: (r) => str(r.assetTag) },
  asset_placement: {
    entityType: "ASSET_PLACEMENT",
    code: (r) => `${str(r.assetId)} @ ${str(r.workUnitId)}`,
    versionKey: (r) => str(r.assetId),
  },
  asset_tags: { entityType: "ASSET_TAGS", code: (r) => str(r.tagName) },
  asset_product_code: {
    entityType: "ASSET_PRODUCT_CODES",
    code: (r) => str(r.rawValue),
  },
  // REF
  downtime_reason: { entityType: "DOWNTIME_REASON" },
  reject_reason: { entityType: "REJECT_REASON" },
  downtime_reason_asset: {
    entityType: "DOWNTIME_REASON_ASSET",
    code: (r) => `${str(r.reasonId)} @ ${str(r.assetId)}`,
  },
  reject_reason_asset: {
    entityType: "REJECT_REASON_ASSET",
    code: (r) => `${str(r.reasonId)} @ ${str(r.assetId)}`,
  },
  unit_of_measurement: { entityType: "UNIT_OF_MEASUREMENTS" },
  measurement_group: { entityType: "MEASUREMENT_GROUP" },
  time_conversion: { entityType: "TIME_CONVERSIONS" },
  // PRO
  product: { entityType: "PRODUCT" },
  product_detail: {
    entityType: "PRODUCT_MEASUREMENT",
    code: (r) => str(r.productId),
    versionKey: (r) => str(r.productId),
  },
  product_uom_conversion: {
    entityType: "PRODUCT_UOM_CONVERSION",
    code: (r) => `${str(r.fromUomId)} → ${str(r.toUomId)}`,
    versionKey: (r) => `${str(r.productId)}|${str(r.fromUomId)}|${str(r.toUomId)}`,
  },
  // WMS
  product_flow: { entityType: "PRODUCT_FLOW", code: (r) => str(r.flowCode) },
  bom: { entityType: "BOM", code: (r) => `v${str(r.version)}` },
  bom_line: {
    entityType: "BOM_LINE",
    rollUp: { entityType: "BOM", parentId: (r) => str(r.bomId), field: "lines" },
  },
  routing: { entityType: "ROUTING", code: (r) => `v${str(r.version)}` },
  operation: {
    entityType: "OPERATION",
    code: (r) => `${str(r.stepNumber)} ${str(r.stepName)}`.trim(),
    versionKey: (r) => str(r.stepId),
  },
  operation_check: {
    entityType: "OPERATION_CHECK",
    rollUp: { entityType: "OPERATION", parentId: (r) => str(r.stepId), field: "checks" },
  },
  operation_instruction: {
    entityType: "OPERATION_INSTRUCTION",
    rollUp: { entityType: "OPERATION", parentId: (r) => str(r.stepId), field: "instructions" },
  },
  operation_dependency: {
    entityType: "OPERATION_DEPENDENCY",
    rollUp: { entityType: "OPERATION", parentId: (r) => str(r.stepId), field: "waitsFor" },
  },
  operation_work_unit: {
    entityType: "OPERATION_WORK_UNIT",
    rollUp: { entityType: "OPERATION", parentId: (r) => str(r.stepId), field: "stations" },
  },
  // KPI / DSR
  kpi_formula_slot: { entityType: "KPI_FORMULA_SLOT", code: (r) => str(r.slotId) },
  kpi_parameter: { entityType: "KPI_PARAMETER", code: (r) => str(r.parameterId) },
  work_unit_kpi_binding: {
    entityType: "WORK_UNIT_KPI_BINDING",
    code: (r) => `${str(r.workUnitId)} · ${str(r.slotId)}`,
    versionKey: (r) => `${str(r.workUnitId)}|${str(r.slotId)}|${str(r.assetTagId)}`,
  },
  data_source: { entityType: "DATA_SOURCE" },
};

function auditedTable(table: string): AuditedTable | undefined {
  return AUDITED_TABLES[table];
}

export { auditedTable, str };
export type { AuditedTable };
