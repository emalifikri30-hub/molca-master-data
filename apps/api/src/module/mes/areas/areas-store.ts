import { ulid } from "ulidx";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { areaTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { CreateAreas, Areas, UpdateAreas } from "./areas.js";

const KEYS = ["id", "classId", "validTo", "code", "name", "siteId", "validFrom"];

type PaginateAreasInput = {
  limit: number;
  offset: number;
  q?: string;
};

class AreasStore {
  private repo?: EntityRepository<Areas>;
  private items: Areas[] = [
    { id: "area-1", code: "AREA_01", name: "Seasoning Line", siteId: "site-1" },
    { id: "area-2", code: "AREA_02", name: "Packaging Area", siteId: "site-1" },
    { id: "area-3", code: "AREA_03", name: "Warehouse", siteId: "site-1" },
    { id: "area-4", code: "AREA_04", name: "Mixing Line", siteId: "site-2" },
    { id: "area-5", code: "AREA_05", name: "Filling Area", siteId: "site-2" },
    { id: "area-6", code: "AREA_06", name: "Quality Lab", siteId: "site-3" },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<Areas>(deps, areaTable, KEYS);
  }

  async paginate({ limit, offset, q }: PaginateAreasInput): Promise<{
    items: Areas[];
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
  async all(): Promise<ReadonlyArray<Areas>> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<Areas | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  async create(input: CreateAreas): Promise<Areas> {
    const row: Areas = {
      id: ulid(),
      validFrom: new Date().toISOString().slice(0, 10),
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      siteId: input.siteId,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: UpdateAreas): Promise<Areas | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { AreasStore };
export type { PaginateAreasInput };
