import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  downtimeReasonTickTable,
  downtimeReasonTable,
  measurementGroupTable,
  rejectReasonTable,
  rejectReasonTickTable,
  timeConversionTable,
  unitOfMeasurementTable,
} from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type {
  DowntimeReason,
  MeasurementGroup,
  ReasonTick,
  RejectReason,
  TimeConversion,
  UnitOfMeasurement,
} from "./reference-data.js";
import { MEASUREMENT_GROUPS } from "./measurement-groups.js";

const GROUP_KEYS = ["id", "code", "name", "validFrom", "validTo"];
const UNIT_KEYS = ["id", "code", "name", "unit", "measurementGroupId", "deletedAt"];
const TIME_KEYS = ["id", "code", "name", "secondsPerUnit", "deletedAt"];
const DOWNTIME_KEYS = ["id", "code", "name", "downtimeCategory", "deletedAt"];
const REJECT_KEYS = ["id", "code", "name", "deletedAt"];
const TICK_KEYS = ["id", "kind", "reasonId", "assetId", "deletedAt"];

// Seed rows only. Real reason lists are an ops-domain question (F-05 T-1).
class ReferenceDataStore {
  private groupsRepo?: EntityRepository<MeasurementGroup>;
  private unitsRepo?: EntityRepository<UnitOfMeasurement>;
  private timeRepo?: EntityRepository<TimeConversion>;
  private downtimeRepo?: EntityRepository<DowntimeReason>;
  private rejectRepo?: EntityRepository<RejectReason>;
  private downtimeTicksRepo?: EntityRepository<ReasonTick>;
  private rejectTicksRepo?: EntityRepository<ReasonTick>;

  // F-05 §9.4 seed groups; REF-004 (PO, 2026-10-26) lets the admin add and end them.
  groups: MeasurementGroup[] = [...MEASUREMENT_GROUPS];

  units: UnitOfMeasurement[] = [
    { id: "uom-1", code: "pcs", name: "Pieces", unit: "pcs", measurementGroupId: "mg-count" },
    { id: "uom-2", code: "kg", name: "Kilogram", unit: "kg", measurementGroupId: "mg-mass" },
    { id: "uom-3", code: "g", name: "Gram", unit: "g", measurementGroupId: "mg-mass" },
    { id: "uom-4", code: "l", name: "Liter", unit: "L", measurementGroupId: "mg-volume" },
    { id: "uom-5", code: "pack", name: "Pack", unit: "pack", measurementGroupId: "mg-count" },
    { id: "uom-6", code: "carton", name: "Carton", unit: "carton", measurementGroupId: "mg-count" },
    { id: "uom-7", code: "mm", name: "Millimetre", unit: "mm", measurementGroupId: "mg-length" },
    { id: "uom-8", code: "cm", name: "Centimetre", unit: "cm", measurementGroupId: "mg-length" },
    { id: "uom-9", code: "m", name: "Metre", unit: "m", measurementGroupId: "mg-length" },
  ];

  timeConversions: TimeConversion[] = [
    { id: "tc-1", code: "seconds", name: "Seconds", secondsPerUnit: 1 },
    { id: "tc-2", code: "minutes", name: "Minutes", secondsPerUnit: 60 },
    { id: "tc-3", code: "hours", name: "Hours", secondsPerUnit: 3600 },
  ];

  downtimeReasons: DowntimeReason[] = [
    {
      id: "dr-1",
      code: "changeover",
      name: "Changeover",
      downtimeCategory: "planned",
      deletedAt: null,
    },
    {
      id: "dr-2",
      code: "jam",
      name: "Machine jam",
      downtimeCategory: "unplanned",
      deletedAt: null,
    },
  ];

  // `unclassified` is the generic reason a sensor loss carries until someone
  // picks the real one (PRD-004 MON-004: a loss is open while it has it).
  rejectReasons: RejectReason[] = [
    { id: "rr-0", code: "unclassified", name: "Unclassified", deletedAt: null },
    { id: "rr-1", code: "seal_defect", name: "Seal defect", deletedAt: null },
    { id: "rr-2", code: "underweight", name: "Underweight", deletedAt: null },
    { id: "rr-3", code: "dent", name: "Dent", deletedAt: null },
    { id: "rr-4", code: "burr", name: "Burr", deletedAt: null },
  ];

