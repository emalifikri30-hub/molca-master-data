// Production KPI master data for FI-2 (F-07.1 §9). Writes the closed
// KPI_FORMULA_SLOT and KPI_PARAMETERS catalogs, then the work-unit bindings
// the FI-2 tag sheet supports. Never touches the plant itself, so it can run
// on its own: `db:seed:kpi`.
//
// Bindings go through WorkUnitKpiBindingsService, so every row passes the
// same checks as the binding editor. A work unit uses the tags of every
// machine placed on it, primary or secondary (KPI-007 rule 2). A one-row slot
// is bound only when there is exactly one candidate tag, looked for on the
// primary machine first, then on the work unit's other machines:
// - performance.product_code ← the `product_code` tag, `none`;
// - availability.downtime_reason ← the `total` counter, `stall_bucket`;
// - quality.total and performance.output ← the `total` tag, `none`;
// - quality.good ← the `good` tag, quality.reject ← the `reject` tag, `none`.
// Quantity slots only count tags with a `uom_id` (F-04 §9.7) — the plant
// seed gives pack counters their station's pack unit, weights stay unitless.
// Two `good` tags leave the slot unbound: F-07.1 does not say which one is the
// station's count, and `quality.good` holds one binding. `quality.reject` is a
// list (K-13, PO 2026-10-02): every `reject` tag with a unit on every machine
// placed on the work unit is bound, one row each, and KPI-003 sums them. A
// `downtime_reason` bank is not bound: which of its tags label stops
// (`reason_match_enrich`) is the implementor's pick, not the seed's.
// performance.speed_check stays unbound: FI-2 has no `speed`/`runtime` tag.
// Catalog and FI-2 binding rows left in another region by an earlier seed
// (e.g. `local`) move to this run's region: the catalog row is re-homed, the
// stale bindings are dropped and bound again here.

