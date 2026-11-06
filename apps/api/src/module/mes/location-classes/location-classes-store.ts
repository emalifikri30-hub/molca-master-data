import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  areaClassTable,
  siteClassTable,
  workCenterClassTable,
  workUnitClassTable,
} from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { ClassLevel, LocationClass } from "./location-classes.js";

type ClassRow = {
  id: string;
  code: string;
  name: string;
  validFrom: string;
  validTo: string | null;
};

const KEYS = ["id", "code", "name", "validFrom", "validTo"];

// Real class values wait on S-5, so the lists start empty.
class LocationClassesStore {
  private repos: Partial<Record<ClassLevel, EntityRepository<ClassRow>>>;
  items: LocationClass[] = [];

  constructor(deps?: DbDeps) {
    this.repos = {
      site: openRepo<ClassRow>(deps, siteClassTable, KEYS),
      area: openRepo<ClassRow>(deps, areaClassTable, KEYS),
      "work-center": openRepo<ClassRow>(deps, workCenterClassTable, KEYS),
      "work-unit": openRepo<ClassRow>(deps, workUnitClassTable, KEYS),
    };
  }

  async list(level: ClassLevel): Promise<LocationClass[]> {
    const repo = this.repos[level];
    if (repo) {
      const rows = await repo.list();
      return rows.map((row) => ({ ...row, level }));
    }
    return this.items.filter((c) => c.level === level);
  }

  async get(id: string): Promise<LocationClass | undefined> {
    for (const level of ["site", "area", "work-center", "work-unit"] as const) {
      const repo = this.repos[level];
      if (!repo) continue;
      const row = await repo.get(id);
      if (row) return { ...row, level };
    }
    return this.items.find((c) => c.id === id);
  }

  async insert(row: LocationClass): Promise<LocationClass> {
    const repo = this.repos[row.level];
    if (repo) {
      await repo.insert({
        id: row.id,
        code: row.code,
        name: row.name,
        validFrom: row.validFrom,
        validTo: row.validTo,
      });
      return row;
    }
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    level: ClassLevel,
    patch: Partial<Pick<LocationClass, "code" | "name" | "validTo">>,
  ): Promise<LocationClass | undefined> {
    const repo = this.repos[level];
    if (repo) {
      const updated = await repo.update(id, patch);
      return updated ? { ...updated, level } : undefined;
    }
    const row = this.items.find((c) => c.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { LocationClassesStore };
