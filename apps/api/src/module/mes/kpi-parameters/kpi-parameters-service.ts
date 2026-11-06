import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type { KpiParameter, KpiParameterFilter } from "./kpi-parameters.js";
import type { KpiParametersStore } from "./kpi-parameters-store.js";

type PagedKpiParametersResult = PagedResult<KpiParameter>;

type TKpiParametersService = {
  getPaged: (
    page: number,
    size: number,
    filter: KpiParameterFilter,
  ) => Promise<PagedKpiParametersResult>;
  get: (parameterId: string) => Promise<KpiParameter>;
};

type KpiParametersServiceDeps = {
  kpiParametersStore: KpiParametersStore;
};

/** Read-only — KPI_PARAMETERS is never implementor-writable (F-07.1 K-1/K-7). */
class KpiParametersService implements TKpiParametersService {
  private store: KpiParametersStore;

  constructor({ kpiParametersStore }: KpiParametersServiceDeps) {
    this.store = kpiParametersStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: KpiParameterFilter,
  ): Promise<PagedKpiParametersResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, ...filter });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(parameterId: string): Promise<KpiParameter> {
    const row = await this.store.get(parameterId);
    if (!row) throw new HTTPException(404, { message: "kpi-parameters not found" });
    return row;
  }
}

export { KpiParametersService };
export type { TKpiParametersService, KpiParametersServiceDeps, PagedKpiParametersResult };
