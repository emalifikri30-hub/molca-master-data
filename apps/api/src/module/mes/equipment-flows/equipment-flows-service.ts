import { refusal } from "../../../shared/errors/refusal.js";
import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type {
  CreateEquipmentFlows,
  EquipmentFlows,
  EquipmentFlowsFilter,
  UpdateEquipmentFlows,
} from "./equipment-flows.js";
import type { EquipmentFlowsStore } from "./equipment-flows-store.js";

type PagedEquipmentFlowsResult = PagedResult<EquipmentFlows>;

type TEquipmentFlowsService = {
  getPaged: (
    page: number,
    size: number,
    filter: EquipmentFlowsFilter,
  ) => Promise<PagedEquipmentFlowsResult>;
  get: (id: string) => Promise<EquipmentFlows>;
  create: (input: CreateEquipmentFlows) => Promise<EquipmentFlows>;
  update: (id: string, patch: UpdateEquipmentFlows) => Promise<EquipmentFlows>;
  deactivate: (id: string) => Promise<EquipmentFlows>;
};

type EquipmentFlowsServiceDeps = {
  equipmentFlowsStore: EquipmentFlowsStore;
};

class EquipmentFlowsService implements TEquipmentFlowsService {
  private store: EquipmentFlowsStore;

  constructor({ equipmentFlowsStore }: EquipmentFlowsServiceDeps) {
    this.store = equipmentFlowsStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: EquipmentFlowsFilter,
  ): Promise<PagedEquipmentFlowsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<EquipmentFlows> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "equipment-flows not found" });
    return row;
  }

  async create(input: CreateEquipmentFlows): Promise<EquipmentFlows> {
    return this.store.create(input);
  }

  async update(id: string, patch: UpdateEquipmentFlows): Promise<EquipmentFlows> {
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "equipment-flows not found" });
    return row;
  }

  /** F-00 / F-14: never hard-deleted — deactivation sets valid_to (today). */
  async deactivate(id: string): Promise<EquipmentFlows> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "equipment-flows not found" });
    if (current.validTo != null) throw refusal(422, "already_inactive", { id });
    const row = await this.store.deactivate(id, new Date().toISOString().slice(0, 10));
    if (!row) throw new HTTPException(404, { message: "equipment-flows not found" });
    return row;
  }
}

export { EquipmentFlowsService };
export type { TEquipmentFlowsService, EquipmentFlowsServiceDeps, PagedEquipmentFlowsResult };
