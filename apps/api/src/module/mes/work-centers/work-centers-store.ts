import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { workCenterTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateWorkCenters, WorkCenters, UpdateWorkCenters } from "./work-centers.js";

const KEYS = ["id", "classId", "validTo", "code", "name", "areaId", "type", "validFrom"];

type PaginateWorkCentersInput = {
  limit: number;
  offset: number;
  q?: string;
};

class WorkCentersStore {
  private repo?: EntityRepository<WorkCenters>;
  private items: WorkCenters[] = [
    {
      id: "wc-1",
      code: "WC_01",
      name: "Packaging Line 1",
      areaId: "area-1",
      type: "production_line",
    },
    {
      id: "wc-7",
      code: "WC_07",
      name: "Blending Line",
      areaId: "area-1",
      type: "production_line",
    },
    {
      id: "wc-2",
      code: "WC_02",
      name: "Packaging Line 2",
      areaId: "area-2",
      type: "production_line",
    },
    {
      id: "wc-3",
      code: "WC_03",
      name: "Pallet Wrapping",
      areaId: "area-3",
      type: "process_cell",
    },
    {
      id: "wc-4",
      code: "WC_04",
      name: "Mixer 1",
      areaId: "area-4",
      type: "production_unit",
    },
    {
      id: "wc-5",
      code: "WC_05",
      name: "Filler A",
      areaId: "area-5",
      type: "production_line",
    },
    {
      id: "wc-6",
      code: "WC_06",
      name: "Sample Testing",
      areaId: "area-6",
      type: "process_cell",
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<WorkCenters>(deps, workCenterTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateWorkCentersInput): Promise<{
    items: WorkCenters[];
    totalElements: number;
  }> {
    if (this.repo) return this.repo.paginate({ limit, offset, q }, ["code", "name"]);
    let rows = this.items;
    if (q !== undefined && q !== "") {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (r) => r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle),
      );
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  /** Every row — for scope checks such as code uniqueness. */
  async all(): Promise<ReadonlyArray<WorkCenters>> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<WorkCenters | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateWorkCenters): Promise<WorkCenters> {
    const row: WorkCenters = {
      id: ulid(),
      validFrom: new Date().toISOString().slice(0, 10),
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      areaId: input.areaId,
      type: input.type,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateWorkCenters): Promise<WorkCenters | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { WorkCentersStore };
export type { PaginateWorkCentersInput };
