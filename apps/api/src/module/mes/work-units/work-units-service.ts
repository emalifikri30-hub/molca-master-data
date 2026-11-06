import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { assertCodeAvailable, isActiveRow } from "../site-hierarchy/hierarchy-rules.js";

import type { CreateWorkUnits, WorkUnits, WorkUnitsFilter, UpdateWorkUnits } from "./work-units.js";
import type { WorkUnitsStore } from "./work-units-store.js";

type PagedWorkUnitsResult = PagedResult<WorkUnits>;

type TWorkUnitsService = {
  getPaged: (page: number, size: number, filter: WorkUnitsFilter) => Promise<PagedWorkUnitsResult>;
  get: (id: string) => Promise<WorkUnits>;
  create: (input: CreateWorkUnits) => Promise<WorkUnits>;
  update: (id: string, patch: UpdateWorkUnits) => Promise<WorkUnits>;
};

type WorkUnitsServiceDeps = {
  workUnitsStore: WorkUnitsStore;
};

class WorkUnitsService implements TWorkUnitsService {
  private store: WorkUnitsStore;

  constructor({ workUnitsStore }: WorkUnitsServiceDeps) {
    this.store = workUnitsStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: WorkUnitsFilter,
  ): Promise<PagedWorkUnitsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<WorkUnits> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "work-units not found" });
    return row;
  }

  async create(input: CreateWorkUnits): Promise<WorkUnits> {
    await this.assertCodeAvailable(input.workCenterId, input.code);
    return this.store.create(input);
  }

  async update(id: string, patch: UpdateWorkUnits): Promise<WorkUnits> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "work-units not found" });
    await this.assertCodeAvailable(
      patch.workCenterId ?? current.workCenterId,
      patch.code ?? current.code,
      id,
    );
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "work-units not found" });
    return row;
  }

  /**
   * PRD-003 SIT-001 rule 2: a work unit code is unique among the active work
   * units of its work center (PO, 2026-10-21).
   */
  private async assertCodeAvailable(
    workCenterId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const siblings = (await this.store.all()).filter((r) => r.workCenterId === workCenterId);
    assertCodeAvailable(
      siblings.filter((r) => isActiveRow(r)),
      code,
      excludeId,
      siblings,
    );
  }
}

export { WorkUnitsService };
export type { TWorkUnitsService, WorkUnitsServiceDeps, PagedWorkUnitsResult };
