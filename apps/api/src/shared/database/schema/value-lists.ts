// Fixed value lists, stored as plain `text` (no Postgres enums): views in other
// schemas (silver) read these columns, and an enum type change would break them.
// The API types and zod schemas derive from these lists, so each one is written
// once. A value outside a list is refused by the API, not by the database.

export const PLACEMENT_ROLE_VALUES = ["primary", "secondary"] as const;
export const COMPONENT_LEVEL_VALUES = [
  "equipment_unit",
  "subunit",
  "maintainable_item",
  "part",
] as const;
export const LIFECYCLE_STATUS_VALUES = [
  "planned",
  "installed",
  "operational",
  "under_maintenance",
  "idle",
  "decommissioned",
] as const;
export const DATA_SOURCE_PROTOCOL_VALUES = ["mqtt", "opcua", "other"] as const;
export const NODE_NAMING_VALUES = ["generated", "manual"] as const;
export const WORK_CENTER_TYPE_VALUES = [
  "production_line",
  "process_cell",
  "production_unit",
  "storage_zone",
] as const;
export const SHIFT_INSTANCE_STATUS_VALUES = ["open", "closed"] as const;
export const CALENDAR_BASIS_VALUES = ["monthly", "weekly_iso"] as const;
export const PERIOD_PATTERN_VALUES = ["4-5-4", "4-4-5", "5-4-4"] as const;
export const DOWNTIME_CATEGORY_VALUES = ["unplanned", "planned", "small_stop"] as const;
export const REASON_KIND_VALUES = ["downtime", "reject"] as const;
export const PRODUCT_TYPE_VALUES = [
  "raw_material",
  "packaging",
  "consumable",
  "semi_finished",
  "finished_good",
] as const;
export const PACKAGING_LEVEL_VALUES = ["primary", "secondary"] as const;
export const VERSION_STATUS_VALUES = ["draft", "released", "retired"] as const;
export const BOM_LINE_USE_VALUES = ["consumed", "produced"] as const;
export const TOLERANCE_TYPE_VALUES = ["percent", "absolute"] as const;
export const CHECK_VALUE_TYPE_VALUES = ["numeric", "pass_fail", "text"] as const;
export const CHECK_FREQUENCY_VALUES = ["once", "start_middle_end", "interval"] as const;
export const KPI_DOMAIN_VALUES = ["production", "quality", "maintenance", "inventory"] as const;
export const KPI_TRANSFORM_VALUES = [
  "none",
  "unit_convert",
  "counter_to_duration",
  "infeed_outfeed_derive",
  "complement_derive",
  "reconcile_check",
  "segment_and_sum",
  "reason_tag_drives_stop",
  "stall_bucket",
  "range_bucket",
  "reason_match_enrich",
  "speed_vs_standard_check",
  "interval_mean",
] as const;
export const AUDIT_ACTOR_TYPE_VALUES = ["user", "service"] as const;
export const AUDIT_SOURCE_VALUES = ["ui", "import", "api", "system"] as const;
export const ASSET_TAG_KIND_VALUES = [
  "cumulative_counter",
  "delta_counter",
  "value",
  "boolean",
  "enum",
  "occurrence",
] as const;
export const ASSET_TAG_ROLE_VALUES = [
  "product_code",
  "total",
  "good",
  "reject",
  "machine_state",
  "downtime_reason",
  "reject_reason",
  "speed",
  "runtime",
  "measured_total",
  "activity_signal",
  "lot_marker",
  // KPI-007 rule 7 (PO 2026-11-03): a mass running total in kg or g, bound only to
  // `shopfloor.weight_output`. Not a count (not in COUNTED_ROLES), so not summed with pieces.
  "weight_output",
] as const;
export const ASSET_TAG_COUNT_BASIS_VALUES = ["unit", "cycle"] as const;
export const ASSET_TAG_COUNT_SIDE_VALUES = ["output", "input"] as const;
export const PRODUCT_CODE_CHANGE_ACTION_VALUES = ["add", "end", "delete"] as const;
