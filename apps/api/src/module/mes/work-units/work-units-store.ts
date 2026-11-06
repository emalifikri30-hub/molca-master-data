import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { workUnitTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateWorkUnits, WorkUnits, UpdateWorkUnits } from "./work-units.js";

const KEYS = ["id", "classId", "validTo", "code", "name", "workCenterId", "validFrom"];

type PaginateWorkUnitsInput = {
  limit: number;
  offset: number;
  q?: string;
};

class WorkUnitsStore {
  private repo?: EntityRepository<WorkUnits>;
  private items: WorkUnits[] = [
    { id: "wu-1", code: "WU_01", name: "Filler Cell", workCenterId: "wc-1" },
    { id: "wu-2", code: "WU_02", name: "Capping Cell", workCenterId: "wc-1" },
    { id: "wu-9", code: "WU_09", name: "Blender Cell", workCenterId: "wc-7" },
    { id: "wu-3", code: "WU_03", name: "Labeler Cell", workCenterId: "wc-2" },
    { id: "wu-4", code: "WU_04", name: "Carton Sealer", workCenterId: "wc-2" },
    { id: "wu-5", code: "WU_05", name: "Wrapper Unit", workCenterId: "wc-3" },
    { id: "wu-6", code: "WU_06", name: "Mixer Blade Unit", workCenterId: "wc-4" },
    { id: "wu-7", code: "WU_07", name: "Filler Nozzle Cell", workCenterId: "wc-5" },
    { id: "wu-8", code: "WU_08", name: "Titration Cell", workCenterId: "wc-6" },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<WorkUnits>(deps, workUnitTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateWorkUnitsInput): Promise<{
    items: WorkUnits[];
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
  async all(): Promise<ReadonlyArray<WorkUnits>> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<WorkUnits | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateWorkUnits): Promise<WorkUnits> {
    const row: WorkUnits = {
      id: ulid(),
      validFrom: new Date().toISOString().slice(0, 10),
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      workCenterId: input.workCenterId,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateWorkUnits): Promise<WorkUnits | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { WorkUnitsStore };
export type { PaginateWorkUnitsInput };
