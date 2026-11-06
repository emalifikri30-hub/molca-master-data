import { and, eq, type SQL } from "drizzle-orm";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { kpiFormulaSlotTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { KpiFormulaSlot, KpiFormulaSlotFilter } from "./kpi-formula-slots.js";

type PaginateKpiFormulaSlotsInput = {
  limit: number;
  offset: number;
} & KpiFormulaSlotFilter;

const KEYS = ["slotId", "domain", "metric", "isoElement", "bindable", "required"];

// Seeded, closed catalog — F-07.1 §9.1 seed rows plus the two non-bindable
// rows from "Newly adopted KPIs (2026-09-10)". No create/update/delete.
// `db:seed` writes these same rows to the database (seed-fi2-kpi.ts).
const KPI_FORMULA_SLOT_SEED: ReadonlyArray<KpiFormulaSlot> = [
  // Spec seed cell reads "splits POT into planned/unplanned against PBT";
  // `APT` is the element code §9.1's field note and US-FND-KPI-008 AC-1 use.
  {
    slotId: "availability.downtime_reason",
    domain: "production",
    metric: "availability",
    isoElement: "APT",
    bindable: true,
    required: true,
  },
  {
    slotId: "quality.good",
    domain: "production",
    metric: "quality",
    isoElement: "GQ",
    bindable: true,
    required: true,
  },
  {
    slotId: "quality.total",
    domain: "production",
    metric: "quality",
    isoElement: "PQ",
    bindable: true,
    required: true,
  },
  {
    slotId: "quality.reject",
    domain: "production",
    metric: "quality",
    isoElement: "SQ",
    bindable: true,
    required: true,
  },
  // "PQ (Performance's own copy)"
  {
    slotId: "performance.output",
    domain: "production",
    metric: "performance",
    isoElement: "PQ",
    bindable: true,
    required: true,
  },
  // Helper: "resolves which OPERATION supplies PRI" — no direct ISO element.
  {
    slotId: "performance.product_code",
    domain: "production",
    metric: "performance",
    isoElement: null,
    bindable: true,
    required: true,
  },
  // "none — sanity check only" — optional (`required = false`, PO 2026-10-02).
  {
    slotId: "performance.speed_check",
    domain: "production",
    metric: "performance",
    isoElement: null,
    bindable: true,
    required: false,
  },
  // Shopfloor report input (F-07.1 point c, PO 2026-11-03): the weight output's
  // mass running total, bound on the last step's work unit. Optional, mass only.
  {
    slotId: "shopfloor.weight_output",
    domain: "production",
    metric: "shopfloor",
    isoElement: null,
    bindable: true,
    required: false,
  },
  // Computed from availability.downtime_reason's own closed events.
  {
    slotId: "reliability.interval",
    domain: "production",
    metric: "reliability",
    isoElement: "TBF/TTR",
    bindable: false,
    required: false,
  },
  // Read straight off WORK_ORDER_OPERATION.actual_start/actual_end.
  {
    slotId: "throughput.order_execution_time",
    domain: "production",
    metric: "throughput",
    isoElement: "AOET",
    bindable: false,
    required: false,
  },
  // Read straight off WORK_ORDER_OPERATION.rework_qty.
  {
    slotId: "rework.output",
    domain: "production",
    metric: "rework",
    isoElement: "RWQ",
    bindable: false,
    required: false,
  },
];

class KpiFormulaSlotsStore {
  private repo?: EntityRepository<KpiFormulaSlot>;
  private items: KpiFormulaSlot[] = [...KPI_FORMULA_SLOT_SEED];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<KpiFormulaSlot>(deps, kpiFormulaSlotTable, KEYS, "slotId");
  }

  async paginate({ limit, offset, metric, bindable }: PaginateKpiFormulaSlotsInput): Promise<{
    items: KpiFormulaSlot[];
    totalElements: number;
  }> {
    if (this.repo) {
      const conds: SQL[] = [];
      if (metric !== undefined) conds.push(eq(kpiFormulaSlotTable.metric, metric));
      if (bindable !== undefined) conds.push(eq(kpiFormulaSlotTable.bindable, bindable));
      const extra = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
      return this.repo.paginate({ limit, offset }, [], extra);
    }
    let rows = this.items;
    if (metric !== undefined) rows = rows.filter((r) => r.metric === metric);
    if (bindable !== undefined) rows = rows.filter((r) => r.bindable === bindable);
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(slotId: string): Promise<KpiFormulaSlot | undefined> {
    if (this.repo) return this.repo.get(slotId);
    return this.items.find((r) => r.slotId === slotId);
  }
}

export { KpiFormulaSlotsStore, KPI_FORMULA_SLOT_SEED };
export type { PaginateKpiFormulaSlotsInput };
