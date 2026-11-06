import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { sameCode } from "../../../shared/util/code-match.js";

import type { AssetsStore } from "../assets/assets-store.js";
import type { ProductsReader } from "../products/products-repository.js";
import type { WorkMasterStore } from "../work-master/work-master-store.js";
import type {
  DowntimeReason,
  MeasurementGroup,
  ReasonImpact,
  ReasonKind,
  ReasonTick,
  RejectReason,
  TimeConversion,
  UnitOfMeasurement,
} from "./reference-data.js";
import type { ReferenceDataStore } from "./reference-data-store.js";

type Coded = { id: string; code: string; name: string };

/** PRD-003 REF-006 (PO, 2026-10-21, F-05 T-9): one row still used by active master data. */
/**
 * REF-006 rule 2: the refusal names each blocker, so every blocker carries a
 * label — the product's "<code> · <name>"; a conversion or a routing step adds
 * which one of that product it is.
 */
type MasterBlocker = { kind: "product" | "conversion" | "operation"; id: string; label: string };
type MasterImpact = { references: number; blockers: MasterBlocker[] };

/** "<code> · <name>" for a product id; the id itself when the product is gone. */
function labelProducts(
  products: ReadonlyArray<{ id: string; code: string; name: string }>,
): (productId: string) => string {
  const byId = new Map(products.map((p) => [p.id, `${p.code} · ${p.name}`]));
  return (productId) => byId.get(productId) ?? productId;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Null = still active; a future end date is still active today (PRO-001 AC-6). */
const isLive = (validTo: string | null | undefined, now: string) =>
  validTo == null || validTo > now;

type ReferenceDataServiceDeps = {
  referenceDataStore: ReferenceDataStore;
  assetsStore: AssetsStore;
  productsReaderRepository: ProductsReader;
  workMasterStore: WorkMasterStore;
};

class ReferenceDataService {
  readonly data: ReferenceDataStore;
  private assets: AssetsStore;
  private products: ProductsReader;
  private workMaster: WorkMasterStore;

  constructor({
    referenceDataStore,
    assetsStore,
    productsReaderRepository,
    workMasterStore,
  }: ReferenceDataServiceDeps) {
    this.data = referenceDataStore;
    this.assets = assetsStore;
    this.products = productsReaderRepository;
    this.workMaster = workMasterStore;
  }

  /**
   * Add or edit one row of a flat list. Codes are unique within the list
   * (REF-001/002/004/005), and the refusal names the holder.
   * A duplicate throws before any write, so callers can catch it without awaiting.
   */
  upsert<T extends Coded>(list: T[], input: Omit<T, "id"> & { id?: string }): Promise<T> {
    return this.write(list, input, (row, isNew) => this.persist(list, row, isNew));
  }

  async saveUnit(
    input: Omit<UnitOfMeasurement, "id"> & { id?: string },
  ): Promise<UnitOfMeasurement> {
    // An ended group is no longer offered, so a unit can't be put in it.
    const group = (await this.data.listGroups()).find((g) => g.id === input.measurementGroupId);
    if (!group || !isLive(group.validTo, today())) throw refusal(422, "group_inactive");
    return this.write(await this.data.listUnits(), input, (row, isNew) =>
      this.data.saveUnit(row, isNew),
    );
  }

  /**
   * REF-004 (PO, 2026-10-26): the admin adds measurement groups. Rule 1 / AC-10 /
   * AC-11: a group code is unique per tenant among active groups, ignoring case
   * and surrounding spaces, and is free again from the old group's end date.
   */
  async saveGroup(input: { code: string; name: string }): Promise<MeasurementGroup> {
    const code = input.code.trim();
    const now = today();
    const holder = (await this.data.listGroups()).find(
      (g) => isLive(g.validTo ?? null, now) && sameCode(g.code, code),
    );
    if (holder) throw refusal(409, "code_taken", { holderCode: holder.code, name: holder.name });
    const row: MeasurementGroup = {
      id: ulid(),
      code,
      name: input.name.trim(),
      validFrom: now,
      validTo: null,
    };
    return this.data.saveGroup(row, true);
  }

  /**
   * REF-004 rule 5 (PO, 2026-10-26): "delete" ends the group — nothing is
   * physically deleted. A group that still has units is refused, naming them
   * (`ref-001.error.group-has-units`). Deactivated units count too: they stay
   * in the list and still show under their group.
   */
  async endGroup(id: string): Promise<MeasurementGroup> {
    const now = today();
    const row = (await this.data.listGroups()).find((g) => g.id === id);
    if (!row) throw refusal(404, "not_found");
    if (!isLive(row.validTo ?? null, now)) throw refusal(422, "already_inactive");
    const units = (await this.data.listUnits()).filter((u) => u.measurementGroupId === id);
    if (units.length > 0) {
      throw refusal(409, "group_has_units", {
        units: units.map((u) => ({ id: u.id, code: u.code, name: u.name })),
      });
    }
    return this.data.saveGroup({ ...row, validTo: now }, false);
  }

  async saveTime(input: Omit<TimeConversion, "id"> & { id?: string }): Promise<TimeConversion> {
    return this.write(await this.data.listTimeConversions(), input, (row, isNew) =>
      this.data.saveTime(row, isNew),
    );
  }

  async saveDowntime(input: Omit<DowntimeReason, "id"> & { id?: string }): Promise<DowntimeReason> {
    return this.write(await this.data.listDowntimeReasons(), input, (row, isNew) =>
      this.data.saveDowntime(row, isNew),
    );
  }

  async saveReject(input: Omit<RejectReason, "id"> & { id?: string }): Promise<RejectReason> {
    return this.write(await this.data.listRejectReasons(), input, (row, isNew) =>
      this.data.saveReject(row, isNew),
    );
  }

  private write<T extends Coded>(
    list: T[],
    input: Omit<T, "id"> & { id?: string },
    save: (row: T, isNew: boolean) => Promise<T>,
  ): Promise<T> {
    const code = input.code.trim();
    // REF-001 AC-10 / REF-002 AC-9 (PO 2026-10-21): a retired row (deletedAt on or
    // before today) frees its code; a future deletedAt still holds it.
    // docs-molcadx#142: codes match ignoring case and surrounding spaces.
    const today = new Date().toISOString().slice(0, 10);
    const holder = list.find(
      (r) =>
        !("deletedAt" in r && r.deletedAt && (r.deletedAt as string) <= today) &&
        sameCode(r.code, code) &&
        r.id !== input.id,
    );
    if (holder) throw refusal(409, "code_taken", { holderCode: holder.code, name: holder.name });
    if (input.id) {
      const row = list.find((r) => r.id === input.id);
      if (!row) throw refusal(404, "not_found");
      Object.assign(row, input, { code });
      return save(row, false);
    }
    const created = { ...input, code, id: ulid() } as T;
    return save(created, true);
  }

  /**
   * REF-003 rule 4: one active tick per reason per machine. Rule 2: only an
   * Equipment unit (no parent) takes ticks.
   */
  async setTick(
    kind: ReasonKind,
    reasonId: string,
    assetId: string,
    on: boolean,
  ): Promise<ReasonTick | null> {
    const asset = await this.assets.get(assetId);
    if (asset && asset.parentAssetId !== "") {
      throw refusal(422, "part_refused", { parentAssetId: asset.parentAssetId });
    }
    const ticks = await this.data.listTicks();
    const active = ticks.find(
      (t) =>
        t.kind === kind && t.reasonId === reasonId && t.assetId === assetId && t.deletedAt === null,
    );
    if (on) {
      if (active) return active;
      const created: ReasonTick = { id: ulid(), kind, reasonId, assetId, deletedAt: null };
      return this.data.saveTick(created, true);
    }
    if (!active) return null;
    return this.data.saveTick({ ...active, deletedAt: today() }, false);
  }

  /**
   * REF-006 impact. Old stop and defect records live in PRODUCTION and the
   * machine-state log (B5), which don't exist here yet, so references and
   * open-stop blockers are 0 today.
   */
  async impact(kind: ReasonKind, id: string): Promise<ReasonImpact> {
    const ticks = await this.data.listTicks();
    return {
      references: 0,
      ticks: ticks.filter((t) => t.kind === kind && t.reasonId === id && t.deletedAt === null)
        .length,
      blockers: [],
    };
  }

  /** REF-006: set `deletedAt` and cascade to the machine ticks (AC-5). */
  async deactivate(
    kind: ReasonKind,
    id: string,
    effectiveDate: string,
  ): Promise<{ cascaded: number }> {
    if (effectiveDate < today()) throw refusal(422, "past_date");
    const blockers = (await this.impact(kind, id)).blockers;
    if (blockers.length > 0) throw refusal(409, "blocked", { blockers });
    if (kind === "downtime") {
      const row = (await this.data.listDowntimeReasons()).find((r) => r.id === id);
      if (!row) throw refusal(404, "not_found");
      if (row.deletedAt) throw refusal(422, "already_inactive");
      await this.data.saveDowntime({ ...row, deletedAt: effectiveDate }, false);
    } else {
      const row = (await this.data.listRejectReasons()).find((r) => r.id === id);
      if (!row) throw refusal(404, "not_found");
      if (row.deletedAt) throw refusal(422, "already_inactive");
      await this.data.saveReject({ ...row, deletedAt: effectiveDate }, false);
    }
    const ticks = await this.data.listTicks();
    let cascaded = 0;
    for (const t of ticks) {
      if (t.kind === kind && t.reasonId === id && t.deletedAt === null) {
        await this.data.saveTick({ ...t, deletedAt: effectiveDate }, false);
        cascaded += 1;
      }
    }
    return { cascaded };
  }

  /**
   * REF-001 rule 1 (PO, 2026-10-21, T-7): a deactivated row's code was free,
   * so a newer active row may hold it now. Reactivating would make two active
   * rows share one code, so it is refused with the save's own `code_taken`.
   */
  private assertCodeFree<T extends Coded & { deletedAt?: string | null }>(
    list: ReadonlyArray<T>,
    row: T,
  ): void {
    const today = new Date().toISOString().slice(0, 10);
    const holder = list.find(
      (r) =>
        r.id !== row.id && !(r.deletedAt && r.deletedAt <= today) && sameCode(r.code, row.code),
    );
    if (holder) throw refusal(409, "code_taken", { holderCode: holder.code, name: holder.name });
  }

  /** Reverse of {@link deactivate}: clear `deletedAt`. Ticks stay as they
   * were — the cascade is one-directional (AC-5 reverted). */
  async reactivate(kind: ReasonKind, id: string): Promise<DowntimeReason | RejectReason> {
    if (kind === "downtime") {
      const list = await this.data.listDowntimeReasons();
      const row = list.find((r) => r.id === id);
      if (!row) throw refusal(404, "not_found");
      if (!row.deletedAt) throw refusal(422, "already_active");
      this.assertCodeFree(list, row);
      const updated = { ...row, deletedAt: null };
      await this.data.saveDowntime(updated, false);
      return updated;
    }
    const list = await this.data.listRejectReasons();
    const row = list.find((r) => r.id === id);
    if (!row) throw refusal(404, "not_found");
    if (!row.deletedAt) throw refusal(422, "already_active");
    this.assertCodeFree(list, row);
    const updated = { ...row, deletedAt: null };
    await this.data.saveReject(updated, false);
    return updated;
  }

  /**
   * PRD-003 REF-006 Calculation (PO, 2026-10-21, F-05 T-9). A unit is referenced by
   * products (base unit), product conversions (from or to) and operations. Blockers:
   * live products and conversions, and operations of a released, in-date routing.
   */
  async unitImpact(id: string): Promise<MasterImpact> {
    const now = today();
    const [products, conversions, operations, routings, units] = await Promise.all([
      this.products.listProducts(),
      this.products.listConversions(),
      this.workMaster.readOperations(),
      this.workMaster.readRoutings(),
      this.data.listUnits(),
    ]);
    const productLabel = labelProducts(products);
    const unitCode = new Map(units.map((u) => [u.id, u.code]));
    const productRows = products.filter((p) => p.baseUomId === id);
    const conversionRows = conversions.filter((c) => c.fromUomId === id || c.toUomId === id);
    const operationRows = operations.filter((o) => o.uomId === id);
    // REF-006 "what blocks it": any active master data still using the row,
    // so a step's speed unit blocks too, though the references count is the
    // exact formula (item unit only).
    const usingRows = operations.filter((o) => o.uomId === id || o.speedUomId === id);
    return {
      references: productRows.length + conversionRows.length + operationRows.length,
      blockers: this.operationBlockers(usingRows, routings, productLabel, now, [
        ...productRows
          .filter((p) => isLive(p.validTo, now))
          .map((p) => ({ kind: "product" as const, id: p.id, label: productLabel(p.id) })),
        ...conversionRows
          .filter((c) => isLive(c.validTo, now))
          .map((c) => ({
            kind: "conversion" as const,
            id: c.id,
            label: `${productLabel(c.productId)} · ${unitCode.get(c.fromUomId) ?? c.fromUomId} → ${unitCode.get(c.toUomId) ?? c.toUomId}`,
          })),
      ]),
    };
  }

  /** REF-006 Calculation (PO, 2026-10-21): references = operations on the time conversion. */
  async timeImpact(id: string): Promise<MasterImpact> {
    const now = today();
    const [operations, routings, products] = await Promise.all([
      this.workMaster.readOperations(),
      this.workMaster.readRoutings(),
      this.products.listProducts(),
    ]);
    const operationRows = operations.filter((o) => o.timeConversionId === id);
    // Setup and hold times use time conversions too; while a live step uses
    // one, it blocks (REF-006 "what blocks it"), outside the references count.
    const usingRows = operations.filter(
      (o) =>
        o.timeConversionId === id ||
        o.setupTimeConversionId === id ||
        o.holdTimeConversionId === id,
    );
    return {
      references: operationRows.length,
      blockers: this.operationBlockers(usingRows, routings, labelProducts(products), now, []),
    };
  }

  /** Operations of a released, in-date routing version block; finished rows do not. */
  private operationBlockers(
    operationRows: Array<{
      id: string;
      routingId: string;
      stepNumber: number;
      stepName: string;
      validTo: string | null;
    }>,
    routings: Array<{ id: string; productId: string; status: string; validTo: string | null }>,
    productLabel: (productId: string) => string,
    now: string,
    blockers: MasterBlocker[],
  ): MasterBlocker[] {
    const activeRouting = new Map(
      routings
        .filter((r) => r.status === "released" && isLive(r.validTo, now))
        .map((r) => [r.id, r.productId]),
    );
    return [
      ...blockers,
      ...operationRows
        .filter((o) => isLive(o.validTo, now) && activeRouting.has(o.routingId))
        .map((o) => ({
          kind: "operation" as const,
          id: o.id,
          label: `${productLabel(activeRouting.get(o.routingId)!)} · ${o.stepNumber}. ${o.stepName}`,
        })),
    ];
  }

  /** REF-006 (PO 2026-10-21): set `deletedAt` on a unit; the code is free at once. */
  async deactivateUnit(id: string, effectiveDate: string): Promise<UnitOfMeasurement> {
    if (effectiveDate < today()) throw refusal(422, "past_date");
    const { blockers } = await this.unitImpact(id);
    if (blockers.length > 0) throw refusal(409, "blocked", { blockers });
    const row = (await this.data.listUnits()).find((r) => r.id === id);
    if (!row) throw refusal(404, "not_found");
    if (row.deletedAt) throw refusal(422, "already_inactive");
    return this.data.saveUnit({ ...row, deletedAt: effectiveDate }, false);
  }

  /** REF-006 (PO 2026-10-21): set `deletedAt` on a time conversion. */
  async deactivateTime(id: string, effectiveDate: string): Promise<TimeConversion> {
    if (effectiveDate < today()) throw refusal(422, "past_date");
    const { blockers } = await this.timeImpact(id);
    if (blockers.length > 0) throw refusal(409, "blocked", { blockers });
    const row = (await this.data.listTimeConversions()).find((r) => r.id === id);
    if (!row) throw refusal(404, "not_found");
    if (row.deletedAt) throw refusal(422, "already_inactive");
    return this.data.saveTime({ ...row, deletedAt: effectiveDate }, false);
  }

  /** Reverse of {@link deactivateUnit}. */
  async reactivateUnit(id: string): Promise<UnitOfMeasurement> {
    const list = await this.data.listUnits();
    const row = list.find((r) => r.id === id);
    if (!row) throw refusal(404, "not_found");
    if (!row.deletedAt) throw refusal(422, "already_active");
    this.assertCodeFree(list, row);
    return this.data.saveUnit({ ...row, deletedAt: null }, false);
  }

  /** Reverse of {@link deactivateTime}. */
  async reactivateTime(id: string): Promise<TimeConversion> {
    const list = await this.data.listTimeConversions();
    const row = list.find((r) => r.id === id);
    if (!row) throw refusal(404, "not_found");
    if (!row.deletedAt) throw refusal(422, "already_active");
    this.assertCodeFree(list, row);
    return this.data.saveTime({ ...row, deletedAt: null }, false);
  }

  private persist<T extends Coded>(list: T[], row: T, isNew: boolean): Promise<T> {
    const rows = list as unknown;
    if (rows === this.data.units) {
      return this.data.saveUnit(
        row as unknown as UnitOfMeasurement,
        isNew,
      ) as unknown as Promise<T>;
    }
    if (rows === this.data.timeConversions) {
      return this.data.saveTime(row as unknown as TimeConversion, isNew) as unknown as Promise<T>;
    }
    if (rows === this.data.downtimeReasons) {
      return this.data.saveDowntime(
        row as unknown as DowntimeReason,
        isNew,
      ) as unknown as Promise<T>;
    }
    if (rows === this.data.rejectReasons) {
      return this.data.saveReject(row as unknown as RejectReason, isNew) as unknown as Promise<T>;
    }
    if (isNew) list.unshift(row);
    return Promise.resolve(row);
  }
}

export { ReferenceDataService };
export type { ReferenceDataService as TReferenceDataService, ReferenceDataServiceDeps };
