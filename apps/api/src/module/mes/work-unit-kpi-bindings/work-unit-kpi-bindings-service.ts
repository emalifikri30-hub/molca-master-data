import { HTTPException } from "hono/http-exception";

import { refusal } from "../../../shared/errors/refusal.js";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { PAIRED_TRANSFORM } from "../kpi-formula-slots/kpi-formula-slots.js";
import { PER_LANE_ROLES } from "../asset-tags/asset-tags.js";

import type {
  CreateWorkUnitKpiBindingBatch,
  CreateWorkUnitKpiBinding,
  UpdateWorkUnitKpiBinding,
  WorkUnitKpiBinding,
  WorkUnitKpiBindingChange,
  WorkUnitKpiBindingFilter,
} from "./work-unit-kpi-bindings.js";
import type { WorkUnitKpiBindingsStore } from "./work-unit-kpi-bindings-store.js";
import type { KpiFormulaSlotsStore } from "../kpi-formula-slots/kpi-formula-slots-store.js";
import type { KpiParametersStore } from "../kpi-parameters/kpi-parameters-store.js";
import type { AssetTags } from "../asset-tags/asset-tags.js";
import type { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import type { AssetPlacements } from "../asset-placements/asset-placements.js";
import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";
import type { ReferenceDataStore } from "../reference-data/reference-data-store.js";
import type { WorkMasterStore } from "../work-master/work-master-store.js";
import { endSteps, inEffect } from "../work-master/work-master-rules.js";

type PagedWorkUnitKpiBindingsResult = PagedResult<WorkUnitKpiBinding>;

type TWorkUnitKpiBindingsService = {
  getPaged: (
    page: number,
    size: number,
    filter: WorkUnitKpiBindingFilter,
  ) => Promise<PagedWorkUnitKpiBindingsResult>;
  get: (id: string) => Promise<WorkUnitKpiBinding>;
  create: (input: CreateWorkUnitKpiBinding) => Promise<WorkUnitKpiBinding>;
  createBatch: (input: CreateWorkUnitKpiBindingBatch) => Promise<WorkUnitKpiBinding[]>;
  update: (id: string, patch: UpdateWorkUnitKpiBinding) => Promise<WorkUnitKpiBinding>;
};

type WorkUnitKpiBindingsServiceDeps = {
  workUnitKpiBindingsStore: WorkUnitKpiBindingsStore;
  kpiFormulaSlotsStore: KpiFormulaSlotsStore;
  kpiParametersStore: KpiParametersStore;
  assetTagsStore: AssetTagsStore;
  /** Read only — placements are owned by the asset-placements module. */
  assetPlacementsStore: Pick<AssetPlacementsStore, "paginate">;
  workUnitsStore: WorkUnitsStore;
  /** Read only — the unit list decides whether a tag is in a mass unit (KPI-007 rule 7). */
  referenceDataStore: Pick<ReferenceDataStore, "listUnits">;
  /** Read only — the end step of a routing decides where the weight output binds (PO 2026-11-04). */
  workMasterStore: Pick<
    WorkMasterStore,
    "readRoutings" | "readOperations" | "readStations" | "readDependencies"
  >;
};

/** A placement covers `date` when validFrom ≤ date < validTo (validTo exclusive, null = open). */
function coversDate(p: AssetPlacements, date: string): boolean {
  return p.validFrom <= date && (p.validTo === null || date < p.validTo);
}

const QUALITY_SLOTS = new Set(["quality.good", "quality.total", "quality.reject"]);
/** K-13 (PO 2026-10-02): any number of active rows — one per reject tag, on any machine of the work unit. */
const LIST_SLOT = "quality.reject";
/** K-13: labels only — any number may sit next to `availability.downtime_reason`'s one main row. */
const ENRICH_TRANSFORM = "reason_match_enrich";
/** Slots that read a quantity, so the tag must say what it counts (F-04 §9.7 `uom_id`). */
const QUANTITY_SLOTS = new Set([...QUALITY_SLOTS, "performance.output"]);

/** KPI-007 rule 7 (PO 2026-11-03): the weight output takes a mass tag only. */
const WEIGHT_OUTPUT_SLOT = "shopfloor.weight_output";
const MASS_UNIT_CODES: ReadonlySet<string> = new Set(["kg", "g"]);

/** Two validity ranges overlap; `validTo` is exclusive, null = open. */
function rangesOverlap(
  a: { validFrom: string; validTo: string | null },
  b: { validFrom: string; validTo: string | null },
): boolean {
  return (
    (a.validTo === null || b.validFrom < a.validTo) &&
    (b.validTo === null || a.validFrom < b.validTo)
  );
}

function unprocessable(message: string): HTTPException {
  return new HTTPException(422, { message });
}

/**
 * US-FND-KPI-007 — validates and writes one work unit's pick for one
 * bindable KPI_FORMULA_SLOT (F-07.1 §9.4). A save is accepted only when:
 * 1. a KPI_PARAMETERS row exists for (slot, tag's tag_role, transform);
 * 2. the tag's asset has an ASSET_PLACEMENT (primary or secondary) on this
 *    work unit covering the binding's validFrom;
 * 3. a second tag is given iff transform = infeed_outfeed_derive;
 * 4. every Quality tag of the work unit shares one unit — Quality never
 *    converts units (PO 2026-09-28, F-07.1 §9.4);
 * 5. a quantity slot (Quality, performance.output) only takes tags that
 *    declare a unit — F-04 §9.7 requires `uom_id` on total/good/reject;
 * 6. per machine, `quality.reject` holds either the total reject tag or its
 *    reason counters, never both (rule 13, PO 2026-10-04).
 *
 * Every add, Edit / Rebind and End also writes one change row with the old
 * and new period (F-00 back-dating, PO 2026-10-04).
 */
class WorkUnitKpiBindingsService implements TWorkUnitKpiBindingsService {
  private store: WorkUnitKpiBindingsStore;
  private slotsStore: KpiFormulaSlotsStore;
  private parametersStore: KpiParametersStore;
  private assetTagsStore: AssetTagsStore;
  private placementsStore: Pick<AssetPlacementsStore, "paginate">;
  private workUnitsStore: WorkUnitsStore;
  private referenceDataStore: Pick<ReferenceDataStore, "listUnits">;
  private workMasterStore: WorkUnitKpiBindingsServiceDeps["workMasterStore"];

  constructor({
    workUnitKpiBindingsStore,
    kpiFormulaSlotsStore,
    kpiParametersStore,
    assetTagsStore,
    assetPlacementsStore,
    workUnitsStore,
    referenceDataStore,
    workMasterStore,
  }: WorkUnitKpiBindingsServiceDeps) {
    this.store = workUnitKpiBindingsStore;
    this.slotsStore = kpiFormulaSlotsStore;
    this.parametersStore = kpiParametersStore;
    this.assetTagsStore = assetTagsStore;
    this.placementsStore = assetPlacementsStore;
    this.workUnitsStore = workUnitsStore;
    this.referenceDataStore = referenceDataStore;
    this.workMasterStore = workMasterStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: WorkUnitKpiBindingFilter,
  ): Promise<PagedWorkUnitKpiBindingsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, ...filter });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<WorkUnitKpiBinding> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "work-unit-kpi-bindings not found" });
    return row;
  }

  private async workUnitLabel(workUnitId: string): Promise<string> {
    const wu = await this.workUnitsStore.get(workUnitId);
    return wu ? `${wu.code} (${wu.name})` : workUnitId;
  }

  private async placementsOfAsset(assetId: string): Promise<AssetPlacements[]> {
    const page = await this.placementsStore.paginate({ limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    return page.items.filter((p) => p.assetId === assetId);
  }

  /** Rule 2 — the tag's asset must be placed on this work unit at `date`. */
  private async assertPlacedOnWorkUnit(tag: AssetTags, workUnitId: string, date: string) {
    // KPI-007 AC-9: a per-lane tag of a multi-lane machine only binds on its own lane.
    if (tag.workUnitId && tag.workUnitId !== workUnitId && PER_LANE_ROLES.has(tag.tagRole)) {
      const own = await this.workUnitLabel(tag.workUnitId);
      const here = await this.workUnitLabel(workUnitId);
      throw unprocessable(`tag "${tag.node}" belongs to lane ${own}, ` + `not ${here}`);
    }
    const placements = await this.placementsOfAsset(tag.assetId);
    if (placements.some((p) => p.workUnitId === workUnitId && coversDate(p, date))) return;

    const elsewhere = placements.filter((p) => coversDate(p, date));
    const placed = await Promise.all(
      elsewhere.map(async (p) => `${await this.workUnitLabel(p.workUnitId)} as ${p.placementRole}`),
    );
    const actual =
      elsewhere.length > 0
        ? `it is placed on ${placed.join(", ")}`
        : "it is not placed on any work unit";
    const here = await this.workUnitLabel(workUnitId);
    throw unprocessable(
      `tag "${tag.node}" belongs to asset "${tag.assetId}", which is not placed on work unit ` +
        `${here} on ${date} — on that date ${actual}`,
    );
  }

  /**
   * KPI-007 rule 7 / AC-12: the new Quality binding's tags must use the same
   * unit as the work unit's other Quality bindings over overlapping validity
   * (the incumbent being replaced doesn't count). Refused, never converted.
   */
  private async assertOneQualityUnit(input: CreateWorkUnitKpiBinding, workUnitId: string) {
    const mine = await Promise.all(
      [input.assetTagId, input.secondAssetTagId]
        .filter((id): id is string => Boolean(id))
        .map((id) => this.getTag(id, "quality")),
    );
    const range = { validFrom: input.validFrom, validTo: null };
    const page = await this.store.paginate({
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
      workUnitId,
    });
    const others = (
      await Promise.all(
        page.items
          .filter(
            (b) =>
              QUALITY_SLOTS.has(b.slotId) &&
              b.id !== input.incumbentBindingId &&
              rangesOverlap(b, range),
          )
          .flatMap((b) => [b.assetTagId, b.secondAssetTagId])
          .filter((id): id is string => Boolean(id))
          .map((id) => this.assetTagsStore.get(id)),
      )
    ).filter((t): t is AssetTags => Boolean(t));
    const all = [...others, ...mine];
    const first = all[0];
    const odd = all.find((t) => t.uomId !== first?.uomId);
    if (!first || !odd) return;
    const [a, b] = mine.includes(odd) ? [first, odd] : [odd, first];
    const label = await this.workUnitLabel(workUnitId);
    throw unprocessable(
      `Cannot save: the Quality tags on ${label} must all use the same unit. ` +
        `${a.node} is in ${a.uomId}, ${b.node} is in ${b.uomId}. Pick tags in one unit.`,
    );
  }

  /**
   * KPI-007 rule 13 / AC-26 (PO 2026-10-04, F-07.1 "Total reject counter and
   * reason counters on one machine"): on one machine, a `reject` tag with no
   * reason (the total) and `reject` tags with a reason count the same rejects.
   * Binding both to `quality.reject` would count every reject twice. The
   * total is named first (`kpi-panel.binding.reject.total-and-reasons`).
   */
  private async assertTotalOrReasons(tag: AssetTags, input: CreateWorkUnitKpiBinding) {
    if (input.slotId !== LIST_SLOT) return;
    const isTotal = !tag.rejectReasonId;
    const range = { validFrom: input.validFrom, validTo: null };
    const page = await this.store.paginate({
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
      workUnitId: input.workUnitId,
      slotId: LIST_SLOT,
    });
    for (const b of page.items) {
      if (b.id === input.incumbentBindingId || !rangesOverlap(b, range)) continue;
      const other = await this.assetTagsStore.get(b.assetTagId);
      if (!other || other.assetId !== tag.assetId) continue;
      const otherIsTotal = !other.rejectReasonId;
      if (otherIsTotal === isTotal) continue;
      const [total, reason] = isTotal ? [tag, other] : [other, tag];
      throw refusal(422, "reject_total_and_reasons", {
        total: total.tagName || total.node,
        reason: reason.tagName || reason.node,
      });
    }
  }

  /** Rule 5 — a quantity slot needs a tag that says what it counts. */
  private assertHasUnit(tag: AssetTags, slotId: string) {
    if (!QUANTITY_SLOTS.has(slotId) || tag.uomId !== "") return;
    throw unprocessable(
      `slot "${slotId}": tag "${tag.tagName || tag.node}" has no unit — ` +
        `a "${tag.tagRole}" tag needs uom_id before it can feed a quantity`,
    );
  }

  /**
   * KPI-007 rule 7 / AC-31 (PO 2026-11-03): `shopfloor.weight_output` takes a tag in
   * kg or g only. A pcs, a unitless or any other tag is refused at save, never converted
   * here (the unit conversion happens when the KPI is computed).
   */
  private async assertMassWeightOutput(tag: AssetTags, slotId: string) {
    if (slotId !== WEIGHT_OUTPUT_SLOT) return;
    const units = await this.referenceDataStore.listUnits();
    const unit = units.find((u) => u.id === tag.uomId || u.code === tag.uomId);
    const code = unit?.code ?? tag.uomId;
    if (unit && MASS_UNIT_CODES.has(unit.code)) return;
    throw refusal(422, "kpi-002.shopfloor.weight.unit-refused", {
      tag: tag.tagName || tag.node,
      unit: code || "no unit",
    });
  }

  /**
   * KPI-007 rule 7 / PO answer 2a (2026-11-04, F-08 §9.2.3, WMS-003 rule 21): the weight
   * output binds only to a work unit that is the end step of at least one routing valid
   * on `date`. The end step is the one the routing's own rows say nothing waits for, the
   * same rule the KPI reads with. A station row of a class step counts for its own work unit.
   */
  private async assertLastStepWeightOutput(slotId: string, workUnitId: string, date: string) {
    if (slotId !== WEIGHT_OUTPUT_SLOT) return;
    const [routings, operations, stations, dependencies] = await Promise.all([
      this.workMasterStore.readRoutings(),
      this.workMasterStore.readOperations(),
      this.workMasterStore.readStations(),
      this.workMasterStore.readDependencies(),
    ]);
    const endsHere = routings.some((routing) => {
      if (routing.status !== "released") return false;
      if (!inEffect([routing], date)) return false;
      const steps = operations.filter((o) => o.routingId === routing.id && inEffect([o], date));
      const ends = endSteps(
        steps,
        dependencies.filter((d) => d.routingId === routing.id),
      );
      return ends.some(
        (end) =>
          end.workUnitId === workUnitId ||
          stations.some(
            (s) =>
              s.routingId === routing.id &&
              s.stepId === end.stepId &&
              s.workUnitId === workUnitId &&
              inEffect([s], date) !== undefined,
          ),
      );
    });
    if (endsHere) return;
    throw refusal(422, "kpi-002.shopfloor.weight.not-last-step", {
      workUnit: await this.workUnitLabel(workUnitId),
    });
  }

  private async getTag(tagId: string, fieldLabel: string): Promise<AssetTags> {
    const tag = await this.assetTagsStore.get(tagId);
    if (!tag) throw new HTTPException(404, { message: `${fieldLabel} tag not found` });
    return tag;
  }

  async create(input: CreateWorkUnitKpiBinding): Promise<WorkUnitKpiBinding> {
    await this.validateCreate(input);
    return this.writeCreate(input);
  }

  /**
   * PO 2026-11-04 (answer 6, all-or-nothing): a save of several rows. Every row
   * passes the single-binding checks, and the rows are checked against each
   * other, before any row is written. The request runs in one transaction, so a
   * write that fails part-way is rolled back too.
   */
  async createBatch(input: CreateWorkUnitKpiBindingBatch): Promise<WorkUnitKpiBinding[]> {
    const rows: CreateWorkUnitKpiBinding[] = input.rows.map((r) => ({
      ...r,
      workUnitId: input.workUnitId,
      validFrom: input.validFrom,
    }));
    await this.assertBatchShape(rows);
    for (const row of rows) await this.validateCreate(row);
    const created: WorkUnitKpiBinding[] = [];
    for (const row of rows) created.push(await this.writeCreate(row));
    return created;
  }

  /** Rows of one save checked against each other (no store write). */
  private async assertBatchShape(rows: CreateWorkUnitKpiBinding[]) {
    if (rows.length === 0) throw unprocessable("this save has no rows");
    const mainSlots = new Set<string>();
    const listKeys = new Set<string>();
    const qualityTags: AssetTags[] = [];
    const rejectTags: AssetTags[] = [];
    for (const row of rows) {
      if (row.slotId === LIST_SLOT || row.transform === ENRICH_TRANSFORM) {
        const key = `${row.slotId}|${row.assetTagId}`;
        if (listKeys.has(key)) {
          throw new HTTPException(409, {
            message: `slot "${row.slotId}": this tag appears twice in this save`,
          });
        }
        listKeys.add(key);
      } else {
        if (mainSlots.has(row.slotId)) {
          throw new HTTPException(409, {
            message: `slot "${row.slotId}" appears twice in this save — one main row per slot`,
          });
        }
        mainSlots.add(row.slotId);
      }
      if (row.slotId === LIST_SLOT) rejectTags.push(await this.getTag(row.assetTagId, "reject"));
      if (QUALITY_SLOTS.has(row.slotId)) {
        for (const id of [row.assetTagId, row.secondAssetTagId]) {
          if (id) qualityTags.push(await this.getTag(id, "quality"));
        }
      }
    }
    const odd = qualityTags.find((t) => t.uomId !== qualityTags[0]?.uomId);
    if (odd) {
      throw unprocessable(
        "Cannot save: the Quality tags in this save must all use the same unit. Pick tags in one unit.",
      );
    }
    // KPI-007 rule 13 / AC-26 across this save: a total and a reason counter of one
    // machine written together would count every reject twice. Checked here, because
    // the stored rows do not yet include this save's rows.
    for (const total of rejectTags.filter((t) => !t.rejectReasonId)) {
      const reason = rejectTags.find((t) => t.rejectReasonId && t.assetId === total.assetId);
      if (reason) {
        throw refusal(422, "reject_total_and_reasons", {
          total: total.tagName || total.node,
          reason: reason.tagName || reason.node,
        });
      }
    }
  }

  /** Every check for one row. Writes nothing. */
  private async validateCreate(input: CreateWorkUnitKpiBinding): Promise<void> {
    const workUnit = await this.workUnitsStore.get(input.workUnitId);
    if (!workUnit) throw new HTTPException(404, { message: "work unit not found" });

    const slot = await this.slotsStore.get(input.slotId);
    if (!slot) throw new HTTPException(404, { message: "kpi formula slot not found" });
    if (!slot.bindable) {
      throw unprocessable(
        `slot "${slot.slotId}" is not bindable — it is worked out from other data, never bound per work unit`,
      );
    }

    const tag = await this.getTag(input.assetTagId, "primary");

    // Rule 9 / AC-19 (PO 2026-10-02): `measured_total` (a weigher's running
    // weight total) feeds no KPI — no KPI_PARAMETERS row accepts it.
    if (tag.tagRole === "measured_total") {
      throw unprocessable(
        `slot "${slot.slotId}": a "measured_total" tag is never bindable — weight totals are never summed with piece counts`,
      );
    }

    // Rule 1 — (slot, tag_role, transform) must be a KPI_PARAMETERS row.
    const legal = await this.parametersStore.findLegal(
      slot.slotId,
      tag.tagRole,
      input.transform,
      input.validFrom,
    );
    if (!legal) {
      const allowed = (await this.parametersStore.forSlot(slot.slotId, input.validFrom)).map(
        (p) => `${p.tagRole} + ${p.transform}`,
      );
      throw unprocessable(
        `slot "${slot.slotId}": a "${tag.tagRole}" tag with transform "${input.transform}" is not ` +
          `a legal combination in KPI_PARAMETERS` +
          (allowed.length > 0 ? ` (legal: ${allowed.join(", ")})` : ""),
      );
    }

    this.assertHasUnit(tag, slot.slotId);
    await this.assertMassWeightOutput(tag, slot.slotId);
    await this.assertLastStepWeightOutput(slot.slotId, input.workUnitId, input.validFrom);
    await this.assertPlacedOnWorkUnit(tag, input.workUnitId, input.validFrom);

    // Rule 3 — second tag iff infeed_outfeed_derive.
    if (input.transform === PAIRED_TRANSFORM) {
      if (!input.secondAssetTagId) {
        throw unprocessable(
          `slot "${slot.slotId}": transform "${PAIRED_TRANSFORM}" needs a second tag (the paired station's total)`,
        );
      }
      const second = await this.getTag(input.secondAssetTagId, "second");
      // F-07.1 "Two stations": infeed − outfeed, both `tag_role = total` on
      // two assets reached through WORK_UNIT → placement → ASSET_TAGS.
      if (second.tagRole !== "total") {
        throw unprocessable(
          `slot "${slot.slotId}": the second tag for "${PAIRED_TRANSFORM}" must have role "total", not "${second.tagRole}"`,
        );
      }
      if (second.assetId === tag.assetId) {
        throw unprocessable(
          `slot "${slot.slotId}": "${PAIRED_TRANSFORM}" pairs two different assets — both tags belong to asset "${tag.assetId}"`,
        );
      }
      this.assertHasUnit(second, slot.slotId);
      await this.assertPlacedOnWorkUnit(second, input.workUnitId, input.validFrom);
    } else if (input.secondAssetTagId) {
      throw unprocessable(
        `slot "${slot.slotId}": only "${PAIRED_TRANSFORM}" takes a second tag, not "${input.transform}"`,
      );
    }

    if (QUALITY_SLOTS.has(slot.slotId)) await this.assertOneQualityUnit(input, workUnit.id);
    await this.assertTotalOrReasons(tag, input);

    // Rule 8 / AC-15, AC-16, AC-18 (K-13, PO 2026-10-02): one active **main**
    // row per (work unit, slot) — rebinding must name the incumbent it
    // replaces. `quality.reject` holds any number of rows (summed by KPI-003),
    // and `reason_match_enrich` rows sit next to the downtime main row. A
    // list row may not bind the same tag twice (it would be counted twice).
    const active = await this.store.findAllActive(input.workUnitId, input.slotId);
    const isListRow = slot.slotId === LIST_SLOT || input.transform === ENRICH_TRANSFORM;
    if (isListRow) {
      const same = active.find(
        (b) => b.assetTagId === input.assetTagId && b.id !== input.incumbentBindingId,
      );
      if (same) {
        throw new HTTPException(409, {
          message: `slot "${slot.slotId}": this tag is already bound to it`,
        });
      }
    } else {
      const main = active.find(
        (b) => b.transform !== ENRICH_TRANSFORM && b.id !== input.incumbentBindingId,
      );
      if (main) {
        throw new HTTPException(409, {
          message: "this work unit's slot already has an active binding — rebind it explicitly",
        });
      }
    }

    if (input.incumbentBindingId) {
      const incumbent = await this.store.get(input.incumbentBindingId);
      if (
        !incumbent ||
        incumbent.workUnitId !== input.workUnitId ||
        incumbent.slotId !== input.slotId
      ) {
        throw new HTTPException(404, { message: "incumbent binding not found" });
      }
      if (incumbent.validTo !== null) {
        throw new HTTPException(409, { message: "incumbent binding is already closed" });
      }
      if (input.validFrom < incumbent.validFrom) {
        throw unprocessable(
          `slot "${slot.slotId}": the new binding cannot start (${input.validFrom}) before the current one (${incumbent.validFrom})`,
        );
      }
    }
  }

  /** The write half of a create: close the incumbent, insert the row, log the change. */
  private async writeCreate(input: CreateWorkUnitKpiBinding): Promise<WorkUnitKpiBinding> {
    let replaced: WorkUnitKpiBinding | null = null;
    if (input.incumbentBindingId) {
      const incumbent = await this.store.get(input.incumbentBindingId);
      if (!incumbent) throw new HTTPException(404, { message: "incumbent binding not found" });
      replaced = { ...incumbent }; // the store may update `incumbent` in place
      await this.store.update(incumbent.id, { validTo: input.validFrom });
    }

    const created = await this.store.create({
      ...input,
      secondAssetTagId: input.transform === PAIRED_TRANSFORM ? input.secondAssetTagId : undefined,
    });
    // An Edit / Rebind may be back-dated (F-00): the change row tells the KPI
    // calculation which closed shifts to recalculate.
    await this.recordChange(created, replaced ? "edit" : "add", replaced, created);
    return created;
  }

  private async recordChange(
    row: WorkUnitKpiBinding,
    action: WorkUnitKpiBindingChange["action"],
    before: WorkUnitKpiBinding | null,
    after: WorkUnitKpiBinding,
  ): Promise<void> {
    await this.store.recordChange({
      bindingId: row.id,
      workUnitId: row.workUnitId,
      slotId: row.slotId,
      action,
      oldValidFrom: before?.validFrom ?? null,
      oldValidTo: before?.validTo ?? null,
      newValidFrom: after.validFrom,
      newValidTo: after.validTo,
      changedAt: new Date().toISOString(),
    });
  }

  /**
   * End an active binding (KPI-007 rule 11, PO 2026-10-03, docs-molcadx#78).
   * Never reopens, never rewrites what it binds. A rebind closes its
   * incumbent through the store, not through here.
   */
  async update(id: string, patch: UpdateWorkUnitKpiBinding): Promise<WorkUnitKpiBinding> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "work-unit-kpi-bindings not found" });
    if (row.validTo !== null) {
      throw new HTTPException(409, { message: "binding is already closed" });
    }
    // KPI-007 rule 11 / AC-21: only list rows end — a reject tag on
    // quality.reject or a reason tag (reason_match_enrich). A slot's single
    // main row is changed with Rebind.
    if (row.slotId !== "quality.reject" && row.transform !== "reason_match_enrich") {
      throw refusal(422, "end_not_list_row", { slotId: row.slotId });
    }
    // KPI-007 rule 11 / AC-22: the last active row of a required slot can't
    // be ended, so a KPI never drops to "no data" because of an End.
    const slot = await this.slotsStore.get(row.slotId);
    if (slot?.required) {
      const others = (await this.store.findAllActive(row.workUnitId, row.slotId)).filter(
        (b) => b.id !== row.id,
      );
      if (others.length === 0) throw refusal(422, "end_last_row", { slotId: row.slotId });
    }
    if (patch.validTo < row.validFrom) {
      throw unprocessable(
        `validTo (${patch.validTo}) cannot be before validFrom (${row.validFrom})`,
      );
    }
    const before = { ...row };
    const updated = await this.store.update(id, { validTo: patch.validTo });
    if (!updated) throw new HTTPException(404, { message: "work-unit-kpi-bindings not found" });
    await this.recordChange(updated, "end", before, { ...before, validTo: patch.validTo });
    return updated;
  }
}

export { WorkUnitKpiBindingsService };
export type {
  TWorkUnitKpiBindingsService,
  WorkUnitKpiBindingsServiceDeps,
  PagedWorkUnitKpiBindingsResult,
};
