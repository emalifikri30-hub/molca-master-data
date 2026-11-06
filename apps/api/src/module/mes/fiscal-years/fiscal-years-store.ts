import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { fiscalYearTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { FiscalYear } from "./fiscal-years.js";

const KEYS = [
  "id",
  "enterpriseId",
  "label",
  "calendarBasis",
  "startMonth",
  "endMonth",
  "periodPattern",
  "startDate",
  "endDate",
  "lineageId",
  "previousVersionId",
  "validFrom",
  "validTo",
];

// Seeded with the current year of enterprise ent-1. Ended versions stay.
class FiscalYearsStore {
  private repo?: EntityRepository<FiscalYear>;
  items: FiscalYear[] = [
    {
      id: "fy-1",
      enterpriseId: "ent-1",
      label: "FY2026",
      calendarBasis: "monthly",
      startMonth: 1,
      endMonth: 12,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      validFrom: "2026-01-01",
      validTo: null,
      lineageId: "fy-1",
      previousVersionId: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<FiscalYear>(deps, fiscalYearTable, KEYS);
  }

  async list(): Promise<FiscalYear[]> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async insert(row: FiscalYear): Promise<FiscalYear> {
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: Partial<FiscalYear>): Promise<FiscalYear | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((fy) => fy.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { FiscalYearsStore };
