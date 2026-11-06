import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { equipmentFlowTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type {
  CreateEquipmentFlows,
  EquipmentFlows,
  UpdateEquipmentFlows,
} from "./equipment-flows.js";

type PaginateEquipmentFlowsInput = {
  limit: number;
  offset: number;
  q?: string;
};

const KEYS = ["id", "workCenterId", "fromWorkUnitId", "toWorkUnitId", "validFrom", "validTo"];

class EquipmentFlowsStore {
  private repo?: EntityRepository<EquipmentFlows>;
  private items: EquipmentFlows[] = [
    {
      id: "flow-1",
      workCenterId: "wc-1",
      fromWorkUnitId: "wu-1",
      toWorkUnitId: "wu-2",
      validFrom: "2024-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<EquipmentFlows>(deps, equipmentFlowTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateEquipmentFlowsInput): Promise<{
    items: EquipmentFlows[];
    totalElements: number;
  }> {
    if (this.repo) {
      return this.repo.paginate({ limit, offset, q }, [
        "workCenterId",
        "fromWorkUnitId",
        "toWorkUnitId",
      ]);
    }
    let rows = this.items;
    if (q !== undefined && q !== "") {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.workCenterId.toLowerCase().includes(needle) ||
          r.fromWorkUnitId.toLowerCase().includes(needle) ||
          r.toWorkUnitId.toLowerCase().includes(needle),
      );
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<EquipmentFlows | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateEquipmentFlows): Promise<EquipmentFlows> {
    const row: EquipmentFlows = {
      id: ulid(),
      workCenterId: input.workCenterId,
      fromWorkUnitId: input.fromWorkUnitId,
      toWorkUnitId: input.toWorkUnitId,
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateEquipmentFlows): Promise<EquipmentFlows | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  /** Ends the row: sets valid_to. Master data is never hard-deleted (F-00). */
  async deactivate(id: string, validTo: string): Promise<EquipmentFlows | undefined> {
    return this.update(id, { validTo } as never);
  }
}

export { EquipmentFlowsStore };
export type { PaginateEquipmentFlowsInput };
