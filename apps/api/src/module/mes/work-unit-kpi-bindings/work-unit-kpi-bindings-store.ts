import { and, eq, isNull, type SQL } from "drizzle-orm";
import { ulid } from "ulidx";

import { EntityRepository } from "../../../shared/database/entity-repository.js";
import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  workUnitKpiBindingChangeTable,
  workUnitKpiBindingTable,
} from "../../../shared/database/schema/schema.js";

import type {
  CreateWorkUnitKpiBinding,
  UpdateWorkUnitKpiBinding,
  WorkUnitKpiBinding,
  WorkUnitKpiBindingChange,
  WorkUnitKpiBindingFilter,
} from "./work-unit-kpi-bindings.js";

type PaginateWorkUnitKpiBindingsInput = {
  limit: number;
  offset: number;
} & WorkUnitKpiBindingFilter;

const KEYS = [
  "id",
  "workUnitId",
  "slotId",
  "assetTagId",
  "transform",
  "secondAssetTagId",
  "validFrom",
  "validTo",
];

const CHANGE_KEYS = [
  "changeId",
  "bindingId",
  "workUnitId",
  "slotId",
  "action",
  "oldValidFrom",
  "oldValidTo",
  "newValidFrom",
  "newValidTo",
  "changedAt",
];

class WorkUnitKpiBindingsStore {
  private repo?: EntityRepository<WorkUnitKpiBinding>;
  private changeRepo?: EntityRepository<WorkUnitKpiBindingChange>;
  private changeItems: WorkUnitKpiBindingChange[] = [];
  // wu-1 has asset-1 placed as primary since 2026-01-01 (ap-1) and asset-1
  // carries tag-1 (total) and tag-2 (good) — bind them so the breakdown
  // (US-FND-KPI-008) has something real to show out of the box. Both pairs
  // are KPI_PARAMETERS rows (quality.total/total/none, quality.good/good/none).
  private items: WorkUnitKpiBinding[] = [
    {
      id: "wkb-1",
      workUnitId: "wu-1",
      slotId: "quality.total",
      assetTagId: "tag-1",
      transform: "none",
      secondAssetTagId: null,
      validFrom: "2026-01-01",
      validTo: null,
    },
    {
      id: "wkb-2",
      workUnitId: "wu-1",
      slotId: "quality.good",
      assetTagId: "tag-2",
      transform: "none",
      secondAssetTagId: null,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<WorkUnitKpiBinding>(deps, workUnitKpiBindingTable, KEYS);
    if (deps?.db && deps.region) {
      this.changeRepo = new EntityRepository<WorkUnitKpiBindingChange>(
        { db: deps.db, region: deps.region },
        workUnitKpiBindingChangeTable as never,
        CHANGE_KEYS,
        "changeId",
      );
    }
  }

  /**
   * Append one change row (F-00 back-dating, PO 2026-10-04). Called after the
   * binding write, inside the same request transaction, so a failed save
   * leaves no change row.
   */
  async recordChange(change: Omit<WorkUnitKpiBindingChange, "changeId">): Promise<void> {
    const row: WorkUnitKpiBindingChange = { changeId: ulid(), ...change };
    if (this.changeRepo) {
      await this.changeRepo.insert(row);
      return;
    }
    this.changeItems.push(row);
  }

  /** The change rows, oldest first (tests and the in-memory mode only). */
  async changes(): Promise<WorkUnitKpiBindingChange[]> {
    if (this.changeRepo) return this.changeRepo.list();
    return [...this.changeItems];
  }

  async paginate({ limit, offset, workUnitId, slotId }: PaginateWorkUnitKpiBindingsInput): Promise<{
    items: WorkUnitKpiBinding[];
    totalElements: number;
  }> {
    if (this.repo) {
      const conds: SQL[] = [];
      if (workUnitId !== undefined && workUnitId !== "") {
        conds.push(eq(workUnitKpiBindingTable.workUnitId, workUnitId));
      }
      if (slotId !== undefined && slotId !== "") {
        conds.push(eq(workUnitKpiBindingTable.slotId, slotId));
      }
      const extra = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
      return this.repo.paginate({ limit, offset }, [], extra);
    }
    let rows = this.items;
    if (workUnitId !== undefined && workUnitId !== "") {
      rows = rows.filter((r) => r.workUnitId === workUnitId);
    }
    if (slotId !== undefined && slotId !== "") {
      rows = rows.filter((r) => r.slotId === slotId);
    }
    const totalElements = rows.length;
    const items = rows.slice(offset, offset + limit);
    return { items, totalElements };
  }

  async get(id: string): Promise<WorkUnitKpiBinding | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((r) => r.id === id);
  }

  /** Every active row of one work unit's slot — `quality.reject` and enrichment rows may be many (K-13). */
  async findAllActive(workUnitId: string, slotId: string): Promise<WorkUnitKpiBinding[]> {
    if (this.repo) {
      return this.repo.list(
        and(
          eq(workUnitKpiBindingTable.workUnitId, workUnitId),
          eq(workUnitKpiBindingTable.slotId, slotId),
          isNull(workUnitKpiBindingTable.validTo),
        ),
      );
    }
    return this.items.filter(
      (r) => r.workUnitId === workUnitId && r.slotId === slotId && r.validTo === null,
    );
  }

  async findActive(workUnitId: string, slotId: string): Promise<WorkUnitKpiBinding | undefined> {
    if (this.repo) {
      const rows = await this.repo.list(
        and(
          eq(workUnitKpiBindingTable.workUnitId, workUnitId),
          eq(workUnitKpiBindingTable.slotId, slotId),
          isNull(workUnitKpiBindingTable.validTo),
        ),
      );
      return rows[0];
    }
    return this.items.find(
      (r) => r.workUnitId === workUnitId && r.slotId === slotId && r.validTo === null,
    );
  }

  async create(input: CreateWorkUnitKpiBinding): Promise<WorkUnitKpiBinding> {
    const row: WorkUnitKpiBinding = {
      id: ulid(),
      workUnitId: input.workUnitId,
      slotId: input.slotId,
      assetTagId: input.assetTagId,
      transform: input.transform,
      secondAssetTagId: input.secondAssetTagId ?? null,
      validFrom: input.validFrom,
      validTo: null,
    };
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(
    id: string,
    patch: UpdateWorkUnitKpiBinding,
  ): Promise<WorkUnitKpiBinding | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((r) => r.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { WorkUnitKpiBindingsStore };
export type { PaginateWorkUnitKpiBindingsInput };
