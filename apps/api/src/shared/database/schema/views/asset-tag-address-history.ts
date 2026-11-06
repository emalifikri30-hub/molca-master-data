import { and, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

import { assetPlacementTable } from "../asset/asset-placement.js";
import { assetTagTable } from "../asset/asset-tags.js";
import { assetTable } from "../asset/asset.js";
import { masterData } from "../columns.js";
import { dataSourceTable } from "../data-source/data-source.js";
import { areaTable } from "../equipment-hierarchy/area.js";
import { enterpriseTable } from "../equipment-hierarchy/enterprise.js";
import { siteTable } from "../equipment-hierarchy/site.js";
import { workCenterTable } from "../equipment-hierarchy/work-center.js";
import { workUnitTable } from "../equipment-hierarchy/work-unit.js";

// F-04 §9.7.1 rule 10 (PO 2026-10-03, docs-molcadx#84): each tag's address
// per placement period, for recalculating past shifts — the address that was
// valid at a reading's time. One row per tag × placement of its machine whose
// validity overlaps the tag's; `valid_from`/`valid_to` are the overlap
// (half-open, NULL = open). A per-lane tag (`work_unit_id` set) only takes
// placements on its own lane. Same formula as asset-tag-address.ts and
// module/mes/asset-tags/generated-address.ts — keep the copies in step. Codes
// are today's: a past code rename is in the audit trail, not here.

const clean = (code: p.PgColumn): SQL => sql`regexp_replace(${code}, '[^A-Za-z0-9_]', '_', 'g')`;

export const assetTagAddressHistoryView = masterData.view("asset_tag_address_history").as((qb) => {
  const sameRegion = (region: p.PgColumn) => eq(region, assetTagTable.region);
  const path = sql<
    string | null
  >`case when ${enterpriseTable.id} is not null and ${assetTable.assetTag} <> '' and ${assetTagTable.tagName} <> '' then ${clean(enterpriseTable.code)} || '/' || ${clean(siteTable.code)} || '/' || ${clean(areaTable.code)} || '/' || ${clean(workCenterTable.code)} || '/' || ${clean(workUnitTable.code)} || '/' || ${clean(assetTable.assetTag)} || '/' || ${assetTagTable.tagName} end`;
  return qb
    .select({
      assetTagId: sql<string>`${assetTagTable.id}`.as("asset_tag_id"),
      region: assetTagTable.region,
      assetId: assetTagTable.assetId,
      placementId: sql<string>`${assetPlacementTable.id}`.as("placement_id"),
      tagName: assetTagTable.tagName,
      tagRole: assetTagTable.tagRole,
      dataSourceId: assetTagTable.dataSourceId,
      workUnitId: sql<string | null>`${workUnitTable.id}`.as("work_unit_id"),
      workCenterId: sql<string | null>`${workCenterTable.id}`.as("work_center_id"),
      areaId: sql<string | null>`${areaTable.id}`.as("area_id"),
      siteId: sql<string | null>`${siteTable.id}`.as("site_id"),
      enterpriseId: sql<string | null>`${enterpriseTable.id}`.as("enterprise_id"),
      node: sql<string | null>`case
          when ${dataSourceTable.nodeNaming} = 'manual' then nullif(${assetTagTable.node}, '')
          when ${dataSourceTable.nodeNaming} = 'generated' and ${dataSourceTable.protocol} = 'opcua' and (${path}) is not null
            then 'nsu=' || ${dataSourceTable.namespaceUri} || ';s=' || (${path})
          when ${dataSourceTable.nodeNaming} = 'generated' and ${dataSourceTable.protocol} = 'mqtt' and (${path}) is not null
            then case when ${dataSourceTable.topicRoot} = '' then '' else ${dataSourceTable.topicRoot} || '/' end || (${path})
        end`.as("node"),
      // LEAST/GREATEST skip NULLs, so an open end (NULL) gives way to the other.
      validFrom:
        sql<string>`greatest(${assetTagTable.validFrom}, ${assetPlacementTable.validFrom})`.as(
          "valid_from",
        ),
      validTo: sql<
        string | null
      >`least(${assetTagTable.validTo}, ${assetPlacementTable.validTo})`.as("valid_to"),
    })
    .from(assetTagTable)
    .innerJoin(
      assetPlacementTable,
      and(
        eq(assetPlacementTable.region, assetTagTable.region),
        eq(assetPlacementTable.assetId, assetTagTable.assetId),
        or(
          isNull(assetTagTable.workUnitId),
          eq(assetTagTable.workUnitId, ""),
          eq(assetPlacementTable.workUnitId, assetTagTable.workUnitId),
        ),
        or(isNull(assetTagTable.validTo), lt(assetPlacementTable.validFrom, assetTagTable.validTo)),
        or(
          isNull(assetPlacementTable.validTo),
          lt(assetTagTable.validFrom, assetPlacementTable.validTo),
        ),
      ),
    )
    .leftJoin(
      dataSourceTable,
      and(eq(dataSourceTable.id, assetTagTable.dataSourceId), sameRegion(dataSourceTable.region)),
    )
    .leftJoin(
      assetTable,
      and(eq(assetTable.id, assetTagTable.assetId), sameRegion(assetTable.region)),
    )
    .leftJoin(
      workUnitTable,
      and(eq(workUnitTable.id, assetPlacementTable.workUnitId), sameRegion(workUnitTable.region)),
    )
    .leftJoin(
      workCenterTable,
      and(eq(workCenterTable.id, workUnitTable.workCenterId), sameRegion(workCenterTable.region)),
    )
    .leftJoin(
      areaTable,
      and(eq(areaTable.id, workCenterTable.areaId), sameRegion(areaTable.region)),
    )
    .leftJoin(siteTable, and(eq(siteTable.id, areaTable.siteId), sameRegion(siteTable.region)))
    .leftJoin(
      enterpriseTable,
      and(eq(enterpriseTable.id, siteTable.enterpriseId), sameRegion(enterpriseTable.region)),
    );
});