  // Every reject reason ticked for asset-1 (the machine at WU_01), so Monitoring
  // has valid reasons for that work unit (MON-005 rule 2).
  ticks: ReasonTick[] = ["rr-0", "rr-1", "rr-2", "rr-3", "rr-4"].map((reasonId) => ({
    id: `tick-${reasonId}-asset-1`,
    kind: "reject",
    reasonId,
    assetId: "asset-1",
    deletedAt: null,
  }));

  constructor(deps?: DbDeps) {
    this.groupsRepo = openRepo<MeasurementGroup>(deps, measurementGroupTable, GROUP_KEYS);
    this.unitsRepo = openRepo<UnitOfMeasurement>(deps, unitOfMeasurementTable, UNIT_KEYS);
    this.timeRepo = openRepo<TimeConversion>(deps, timeConversionTable, TIME_KEYS);
    this.downtimeRepo = openRepo<DowntimeReason>(deps, downtimeReasonTable, DOWNTIME_KEYS);
    this.rejectRepo = openRepo<RejectReason>(deps, rejectReasonTable, REJECT_KEYS);
    this.downtimeTicksRepo = openRepo<ReasonTick>(deps, downtimeReasonTickTable, TICK_KEYS);
    this.rejectTicksRepo = openRepo<ReasonTick>(deps, rejectReasonTickTable, TICK_KEYS);
  }

  listGroups(): Promise<MeasurementGroup[]> {
    return this.groupsRepo ? this.groupsRepo.list() : Promise.resolve(this.groups);
  }

  listUnits(): Promise<UnitOfMeasurement[]> {
    return this.unitsRepo ? this.unitsRepo.list() : Promise.resolve(this.units);
  }

  listTimeConversions(): Promise<TimeConversion[]> {
    return this.timeRepo ? this.timeRepo.list() : Promise.resolve(this.timeConversions);
  }

  listDowntimeReasons(): Promise<DowntimeReason[]> {
    return this.downtimeRepo ? this.downtimeRepo.list() : Promise.resolve(this.downtimeReasons);
  }

  listRejectReasons(): Promise<RejectReason[]> {
    return this.rejectRepo ? this.rejectRepo.list() : Promise.resolve(this.rejectReasons);
  }

  async listTicks(): Promise<ReasonTick[]> {
    if (!this.downtimeTicksRepo || !this.rejectTicksRepo) return this.ticks;
    const [downtime, reject] = await Promise.all([
      this.downtimeTicksRepo.list(),
      this.rejectTicksRepo.list(),
    ]);
    return [...downtime, ...reject];
  }

  saveGroup(row: MeasurementGroup, isNew: boolean): Promise<MeasurementGroup> {
    return this.save(this.groupsRepo, this.groups, row, isNew);
  }

  saveUnit(row: UnitOfMeasurement, isNew: boolean): Promise<UnitOfMeasurement> {
    return this.save(this.unitsRepo, this.units, row, isNew);
  }

  saveTime(row: TimeConversion, isNew: boolean): Promise<TimeConversion> {
    return this.save(this.timeRepo, this.timeConversions, row, isNew);
  }

  saveDowntime(row: DowntimeReason, isNew: boolean): Promise<DowntimeReason> {
    return this.save(this.downtimeRepo, this.downtimeReasons, row, isNew);
  }

  saveReject(row: RejectReason, isNew: boolean): Promise<RejectReason> {
    return this.save(this.rejectRepo, this.rejectReasons, row, isNew);
  }

  saveTick(row: ReasonTick, isNew: boolean): Promise<ReasonTick> {
    const repo = row.kind === "downtime" ? this.downtimeTicksRepo : this.rejectTicksRepo;
    return this.save(repo, this.ticks, row, isNew);
  }

  private async save<T extends { id: string }>(
    repo: EntityRepository<T> | undefined,
    memory: T[],
    row: T,
    isNew: boolean,
  ): Promise<T> {
    if (repo) {
      if (isNew) return repo.insert(row);
      return (await repo.update(row.id, row)) ?? row;
    }
    if (isNew) {
      memory.unshift(row);
      return row;
    }
    const current = memory.find((r) => r.id === row.id);
    if (current) Object.assign(current, row);
    return current ?? row;
  }
}

export { ReferenceDataStore };
