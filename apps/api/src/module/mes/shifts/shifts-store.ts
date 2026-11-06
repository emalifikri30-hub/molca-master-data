import { eq } from "drizzle-orm";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  enterpriseShiftTable,
  shiftInstanceTable,
  siteShiftTable,
} from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { EnterpriseShift, ShiftInstance, SiteShift } from "./shifts.js";

// Seeded with the real Molca answer (F-02 H-1): three company shifts; site-1
// has hours for Shift 1 and 2 only, so the "missing" state shows.
const SEED = "2026-01-01";

const ENTERPRISE_KEYS = ["id", "enterpriseId", "label", "validFrom", "validTo", "createdAt"];
const SITE_KEYS = [
  "id",
  "enterpriseShiftId",
  "siteId",
  "startTime",
  "endTime",
  "validFrom",
  "validTo",
];
const INSTANCE_KEYS = [
  "id",
  "siteShiftId",
  "siteId",
  "enterpriseShiftId",
  "businessDate",
  "startDatetime",
  "endDatetime",
  "status",
];

/**
 * Oldest first by creation time, ties by id. The repository's own `list` is
 * ordered by id only, which put "Shift 4" above "Shift 1" in the site tab.
 */
function oldestFirst(rows: EnterpriseShift[]): EnterpriseShift[] {
  const at = (row: EnterpriseShift) => new Date(row.createdAt ?? 0).getTime();
  return rows.sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

class ShiftsStore {
  private enterpriseRepo?: EntityRepository<EnterpriseShift>;
  private siteRepo?: EntityRepository<SiteShift>;
  private instanceRepo?: EntityRepository<ShiftInstance>;

  enterpriseShifts: EnterpriseShift[] = [
    { id: "es-1", enterpriseId: "ent-1", label: "Shift 1", validFrom: SEED, validTo: null },
    { id: "es-2", enterpriseId: "ent-1", label: "Shift 2", validFrom: SEED, validTo: null },
    { id: "es-3", enterpriseId: "ent-1", label: "Shift 3", validFrom: SEED, validTo: null },
  ];

  // H-1 hours in boundary form (H-9, PO 2026-10-02): `end_time` is the exclusive
  // end instant, so Shift 1 written 07:00–14:59 is stored 07:00–15:00.
  siteShifts: SiteShift[] = [
    {
      id: "ss-1",
      enterpriseShiftId: "es-1",
      siteId: "site-1",
      startTime: "07:00",
      endTime: "15:00",
      validFrom: SEED,
      validTo: null,
    },
    {
      id: "ss-2",
      enterpriseShiftId: "es-2",
      siteId: "site-1",
      startTime: "15:00",
      endTime: "23:00",
      validFrom: SEED,
      validTo: null,
    },
  ];

  instances: ShiftInstance[] = [];

  constructor(deps?: DbDeps) {
    this.enterpriseRepo = openRepo<EnterpriseShift>(deps, enterpriseShiftTable, ENTERPRISE_KEYS);
    this.siteRepo = openRepo<SiteShift>(deps, siteShiftTable, SITE_KEYS);
    this.instanceRepo = openRepo<ShiftInstance>(deps, shiftInstanceTable, INSTANCE_KEYS);
  }

  get persisted(): boolean {
    return this.enterpriseRepo !== undefined;
  }

  async listEnterprise(): Promise<EnterpriseShift[]> {
    // The in-memory seed keeps its insertion order (oldest first already).
    if (this.enterpriseRepo) return oldestFirst(await this.enterpriseRepo.list());
    return this.enterpriseShifts;
  }

  async insertEnterprise(row: EnterpriseShift): Promise<EnterpriseShift> {
    if (this.enterpriseRepo) return this.enterpriseRepo.insert(row);
    this.enterpriseShifts.push(row);
    return row;
  }

  async updateEnterprise(
    id: string,
    patch: Partial<EnterpriseShift>,
  ): Promise<EnterpriseShift | undefined> {
    if (this.enterpriseRepo) return this.enterpriseRepo.update(id, patch);
    const row = this.enterpriseShifts.find((s) => s.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  async listSite(): Promise<SiteShift[]> {
    if (this.siteRepo) return this.siteRepo.list();
    return this.siteShifts;
  }

  async insertSite(row: SiteShift): Promise<SiteShift> {
    if (this.siteRepo) return this.siteRepo.insert(row);
    this.siteShifts.push(row);
    return row;
  }

  async updateSite(id: string, patch: Partial<SiteShift>): Promise<SiteShift | undefined> {
    if (this.siteRepo) return this.siteRepo.update(id, patch);
    const row = this.siteShifts.find((s) => s.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }

  async listInstances(siteId?: string): Promise<ShiftInstance[]> {
    if (this.instanceRepo) {
      if (siteId) return this.instanceRepo.list(eq(shiftInstanceTable.siteId, siteId));
      return this.instanceRepo.list();
    }
    return siteId ? this.instances.filter((i) => i.siteId === siteId) : this.instances;
  }

  async insertInstance(row: ShiftInstance): Promise<ShiftInstance> {
    if (this.instanceRepo) return this.instanceRepo.insert(row);
    this.instances.push(row);
    return row;
  }
}

export { ShiftsStore };
