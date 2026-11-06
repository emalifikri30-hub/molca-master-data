import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { assertCodeAvailable, isActiveRow } from "../site-hierarchy/hierarchy-rules.js";

import type {
  CreateWorkCenters,
  WorkCenters,
  WorkCentersFilter,
  UpdateWorkCenters,
} from "./work-centers.js";
import type { WorkCentersStore } from "./work-centers-store.js";
import type { AreasStore } from "../areas/areas-store.js";

type PagedWorkCentersResult = PagedResult<WorkCenters>;

type TWorkCentersService = {
  getPaged: (
    page: number,
    size: number,
    filter: WorkCentersFilter,
  ) => Promise<PagedWorkCentersResult>;
  get: (id: string) => Promise<WorkCenters>;
  create: (input: CreateWorkCenters) => Promise<WorkCenters>;
  update: (id: string, patch: UpdateWorkCenters) => Promise<WorkCenters>;
};

type WorkCentersServiceDeps = {
  workCentersStore: WorkCentersStore;
  /** Resolves a work center's area to its site, for the code-uniqueness scope. */
  areasStore: AreasStore;
};

class WorkCentersService implements TWorkCentersService {
  private store: WorkCentersStore;
  private areasStore: AreasStore;

  constructor({ workCentersStore, areasStore }: WorkCentersServiceDeps) {
    this.store = workCentersStore;
    this.areasStore = areasStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: WorkCentersFilter,
  ): Promise<PagedWorkCentersResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<WorkCenters> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "work-centers not found" });
    return row;
  }

  async create(input: CreateWorkCenters): Promise<WorkCenters> {
    await this.assertCodeAvailable(input.areaId, input.code);
    return this.store.create(input);
  }

  async update(id: string, patch: UpdateWorkCenters): Promise<WorkCenters> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "work-centers not found" });
    await this.assertCodeAvailable(patch.areaId ?? current.areaId, patch.code ?? current.code, id);
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "work-centers not found" });
    return row;
  }

  /**
   * PRD-003 SIT-001 rule 2 (PO, 2026-10-21): a work center code is unique among
   * the active work centers of its own area. Two areas of one site may both have
   * a line L01. Retired work centers are left out of the code check only; the
   * segment clash (rule 9) still counts every sibling in the same area.
   */
  private async assertCodeAvailable(
    areaId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const area = await this.areasStore.get(areaId);
    if (!area) throw new HTTPException(404, { message: "areas not found" });
    const siblings = (await this.store.all()).filter((r) => r.areaId === areaId);
    assertCodeAvailable(
      siblings.filter((r) => isActiveRow(r)),
      code,
      excludeId,
      siblings,
    );
  }
}

export { WorkCentersService };
export type { TWorkCentersService, WorkCentersServiceDeps, PagedWorkCentersResult };