import { and, eq, inArray, isNull, like, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { AssetPlacementsStore } from "../../module/mes/asset-placements/asset-placements-store.js";
import { AssetTagsStore } from "../../module/mes/asset-tags/asset-tags-store.js";
import {
  KPI_FORMULA_SLOT_SEED,
  KpiFormulaSlotsStore,
} from "../../module/mes/kpi-formula-slots/kpi-formula-slots-store.js";
import {
  KPI_PARAMETER_SEED,
  KpiParametersStore,
} from "../../module/mes/kpi-parameters/kpi-parameters-store.js";
import { WorkUnitKpiBindingsService } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-service.js";
import { WorkUnitKpiBindingsStore } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-store.js";
import { ReferenceDataStore } from "../../module/mes/reference-data/reference-data-store.js";
import { WorkUnitsStore } from "../../module/mes/work-units/work-units-store.js";
import { WorkMasterStore } from "../../module/mes/work-master/work-master-store.js";
import {
  assetPlacementTable,
  assetTagTable,
  kpiFormulaSlotTable,
  kpiParameterTable,
  workUnitKpiBindingTable,
  workUnitTable,
} from "./schema/schema.js";

import type { Transform } from "../../module/mes/kpi-formula-slots/kpi-formula-slots.js";
import type { PostgresDB } from "./postgres.js";

/** Same date the FI-2 placements start on (seed-fi2.ts). */
const VALID_FROM = "2026-02-03";

type BindingPick = {
  slotId: string;
  tagRole: string;
  kind?: string;
  transform: Transform;
  needsUnit?: boolean;
  /** A list slot (K-13): bind every candidate on every machine placed on the work unit. */
  everyMachine?: boolean;
};

const PICKS: BindingPick[] = [
  { slotId: "performance.product_code", tagRole: "product_code", transform: "none" },
  {
    slotId: "availability.downtime_reason",
    tagRole: "total",
    kind: "cumulative_counter",
    transform: "stall_bucket",
  },
  { slotId: "quality.total", tagRole: "total", transform: "none", needsUnit: true },
  { slotId: "quality.good", tagRole: "good", transform: "none", needsUnit: true },
  {
    slotId: "quality.reject",
    tagRole: "reject",
    transform: "none",
    needsUnit: true,
    everyMachine: true,
  },
  { slotId: "performance.output", tagRole: "total", transform: "none", needsUnit: true },
];

type KpiSeedResult = { slots: number; parameters: number; bound: number; skipped: string[] };

async function seedKpiCatalog(db: PostgresDB, region: string, tenantId: string) {
  const slots = await db
    .insert(kpiFormulaSlotTable)
    .values(KPI_FORMULA_SLOT_SEED.map((slot) => ({ ...slot, region, tenantId })))
    .onConflictDoUpdate({ target: kpiFormulaSlotTable.slotId, set: { region } })
    .returning({ id: kpiFormulaSlotTable.slotId });
  const parameters = await db
    .insert(kpiParameterTable)
    .values(KPI_PARAMETER_SEED.map((parameter) => ({ ...parameter, region, tenantId })))
    .onConflictDoUpdate({ target: kpiParameterTable.parameterId, set: { region } })
    .returning({ id: kpiParameterTable.parameterId });
  return { slots: slots.length, parameters: parameters.length };
}

async function seedFi2Kpi(
  db: PostgresDB,
  region: string,
  tenantId: string,
): Promise<KpiSeedResult> {
  const catalog = await seedKpiCatalog(db, region, tenantId);
  await db
    .delete(workUnitKpiBindingTable)
    .where(
      and(
        eq(workUnitKpiBindingTable.tenantId, tenantId),
        ne(workUnitKpiBindingTable.region, region),
        like(workUnitKpiBindingTable.workUnitId, "wu-fi2-%"),
      ),
    );

  const deps = { db, region };
  const bindingsStore = new WorkUnitKpiBindingsStore(deps);
  const service = new WorkUnitKpiBindingsService({
    workUnitKpiBindingsStore: bindingsStore,
    kpiFormulaSlotsStore: new KpiFormulaSlotsStore(deps),
    kpiParametersStore: new KpiParametersStore(deps),
    assetTagsStore: new AssetTagsStore(deps),
    assetPlacementsStore: new AssetPlacementsStore(deps),
    workUnitsStore: new WorkUnitsStore(deps),
    referenceDataStore: new ReferenceDataStore(deps),
    workMasterStore: new WorkMasterStore(deps),
  });

  const workUnits = await db
    .select({ id: workUnitTable.id, name: workUnitTable.name })
    .from(workUnitTable)
    .where(
      and(
        eq(workUnitTable.tenantId, tenantId),
        eq(workUnitTable.region, region),
        like(workUnitTable.id, "wu-fi2-%"),
      ),
    )
    .orderBy(workUnitTable.id);

  let bound = 0;
  const skipped: string[] = [];
  for (const workUnit of workUnits) {
    // Every machine placed on the work unit, primary or secondary: a work unit
    // binds the tags of whichever assets are placed on it (KPI-007 rule 2).
    const placed = await db
      .select({ assetId: assetPlacementTable.assetId, role: assetPlacementTable.placementRole })
      .from(assetPlacementTable)
      .where(
        and(
          eq(assetPlacementTable.tenantId, tenantId),
          eq(assetPlacementTable.region, region),
          eq(assetPlacementTable.workUnitId, workUnit.id),
          isNull(assetPlacementTable.validTo),
        ),
      );
    if (placed.length === 0) {
      skipped.push(`${workUnit.name}: no machine placed`);
      continue;
    }
    const primaryIds = new Set(placed.filter((p) => p.role === "primary").map((p) => p.assetId));
    const tags = await db
      .select({
        id: assetTagTable.id,
        assetId: assetTagTable.assetId,
        tagName: assetTagTable.tagName,
        tagRole: assetTagTable.tagRole,
        kind: assetTagTable.kind,
        uomId: assetTagTable.uomId,
      })
      .from(assetTagTable)
      .where(
        and(
          eq(assetTagTable.tenantId, tenantId),
          eq(assetTagTable.region, region),
          inArray(
            assetTagTable.assetId,
            placed.map((p) => p.assetId),
          ),
          isNull(assetTagTable.validTo),
        ),
      );

    for (const pick of PICKS.filter((p) => p.everyMachine)) {
      const already = await bindingsStore.findAllActive(workUnit.id, pick.slotId);
      const candidates = tags.filter(
        (tag) =>
          tag.tagRole === pick.tagRole &&
          (!pick.needsUnit || Boolean(tag.uomId)) &&
          !already.some((b) => b.assetTagId === tag.id),
      );
      for (const tag of candidates) {
        try {
          await service.create({
            workUnitId: workUnit.id,
            slotId: pick.slotId,
            assetTagId: tag.id,
            transform: pick.transform,
            validFrom: VALID_FROM,
          });
          bound += 1;
        } catch (error) {
          if (!(error instanceof HTTPException)) throw error;
          skipped.push(`${workUnit.name} ${pick.slotId}: ${error.message}`);
        }
      }
    }

    for (const pick of PICKS.filter((p) => !p.everyMachine)) {
      if (await bindingsStore.findActive(workUnit.id, pick.slotId)) continue;
      const matches = tags.filter(
        (tag) =>
          tag.tagRole === pick.tagRole &&
          (!pick.kind || tag.kind === pick.kind) &&
          (!pick.needsUnit || Boolean(tag.uomId)),
      );
      // The primary machine's tag wins; without one, a single tag on the
      // work unit's other machines is the only candidate.
      const onPrimary = matches.filter((tag) => primaryIds.has(tag.assetId));
      const candidates = onPrimary.length > 0 ? onPrimary : matches;
      if (candidates.length !== 1) {
        const unit = pick.needsUnit ? " with a unit" : "";
        const names =
          candidates.length > 1 ? ` (${candidates.map((t) => t.tagName).join(", ")})` : "";
        skipped.push(
          `${workUnit.name} ${pick.slotId}: ${candidates.length} "${pick.tagRole}" tags${unit} on ${onPrimary.length > 0 ? "the primary machine" : "the placed machines"}${names}`,
        );
        continue;
      }
      try {
        await service.create({
          workUnitId: workUnit.id,
          slotId: pick.slotId,
          assetTagId: candidates[0].id,
          transform: pick.transform,
          validFrom: VALID_FROM,
        });
        bound += 1;
      } catch (error) {
        if (!(error instanceof HTTPException)) throw error;
        skipped.push(`${workUnit.name} ${pick.slotId}: ${error.message}`);
      }
    }
  }
  return { ...catalog, bound, skipped };
}

export { seedFi2Kpi };
export type { KpiSeedResult };
