// F-01 §9.14 — reads the five levels for the tree in five queries (one per level, no N+1).
// Its own key lists: they include validFrom/validTo, which the per-level reads do not
// return for every level. The per-level repositories are not changed.
import {
  EntityRepository,
  type EntityRepositoryDeps,
} from "../../../shared/database/entity-repository.js";
import {
  areaTable,
  enterpriseTable,
  siteTable,
  workCenterTable,
  workUnitTable,
} from "../../../shared/database/schema/schema.js";

import type { HierarchyRows } from "./hierarchy-tree.js";

const ENTERPRISE_KEYS = ["id", "code", "name", "validFrom", "validTo"];
const SITE_KEYS = ["id", "code", "name", "enterpriseId", "validFrom", "validTo"];
const AREA_KEYS = ["id", "code", "name", "siteId", "validFrom", "validTo"];
const WORK_CENTER_KEYS = ["id", "code", "name", "areaId", "validFrom", "validTo"];
const WORK_UNIT_KEYS = ["id", "code", "name", "workCenterId", "validFrom", "validTo"];

/** Tenant-scoped: `list()` filters every level by the current tenant (F-00 rule 6). */
class HierarchyTreeRepository {
  private enterprises: EntityRepository<HierarchyRows["enterprises"][number]>;
  private sites: EntityRepository<HierarchyRows["sites"][number]>;
  private areas: EntityRepository<HierarchyRows["areas"][number]>;
  private workCenters: EntityRepository<HierarchyRows["workCenters"][number]>;
  private workUnits: EntityRepository<HierarchyRows["workUnits"][number]>;

  constructor({ db, region }: EntityRepositoryDeps) {
    const deps = { db, region };
    this.enterprises = new EntityRepository(deps, enterpriseTable as never, ENTERPRISE_KEYS);
    this.sites = new EntityRepository(deps, siteTable as never, SITE_KEYS);
    this.areas = new EntityRepository(deps, areaTable as never, AREA_KEYS);
    this.workCenters = new EntityRepository(deps, workCenterTable as never, WORK_CENTER_KEYS);
    this.workUnits = new EntityRepository(deps, workUnitTable as never, WORK_UNIT_KEYS);
  }

  /** Every row of the current tenant, all levels, in five parallel queries. */
  async load(): Promise<HierarchyRows> {
    const [enterprises, sites, areas, workCenters, workUnits] = await Promise.all([
      this.enterprises.list(),
      this.sites.list(),
      this.areas.list(),
      this.workCenters.list(),
      this.workUnits.list(),
    ]);
    return { enterprises, sites, areas, workCenters, workUnits };
  }
}

export { HierarchyTreeRepository };
