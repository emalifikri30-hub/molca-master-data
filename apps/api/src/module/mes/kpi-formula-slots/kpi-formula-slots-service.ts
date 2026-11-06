import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type { KpiFormulaSlot, KpiFormulaSlotFilter } from "./kpi-formula-slots.js";
import type { KpiFormulaSlotsStore } from "./kpi-formula-slots-store.js";

type PagedKpiFormulaSlotsResult = PagedResult<KpiFormulaSlot>;

type TKpiFormulaSlotsService = {
  getPaged: (
    page: number,
    size: number,
    filter: KpiFormulaSlotFilter,
  ) => Promise<PagedKpiFormulaSlotsResult>;
  get: (id: string) => Promise<KpiFormulaSlot>;
};

type KpiFormulaSlotsServiceDeps = {
  kpiFormulaSlotsStore: KpiFormulaSlotsStore;
};

class KpiFormulaSlotsService implements TKpiFormulaSlotsService {
  private store: KpiFormulaSlotsStore;

  constructor({ kpiFormulaSlotsStore }: KpiFormulaSlotsServiceDeps) {
    this.store = kpiFormulaSlotsStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: KpiFormulaSlotFilter,
  ): Promise<PagedKpiFormulaSlotsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, ...filter });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<KpiFormulaSlot> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "kpi-formula-slots not found" });
    return row;
  }
}

export { KpiFormulaSlotsService };
export type { TKpiFormulaSlotsService, KpiFormulaSlotsServiceDeps, PagedKpiFormulaSlotsResult };
