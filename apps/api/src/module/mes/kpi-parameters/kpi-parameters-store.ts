import { and, eq, type SQL } from "drizzle-orm";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { kpiParameterTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { TagRole } from "../asset-tags/asset-tags.js";
import type { Transform } from "../kpi-formula-slots/kpi-formula-slots.js";
import type { KpiParameter, KpiParameterFilter } from "./kpi-parameters.js";

type PaginateKpiParametersInput = {
  limit: number;
  offset: number;
} & KpiParameterFilter;

const KEYS = ["parameterId", "slotId", "tagRole", "transform", "rank", "validFrom", "validTo"];
const SEED_FROM = "2026-01-01";

function row(
  parameterId: string,
  slotId: string,
  tagRole: TagRole,
  transform: Transform,
): KpiParameter {
  return {
    parameterId,
    slotId,
    tagRole,
    transform,
    rank: null,
    validFrom: SEED_FROM,
    validTo: null,
  };
}

/** True when the row is legal on `date` (validTo is exclusive). */
function activeOn(r: KpiParameter, date: string): boolean {
  return r.validFrom <= date && (r.validTo === null || date < r.validTo);
}

// PROVISIONAL SEED — pending foundation-domain confirmation. F-07.1 §9.3
// says every tag_role → slot mapping in the per-metric tables is "a
// KPI_PARAMETERS row waiting to be seeded" but does not restate them as
// data. Only pairs the spec states outright (§9.2 "Feeds" column, the
// per-metric tag_role tables, the §9.4 worked example) are seeded here.
// Deliberately left out because the spec does not say which tag_role
// carries them, or they need a binding shape §9.4 does not have:
// - complement_derive / reconcile_check (2–3 same-asset quantities, no
//   single tag_role named; US-FND-KPI-007 AC-5b therefore has no legal row yet)
// - segment_and_sum (performance.output, "1–2" tags, role not named)
// - counter_to_duration (performance.speed_check, counter role not named)
// - machine_state / runtime on availability.downtime_reason (listed as
//   candidate roles, but no transform is stated for them)
// - interval_mean (reliability.interval is bindable = false, no tag_role)
// `rank` is null everywhere: the spec's only ranking example (good+total,
// then total+reject, then good+reject) ranks pairs, not single rows.
// `db:seed` writes these same rows to the database (seed-fi2-kpi.ts).
const KPI_PARAMETER_SEED: ReadonlyArray<KpiParameter> = [
  // availability.downtime_reason — the four competing timing transforms
  // (§9.2) plus the label-only enrichment.
  row("kp-1", "availability.downtime_reason", "downtime_reason", "none"),
  row("kp-2", "availability.downtime_reason", "downtime_reason", "reason_tag_drives_stop"),
  row("kp-3", "availability.downtime_reason", "total", "stall_bucket"),
  row("kp-4", "availability.downtime_reason", "speed", "range_bucket"),
  row("kp-5", "availability.downtime_reason", "downtime_reason", "reason_match_enrich"),
  // quality.* — the tag already is the value, or needs a unit conversion
  // ("any quantity slot"), or two-station infeed − outfeed on `total` tags.
  row("kp-6", "quality.good", "good", "none"),
  row("kp-7", "quality.good", "good", "unit_convert"),
  row("kp-8", "quality.good", "total", "infeed_outfeed_derive"),
  row("kp-9", "quality.total", "total", "none"),
  row("kp-10", "quality.total", "total", "unit_convert"),
  row("kp-11", "quality.reject", "reject", "none"),
  row("kp-12", "quality.reject", "reject", "unit_convert"),
  row("kp-13", "quality.reject", "total", "infeed_outfeed_derive"),
  // performance.* — "Actual output: total, or good + reject"; reverse
  // table: good feeds Performance "if used as output".
  row("kp-14", "performance.output", "total", "none"),
  row("kp-15", "performance.output", "total", "unit_convert"),
  row("kp-16", "performance.output", "good", "none"),
  row("kp-17", "performance.output", "good", "unit_convert"),
  row("kp-18", "performance.product_code", "product_code", "none"),
  row("kp-19", "performance.speed_check", "speed", "speed_vs_standard_check"),
  row("kp-20", "performance.speed_check", "runtime", "speed_vs_standard_check"),
  // F-07.1 (PO 2026-10-01): an activity signal (motor current, vibration…)
  // times downtime by its normal band, like `speed` (kp-4). Availability only.
  row("kp-21", "availability.downtime_reason", "activity_signal", "range_bucket"),
  // PO 2026-11-03 (KPI-007 rule 7): the weight output's mass running total, kg or g.
  // The unit check is in the binding service (refusal kpi-002.shopfloor.weight.unit-refused).
  row("kp-22", "shopfloor.weight_output", "weight_output", "unit_convert"),
];

class KpiParametersStore {
  private repo?: EntityRepository<KpiParameter>;
  private items: KpiParameter[] = [...KPI_PARAMETER_SEED];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<KpiParameter>(deps, kpiParameterTable, KEYS, "parameterId");
  }

  async paginate({ limit, offset, slotId, tagRole }: PaginateKpiParametersInput): Promise<{
    items: KpiParameter[];
    totalElements: number;
  }> {
    if (this.repo) {
      const conds: SQL[] = [];
      if (slotId !== undefined && slotId !== "") conds.push(eq(kpiParameterTable.slotId, slotId));
      if (tagRole !== undefined) conds.push(eq(kpiParameterTable.tagRole, tagRole));
      const extra = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
      return this.repo.paginate({ limit, offset }, [], extra);
    }
    let rows = this.items;
    if (slotId !== undefined && slotId !== "") rows = rows.filter((r) => r.slotId === slotId);
    if (tagRole !== undefined) rows = rows.filter((r) => r.tagRole === tagRole);
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(parameterId: string): Promise<KpiParameter | undefined> {
    if (this.repo) return this.repo.get(parameterId);
    return this.items.find((r) => r.parameterId === parameterId);
  }

  /** Every row legal for `slotId` on `date`. */
  async forSlot(slotId: string, date: string): Promise<KpiParameter[]> {
    const rows = this.repo
      ? await this.repo.list(eq(kpiParameterTable.slotId, slotId))
      : this.items.filter((r) => r.slotId === slotId);
    return rows.filter((r) => activeOn(r, date));
  }

  /** The row that makes (slot, tag role, transform) legal on `date`, if any. */
  async findLegal(
    slotId: string,
    tagRole: TagRole,
    transform: Transform,
    date: string,
  ): Promise<KpiParameter | undefined> {
    const rows = await this.forSlot(slotId, date);
    return rows.find((r) => r.tagRole === tagRole && r.transform === transform);
  }
}

export { KpiParametersStore, KPI_PARAMETER_SEED };
export type { PaginateKpiParametersInput };
