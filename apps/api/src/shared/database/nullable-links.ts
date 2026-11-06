/**
 * Optional links (and optional enum values) stored as NULL, not "" (#18:
 * "" rules out real foreign keys, and an enum column can't hold ""). The domain keeps "" for "none" — what the API, the web and the
 * rules compare against — and EntityRepository translates at the boundary:
 * "" → NULL on write, NULL → "" on read, for these columns only.
 */
const NULLABLE_LINKS: Record<string, ReadonlyArray<string>> = {
  site: ["classId"],
  area: ["classId"],
  work_center: ["classId"],
  work_unit: ["classId"],
  asset_class: ["parentClassId"],
  asset: ["assetTypeId", "parentAssetId"],
  // Optional enums too: "" in the domain, NULL in the enum column.
  asset_tags: [
    "workUnitId",
    "rejectReasonId",
    "downtimeReasonId",
    "uomId",
    "countBasis",
    "countSide",
    // Nullable only for seeded signals with no F-04 role (docs-molcadx#85).
    "tagRole",
  ],
};

function nullableLinks(table: string): ReadonlySet<string> {
  return new Set(NULLABLE_LINKS[table] ?? []);
}

export { nullableLinks };
