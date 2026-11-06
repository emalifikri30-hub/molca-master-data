import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
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

// Each tag's resolved address (F-04 §9.7.1 `generated_node`, DSR-001 §4), for
// the services that read tags straight from the database. Derived on read,
// never stored. Same formula as module/mes/asset-tags/generated-address.ts —
// keep the copies in step:
//   clean(x) = every character that is not a letter, digit or _ becomes _
//   path     = clean(enterprise)/clean(site)/clean(area)/clean(work_center)/
//              clean(work_unit)/clean(asset_tag)/tag_name
//   opcua    = "nsu=" + namespace_uri + ";s=" + path
//   mqtt     = [topic_root + "/"] + path
// The work unit is the tag's own lane when the machine has an active placement
// there, else the machine's only active placement (DSR-001 rule 12). With no
// such placement, or a `manual` source with no typed node, `node` is NULL
// (rule 13: no address, never a stale one).

const clean = (code: p.PgColumn): SQL => sql`regexp_replace(${code}, '[^A-Za-z0-9_]', '_', 'g')`;

export const assetTagAddressView = masterData.view("asset_tag_address").as((qb) => {
  // Active placements with how many each machine has, joined twice: as the
  // tag's own lane, and as the machine's only placement.
  const activePlacements = <N extends string>(name: N) =>
    qb.$with(name).as(
      qb
        .select({
          region: assetPlacementTable.region,
          assetId: assetPlacementTable.assetId,
          workUnitId: assetPlacementTable.workUnitId,
          placements:
            sql<number>`count(*) over (partition by ${assetPlacementTable.region}, ${assetPlacementTable.assetId})`.as(
              "placements",
            ),
        })
        .from(assetPlacementTable)
        .where(isNull(assetPlacementTable.validTo)),
    );
  const own = activePlacements("own");
  const only = activePlacements("only");
  const workUnitId = sql<string | null>`coalesce(${own.workUnitId}, ${only.workUnitId})`;
  const sameRegion = (region: p.PgColumn) => eq(region, assetTagTable.region);

  // Step 1: each tag with its data source, lane and the cleaned path (NULL
  // when the placement path or a name is missing).
  const resolved = qb.$with("resolved").as(
    qb
      .with(own, only)
      .select({
        assetTagId: sql<string>`${assetTagTable.id}`.as("asset_tag_id"),
        region: assetTagTable.region,
        assetId: assetTagTable.assetId,
        assetTag: assetTable.assetTag,
        tagName: assetTagTable.tagName,
        kind: assetTagTable.kind,
        tagRole: assetTagTable.tagRole,
        uomId: assetTagTable.uomId,
        countBasis: assetTagTable.countBasis,
        dataSourceId: assetTagTable.dataSourceId,
        protocol: dataSourceTable.protocol,
        nodeNaming: dataSourceTable.nodeNaming,
        namespaceUri: dataSourceTable.namespaceUri,
        topicRoot: dataSourceTable.topicRoot,
        typedNode: sql<string>`${assetTagTable.node}`.as("typed_node"),
        workUnitId: sql<string | null>`${workUnitTable.id}`.as("work_unit_id"),
        workCenterId: sql<string | null>`${workCenterTable.id}`.as("work_center_id"),
        areaId: sql<string | null>`${areaTable.id}`.as("area_id"),
        siteId: sql<string | null>`${siteTable.id}`.as("site_id"),
        enterpriseId: sql<string | null>`${enterpriseTable.id}`.as("enterprise_id"),
        path: sql<
          string | null
        >`case when ${enterpriseTable.id} is not null and ${assetTable.assetTag} <> '' and ${assetTagTable.tagName} <> '' then ${clean(enterpriseTable.code)} || '/' || ${clean(siteTable.code)} || '/' || ${clean(areaTable.code)} || '/' || ${clean(workCenterTable.code)} || '/' || ${clean(workUnitTable.code)} || '/' || ${clean(assetTable.assetTag)} || '/' || ${assetTagTable.tagName} end`.as(
          "path",
        ),
        validFrom: assetTagTable.validFrom,
        validTo: assetTagTable.validTo,
      })
      .from(assetTagTable)
      .leftJoin(
        own,
        and(
          eq(own.region, assetTagTable.region),
          eq(own.assetId, assetTagTable.assetId),
          ne(assetTagTable.workUnitId, ""),
          eq(own.workUnitId, assetTagTable.workUnitId),
        ),
      )
      .leftJoin(
        only,
        and(
          eq(only.region, assetTagTable.region),
          eq(only.assetId, assetTagTable.assetId),
          eq(only.placements, 1),
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
        and(eq(workUnitTable.id, workUnitId), sameRegion(workUnitTable.region)),
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
      ),
  );

  // Step 2: the node per the source's naming and protocol.
  return qb
    .with(resolved)
    .select({
      assetTagId: resolved.assetTagId,
      region: resolved.region,
      assetId: resolved.assetId,
      assetTag: resolved.assetTag,
      tagName: resolved.tagName,
      kind: resolved.kind,
      tagRole: resolved.tagRole,
      uomId: resolved.uomId,
      countBasis: resolved.countBasis,
      dataSourceId: resolved.dataSourceId,
      protocol: resolved.protocol,
      nodeNaming: resolved.nodeNaming,
      workUnitId: resolved.workUnitId,
      workCenterId: resolved.workCenterId,
      areaId: resolved.areaId,
      siteId: resolved.siteId,
      enterpriseId: resolved.enterpriseId,
      path: resolved.path,
      node: sql<string | null>`case
        when ${resolved.nodeNaming} = 'manual' then nullif(${resolved.typedNode}, '')
        when ${resolved.nodeNaming} = 'generated' and ${resolved.protocol} = 'opcua' and ${resolved.path} is not null
          then 'nsu=' || ${resolved.namespaceUri} || ';s=' || ${resolved.path}
        when ${resolved.nodeNaming} = 'generated' and ${resolved.protocol} = 'mqtt' and ${resolved.path} is not null
          then case when ${resolved.topicRoot} = '' then '' else ${resolved.topicRoot} || '/' end || ${resolved.path}
      end`.as("node"),
      validFrom: resolved.validFrom,
      validTo: resolved.validTo,
    })
    .from(resolved);
});
