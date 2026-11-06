import { describe, it, expect, beforeEach } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { WorkUnitKpiBindingsService } from "./work-unit-kpi-bindings-service.js";
import { WorkUnitKpiBindingsStore } from "./work-unit-kpi-bindings-store.js";
import { KpiFormulaSlotsStore } from "../kpi-formula-slots/kpi-formula-slots-store.js";
import { KpiParametersStore } from "../kpi-parameters/kpi-parameters-store.js";
import { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { ReferenceDataStore } from "../reference-data/reference-data-store.js";
import { WorkMasterStore } from "../work-master/work-master-store.js";

import type { CreateAssetTags, TagRole } from "../asset-tags/asset-tags.js";
import type { Operation, OperationDependency } from "../work-master/work-master.js";

// Seeds relied on: wu-1 has asset-1 placed as primary since 2026-01-01
// (ap-1); asset-1 carries tag-1 (total) and tag-2 (good); wkb-1/wkb-2 bind
// quality.total / quality.good on wu-1.

function tagInput(assetId: string, tagRole: TagRole, node: string): CreateAssetTags {
  return {
    assetId,
    dataSourceId: "PLC1",
    node,
    kind: "cumulative_counter",
    tagRole,
    rejectReasonId: "",
    downtimeReasonId: "",
    uomId: "pcs",
    countBasis: "unit",
    validFrom: "2024-01-01",
  };
}

async function expectStatus(fn: () => unknown, status: number, messagePart?: string) {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(status);
    if (messagePart) expect((err as HTTPException).message).toContain(messagePart);
    return;
  }
  throw new Error(`expected HTTP ${status}`);
}

/** One work-master step: where it runs, and its place in its routing. */
type StepSpec = { routingId: string; stepId: string; stepNumber: number; workUnitId: string };

/**
 * A work-master store holding exactly these steps (one routing per routingId, valid
 * from 2026-01-01, open). The seeded routing ends on wu-2, so tests state their own.
 */
function workMasterOf(steps: StepSpec[], dependencies: OperationDependency[] = []) {
  const seed = new WorkMasterStore();
  const wm = new WorkMasterStore();
  const routingIds = [...new Set(steps.map((s) => s.routingId))];
  wm.routings = routingIds.map((id) => ({ ...seed.routings[0], id }));
  wm.operations = steps.map((s): Operation => ({
    ...seed.operations[0],
    ...s,
    id: `${s.routingId}-${s.stepId}`,
  }));
  wm.operationWorkUnits = [];
  wm.dependencies = dependencies;
  return wm;
}

/** Default: wu-1 is the only step of its routing, so it is the end step. */
const WU1_ONLY_STEP: StepSpec[] = [
  { routingId: "rt-1", stepId: "step-1", stepNumber: 10, workUnitId: "wu-1" },
];

function makeService(workMaster = workMasterOf(WU1_ONLY_STEP)) {
  const bindings = new WorkUnitKpiBindingsStore();
  const tags = new AssetTagsStore();
  const placements = new AssetPlacementsStore();
  const service = new WorkUnitKpiBindingsService({
    workUnitKpiBindingsStore: bindings,
    kpiFormulaSlotsStore: new KpiFormulaSlotsStore(),
    kpiParametersStore: new KpiParametersStore(),
    assetTagsStore: tags,
    assetPlacementsStore: placements,
    workUnitsStore: new WorkUnitsStore(),
    referenceDataStore: new ReferenceDataStore(),
    workMasterStore: workMaster,
  });
  return { service, bindings, tags, placements };
}

describe("WorkUnitKpiBindingsService.create", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("accepts a KPI_PARAMETERS-legal pair on a tag placed on the work unit", async () => {
    const row = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "availability.downtime_reason",
      assetTagId: "tag-1",
      transform: "stall_bucket",
      validFrom: "2026-03-01",
    });
    expect(row.slotId).toBe("availability.downtime_reason");
    expect(row.secondAssetTagId).toBeNull();
  });

  it("refuses a Quality tag in another unit (KPI-007 AC-12)", async () => {
    // wkb-1 binds quality.total on wu-1 to tag-1 (pcs).
    await ctx.bindings.update("wkb-2", { validTo: "2026-03-01" });
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "good", "Good_Weight"),
      uomId: "kg",
    });
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "quality.good",
          assetTagId: kg.id,
          transform: "none",
          validFrom: "2026-03-01",
        }),
      422,
      "must all use the same unit",
    );
    const pcs = await ctx.tags.create(tagInput("asset-1", "good", "Good_Count"));
    const row = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "quality.good",
      assetTagId: pcs.id,
      transform: "none",
      validFrom: "2026-03-01",
    });
    expect(row.assetTagId).toBe(pcs.id);
  });

  it("binds performance.output to a counter with a unit, never to one without (F-04 §9.7)", async () => {
    const noUnit = await ctx.tags.create({
      ...tagInput("asset-1", "total", "Total_Count"),
      tagName: "Total_Count",
      uomId: "",
    });
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "performance.output",
          assetTagId: noUnit.id,
          transform: "none",
          validFrom: "2026-03-01",
        }),
      422,
      'tag "Total_Count" has no unit',
    );
    // The same counter still feeds a slot that reads no quantity.
    await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "availability.downtime_reason",
      assetTagId: noUnit.id,
      transform: "stall_bucket",
      validFrom: "2026-03-01",
    });

    const counted = await ctx.tags.update(noUnit.id, { uomId: "uom-pcs" });
    const row = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "performance.output",
      assetTagId: counted!.id,
      transform: "none",
      validFrom: "2026-03-01",
    });
    expect(row.assetTagId).toBe(noUnit.id);
  });

  it("rejects another lane's tag, naming its lane (KPI-007 AC-9)", async () => {
    // asset-1 is placed on wu-1; this counter belongs to lane wu-2.
    const tag = await ctx.tags.create({
      ...tagInput("asset-1", "total", "Lane2_Total_Count"),
      workUnitId: "wu-2",
    });
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "availability.downtime_reason",
          assetTagId: tag.id,
          transform: "stall_bucket",
          validFrom: "2026-03-01",
        }),
      422,
      "belongs to lane",
    );
  });

  it("binds a machine-wide tag on any lane of its machine (F-04 §9.7, KPI-007 AC-9)", async () => {
    // asset-1 now sits on lanes wu-1 and wu-2; its stop reason was entered on wu-1.
    await ctx.placements.create({
      assetId: "asset-1",
      workUnitId: "wu-2",
      placementRole: "secondary",
      validFrom: "2026-01-01",
    });
    const tag = await ctx.tags.create({
      ...tagInput("asset-1", "downtime_reason", "Stop_Reason"),
      workUnitId: "wu-1",
    });
    const row = await ctx.service.create({
      workUnitId: "wu-2",
      slotId: "availability.downtime_reason",
      assetTagId: tag.id,
      transform: "none",
      validFrom: "2026-03-01",
    });
    expect(row.workUnitId).toBe("wu-2");
    expect(row.assetTagId).toBe(tag.id);
  });

  it("rejects a pair not in KPI_PARAMETERS, naming the slot", async () => {
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "performance.product_code",
          assetTagId: "tag-1",
          transform: "none",
          validFrom: "2026-03-01",
        }),
      422,
      'slot "performance.product_code"',
    );
  });

  it("rejects a legal role with an illegal transform", async () => {
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "availability.downtime_reason",
          assetTagId: "tag-1",
          transform: "none",
          validFrom: "2026-03-01",
        }),
      422,
      "not a legal combination",
    );
  });

  it("rejects a non-bindable slot", async () => {
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "reliability.interval",
          assetTagId: "tag-1",
          transform: "interval_mean",
          validFrom: "2026-03-01",
        }),
      422,
      "not bindable",
    );
  });

  it("rejects a tag whose asset is placed on another work unit, naming where it is", async () => {
    await ctx.placements.create({
      assetId: "asset-2",
      workUnitId: "wu-2",
      placementRole: "primary",
      validFrom: "2026-01-01",
    });
    const tag = await ctx.tags.create(tagInput("asset-2", "total", "PLC2.TOTAL"));
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "availability.downtime_reason",
          assetTagId: tag.id,
          transform: "stall_bucket",
          validFrom: "2026-03-01",
        }),
      422,
      "WU_02",
    );
  });

  it("rejects a tag whose asset's placement no longer covers validFrom", async () => {
    await ctx.placements.update("ap-1", { validTo: "2026-02-01" });
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "availability.downtime_reason",
          assetTagId: "tag-1",
          transform: "stall_bucket",
          validFrom: "2026-03-01",
        }),
      422,
      "not placed on any work unit",
    );
  });

  it("accepts a tag on a secondary placement", async () => {
    await ctx.placements.create({
      assetId: "asset-2",
      workUnitId: "wu-1",
      placementRole: "secondary",
      validFrom: "2026-01-01",
    });
    const tag = await ctx.tags.create(tagInput("asset-2", "reject", "CW.REJECT"));
    const row = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "quality.reject",
      assetTagId: tag.id,
      transform: "none",
      validFrom: "2026-03-01",
    });
    expect(row.assetTagId).toBe(tag.id);
  });

  describe("second tag", () => {
    async function placeSecondary() {
      await ctx.placements.create({
        assetId: "asset-2",
        workUnitId: "wu-1",
        placementRole: "secondary",
        validFrom: "2026-01-01",
      });
      return await ctx.tags.create(tagInput("asset-2", "total", "CW.TOTAL"));
    }

    it("is required for infeed_outfeed_derive", async () => {
      const secondary = await placeSecondary();
      await expectStatus(
        () =>
          ctx.service.create({
            workUnitId: "wu-1",
            slotId: "quality.reject",
            assetTagId: secondary.id,
            transform: "infeed_outfeed_derive",
            validFrom: "2026-03-01",
          }),
        422,
        "needs a second tag",
      );
    });

    it("is stored for infeed_outfeed_derive when valid", async () => {
      const secondary = await placeSecondary();
      const row = await ctx.service.create({
        workUnitId: "wu-1",
        slotId: "quality.reject",
        assetTagId: secondary.id,
        transform: "infeed_outfeed_derive",
        secondAssetTagId: "tag-1",
        validFrom: "2026-03-01",
      });
      expect(row.secondAssetTagId).toBe("tag-1");
    });

    it("must be a total tag on a different asset", async () => {
      const secondary = await placeSecondary();
      await expectStatus(
        () =>
          ctx.service.create({
            workUnitId: "wu-1",
            slotId: "quality.reject",
            assetTagId: secondary.id,
            transform: "infeed_outfeed_derive",
            secondAssetTagId: "tag-2",
            validFrom: "2026-03-01",
          }),
        422,
        'must have role "total"',
      );
      await expectStatus(
        () =>
          ctx.service.create({
            workUnitId: "wu-1",
            slotId: "availability.downtime_reason",
            assetTagId: "tag-1",
            transform: "stall_bucket",
            secondAssetTagId: secondary.id,
            validFrom: "2026-03-01",
          }),
        422,
        "only",
      );
    });
  });

  it("keeps one active binding per slot and closes the incumbent on rebind", async () => {
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "quality.total",
          assetTagId: "tag-1",
          transform: "unit_convert",
          validFrom: "2026-03-01",
        }),
      409,
    );
    const next = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "quality.total",
      assetTagId: "tag-1",
      transform: "unit_convert",
      validFrom: "2026-03-01",
      incumbentBindingId: "wkb-1",
    });
    expect((await ctx.bindings.get("wkb-1"))?.validTo).toBe("2026-03-01");
    expect(next.validTo).toBeNull();
  });
});

describe("rows per slot (KPI-007 rule 8, K-13 resolved 2026-10-02)", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("keeps every bound reject tag, one row per tag (AC-15)", async () => {
    const sealLeak = await ctx.tags.create(tagInput("asset-1", "reject", "Reject_Seal"));
    const filmTear = await ctx.tags.create(tagInput("asset-1", "reject", "Reject_Film"));
    for (const tag of [sealLeak, filmTear]) {
      await ctx.service.create({
        workUnitId: "wu-1",
        slotId: "quality.reject",
        assetTagId: tag.id,
        transform: "none",
        validFrom: "2026-03-01",
      });
    }
    expect(await ctx.bindings.findAllActive("wu-1", "quality.reject")).toHaveLength(2);
    // The same tag twice would count it twice.
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "quality.reject",
          assetTagId: sealLeak.id,
          transform: "none",
          validFrom: "2026-03-01",
        }),
      409,
      "already bound",
    );
  });

  it("refuses a second quality.total main row (AC-18)", async () => {
    // wkb-1 already binds quality.total on wu-1.
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "quality.total",
          assetTagId: "tag-1",
          transform: "none",
          validFrom: "2026-03-01",
        }),
      409,
    );
  });

  it("adds reason tags next to the one main downtime row, never a second main (AC-16)", async () => {
    await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "availability.downtime_reason",
      assetTagId: "tag-1",
      transform: "stall_bucket",
      validFrom: "2026-03-01",
    });
    for (const node of ["Reason_A", "Reason_B"]) {
      const reason = await ctx.tags.create({
        ...tagInput("asset-1", "downtime_reason", node),
        kind: "enum",
        uomId: "",
      });
      await ctx.service.create({
        workUnitId: "wu-1",
        slotId: "availability.downtime_reason",
        assetTagId: reason.id,
        transform: "reason_match_enrich",
        validFrom: "2026-03-01",
      });
    }
    expect(await ctx.bindings.findAllActive("wu-1", "availability.downtime_reason")).toHaveLength(
      3,
    );
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "availability.downtime_reason",
          assetTagId: "tag-1",
          transform: "stall_bucket",
          validFrom: "2026-03-02",
        }),
      409,
    );
  });

  it("never binds a measured_total tag (AC-19)", async () => {
    const weight = await ctx.tags.create({
      ...tagInput("asset-1", "measured_total", "Total_Weight"),
      uomId: "g",
    });
    await expectStatus(
      () =>
        ctx.service.create({
          workUnitId: "wu-1",
          slotId: "quality.total",
          assetTagId: weight.id,
          transform: "none",
          validFrom: "2026-03-01",
        }),
      422,
      "never bindable",
    );
  });
});

describe("WorkUnitKpiBindingsService.update — End (KPI-007 rule 11)", () => {
  let ctx: ReturnType<typeof makeService>;
  /** Two reject tags bound on wu-1 from 2026-03-01: "Seal leak" and "Underweight". */
  async function twoRejectRows() {
    const ids: string[] = [];
    for (const node of ["Reject_Seal", "Reject_Underweight"]) {
      const tag = await ctx.tags.create(tagInput("asset-1", "reject", node));
      const row = await ctx.service.create({
        workUnitId: "wu-1",
        slotId: "quality.reject",
        assetTagId: tag.id,
        transform: "none",
        validFrom: "2026-03-01",
      });
      ids.push(row.id);
    }
    return ids;
  }
  beforeEach(() => {
    ctx = makeService();
  });

  it("ends one of two reject rows and keeps the other (AC-20)", async () => {
    const [seal, underweight] = await twoRejectRows();
    const ended = await ctx.service.update(seal, { validTo: "2026-10-03" });
    expect(ended.validTo).toBe("2026-10-03");
    const active = await ctx.bindings.findAllActive("wu-1", "quality.reject");
    expect(active.map((b) => b.id)).toEqual([underweight]);
  });

  it("refuses End on a slot's single main row — only Rebind changes it (AC-21)", async () => {
    // wkb-1 is the one quality.total row on wu-1.
    await expectStatus(
      () => ctx.service.update("wkb-1", { validTo: "2026-10-03" }),
      422,
      "end_not_list_row",
    );
  });

  it("refuses ending the last active row of a required slot (AC-22)", async () => {
    const [seal, underweight] = await twoRejectRows();
    await ctx.service.update(seal, { validTo: "2026-10-03" });
    await expectStatus(
      () => ctx.service.update(underweight, { validTo: "2026-10-03" }),
      422,
      "end_last_row",
    );
  });

  it("only closes an active row with validTo ≥ validFrom", async () => {
    const [seal] = await twoRejectRows();
    await expectStatus(() => ctx.service.update(seal, { validTo: "2026-02-28" }), 422);
    await ctx.service.update(seal, { validTo: "2026-10-03" });
    await expectStatus(() => ctx.service.update(seal, { validTo: "2026-10-04" }), 409);
  });
});

describe("total reject counter vs reason counters (KPI-007 rule 13, PO 2026-10-04)", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  async function refusalCode(fn: () => unknown): Promise<Record<string, unknown>> {
    try {
      await fn();
    } catch (err) {
      return JSON.parse((err as HTTPException).message.slice("REFUSAL:".length));
    }
    throw new Error("expected a refusal");
  }

  const bindReject = (assetTagId: string, extra: { incumbentBindingId?: string } = {}) =>
    ctx.service.create({
      workUnitId: "wu-1",
      slotId: "quality.reject",
      assetTagId,
      transform: "none",
      validFrom: "2026-03-01",
      ...extra,
    });

  it("refuses a machine's reason counter next to its bound total (AC-26)", async () => {
    const total = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "Total_NG_Prod"),
      tagName: "Total_NG_Prod",
    });
    const seal = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "NG_Seal_Leak"),
      tagName: "NG_Seal_Leak",
      rejectReasonId: "rr-seal",
    });
    await bindReject(total.id);
    expect(await refusalCode(() => bindReject(seal.id))).toEqual({
      code: "reject_total_and_reasons",
      total: "Total_NG_Prod",
      reason: "NG_Seal_Leak",
    });
  });

  it("refuses the total next to bound reason counters, naming the total first", async () => {
    const seal = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "NG_Seal_Leak"),
      tagName: "NG_Seal_Leak",
      rejectReasonId: "rr-seal",
    });
    const total = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "Total_NG_Prod"),
      tagName: "Total_NG_Prod",
    });
    await bindReject(seal.id);
    expect((await refusalCode(() => bindReject(total.id))).total).toBe("Total_NG_Prod");
  });

  it("switches from the total to a reason counter by Edit, writing an edit change row (AC-27)", async () => {
    const total = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "Total_NG_Prod"),
      tagName: "Total_NG_Prod",
    });
    const seal = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "NG_Seal_Leak"),
      tagName: "NG_Seal_Leak",
      rejectReasonId: "rr-seal",
    });
    const old = await bindReject(total.id);
    const edited = await ctx.service.create({
      workUnitId: "wu-1",
      slotId: "quality.reject",
      assetTagId: seal.id,
      transform: "none",
      validFrom: "2026-04-01",
      incumbentBindingId: old.id,
    });
    expect((await ctx.bindings.get(old.id))?.validTo).toBe("2026-04-01");
    const changes = await ctx.bindings.changes();
    expect(changes.map((c) => c.action)).toEqual(["add", "edit"]);
    expect(changes[1]).toMatchObject({
      bindingId: edited.id,
      oldValidFrom: "2026-03-01",
      oldValidTo: null,
      newValidFrom: "2026-04-01",
      newValidTo: null,
    });
  });

  it("writes an end change row when a list row is ended (F-00 back-dating)", async () => {
    const a = await ctx.tags.create(tagInput("asset-1", "reject", "Reject_A"));
    const b = await ctx.tags.create(tagInput("asset-1", "reject", "Reject_B"));
    const row = await bindReject(a.id);
    await bindReject(b.id);
    await ctx.service.update(row.id, { validTo: "2026-05-01" });
    const end = (await ctx.bindings.changes()).at(-1)!;
    expect(end).toMatchObject({ action: "end", oldValidTo: null, newValidTo: "2026-05-01" });
  });
});

// KPI-007 rule 7 / AC-31 (PO 2026-11-03): shopfloor.weight_output takes kg or g only.
describe("WorkUnitKpiBindingsService.create — shopfloor.weight_output", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const weightInput = (assetTagId: string) => ({
    workUnitId: "wu-1",
    slotId: "shopfloor.weight_output",
    assetTagId,
    transform: "unit_convert" as const,
    validFrom: "2026-03-01",
  });

  it("refuses a pcs tag with the unit-refused code, naming the tag and its unit (AC-31)", async () => {
    const pcs = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Pcs"),
      uomId: "pcs",
    });
    await expectStatus(
      () => ctx.service.create(weightInput(pcs.id)),
      422,
      "kpi-002.shopfloor.weight.unit-refused",
    );
    await expectStatus(() => ctx.service.create(weightInput(pcs.id)), 422, '"unit":"pcs"');
  });

  it("refuses a tag with no unit (mass only, never assumed)", async () => {
    const noUnit = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_NoUnit"),
      uomId: "",
    });
    await expectStatus(
      () => ctx.service.create(weightInput(noUnit.id)),
      422,
      "kpi-002.shopfloor.weight.unit-refused",
    );
  });

  it("saves a kg tag and a g tag with unit_convert (AC-31)", async () => {
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg"),
      uomId: "kg",
    });
    const row = await ctx.service.create(weightInput(kg.id));
    expect(row.slotId).toBe("shopfloor.weight_output");
    expect(row.transform).toBe("unit_convert");

    const fresh = makeService();
    const g = await fresh.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_G"),
      uomId: "g",
    });
    const gRow = await fresh.service.create(weightInput(g.id));
    expect(gRow.assetTagId).toBe(g.id);
  });

  it("refuses a weight_output tag with any transform other than unit_convert (rule 1)", async () => {
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg_None"),
      uomId: "kg",
    });
    await expectStatus(
      () => ctx.service.create({ ...weightInput(kg.id), transform: "none" }),
      422,
      "not a legal combination",
    );
  });
});

describe("KPI-007 weight output binds only to the end step of a routing (PO answer 2a)", () => {
  const kgInput = (assetTagId: string) => ({
    workUnitId: "wu-1",
    slotId: "shopfloor.weight_output",
    assetTagId,
    transform: "unit_convert" as const,
    validFrom: "2026-03-01",
  });

  it("allows a work unit that is the end step of one routing", async () => {
    const ctx = makeService(workMasterOf(WU1_ONLY_STEP));
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg_End"),
      uomId: "kg",
    });
    const row = await ctx.service.create(kgInput(kg.id));
    expect(row.slotId).toBe("shopfloor.weight_output");
  });

  it("refuses a work unit that is the end step of no routing, and saves nothing", async () => {
    // rt-1 runs wu-1 first and ends on wu-2, so wu-1 is a middle step only.
    const ctx = makeService(
      workMasterOf([
        { routingId: "rt-1", stepId: "step-1", stepNumber: 10, workUnitId: "wu-1" },
        { routingId: "rt-1", stepId: "step-2", stepNumber: 20, workUnitId: "wu-2" },
      ]),
    );
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg_Middle"),
      uomId: "kg",
    });
    await expectStatus(
      () => ctx.service.create(kgInput(kg.id)),
      422,
      "kpi-002.shopfloor.weight.not-last-step",
    );
    expect(await ctx.bindings.findAllActive("wu-1", "shopfloor.weight_output")).toHaveLength(0);
  });

  it("refuses a work unit that is the end step only of a draft routing (PO 2b)", async () => {
    const wm = workMasterOf(WU1_ONLY_STEP);
    wm.routings = wm.routings.map((r) => ({ ...r, status: "draft" as const }));
    const ctx = makeService(wm);
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg_Draft"),
      uomId: "kg",
    });
    await expectStatus(
      () => ctx.service.create(kgInput(kg.id)),
      422,
      "kpi-002.shopfloor.weight.not-last-step",
    );
    expect(await ctx.bindings.findAllActive("wu-1", "shopfloor.weight_output")).toHaveLength(0);
  });

  it("allows a work unit that is the end step of one routing and a middle step of another", async () => {
    const ctx = makeService(
      workMasterOf([
        { routingId: "rt-1", stepId: "step-1", stepNumber: 10, workUnitId: "wu-1" },
        { routingId: "rt-1", stepId: "step-2", stepNumber: 20, workUnitId: "wu-2" },
        { routingId: "rt-2", stepId: "step-3", stepNumber: 10, workUnitId: "wu-3" },
        { routingId: "rt-2", stepId: "step-4", stepNumber: 20, workUnitId: "wu-1" },
      ]),
    );
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "weight_output", "Weight_Kg_Either"),
      uomId: "kg",
    });
    const row = await ctx.service.create(kgInput(kg.id));
    expect(row.slotId).toBe("shopfloor.weight_output");
  });
});

describe("WorkUnitKpiBindingsService.createBatch (PO 2026-11-04, answer 6)", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("saves several rows at one effective date, closing the incumbent", async () => {
    const rows = await ctx.service.createBatch({
      workUnitId: "wu-1",
      validFrom: "2026-03-01",
      rows: [
        {
          slotId: "quality.total",
          assetTagId: "tag-1",
          transform: "unit_convert",
          incumbentBindingId: "wkb-1",
        },
        { slotId: "availability.downtime_reason", assetTagId: "tag-1", transform: "stall_bucket" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.validFrom === "2026-03-01")).toBe(true);
    expect((await ctx.bindings.get("wkb-1"))?.validTo).toBe("2026-03-01");
  });

  it("writes nothing when one row fails — all or nothing (AC-35)", async () => {
    const before = (await ctx.bindings.changes()).length;
    await expectStatus(
      () =>
        ctx.service.createBatch({
          workUnitId: "wu-1",
          validFrom: "2026-03-01",
          rows: [
            {
              slotId: "availability.downtime_reason",
              assetTagId: "tag-1",
              transform: "stall_bucket",
            },
            // wkb-1 is the active quality.total main row: no incumbent named → 409.
            { slotId: "quality.total", assetTagId: "tag-1", transform: "unit_convert" },
          ],
        }),
      409,
    );
    expect(await ctx.bindings.findAllActive("wu-1", "availability.downtime_reason")).toHaveLength(
      0,
    );
    expect((await ctx.bindings.get("wkb-1"))?.validTo).toBeNull();
    expect((await ctx.bindings.changes()).length).toBe(before);
  });

  it("refuses two rows for the same main slot in one save", async () => {
    await expectStatus(
      () =>
        ctx.service.createBatch({
          workUnitId: "wu-1",
          validFrom: "2026-03-01",
          rows: [
            {
              slotId: "availability.downtime_reason",
              assetTagId: "tag-1",
              transform: "stall_bucket",
            },
            {
              slotId: "availability.downtime_reason",
              assetTagId: "tag-1",
              transform: "stall_bucket",
            },
          ],
        }),
      409,
      "one main row per slot",
    );
  });

  it("refuses the same tag twice on one list slot in one save", async () => {
    const extra = await ctx.tags.create({ ...tagInput("asset-1", "reject", "Reject_A") });
    await expectStatus(
      () =>
        ctx.service.createBatch({
          workUnitId: "wu-1",
          validFrom: "2026-03-01",
          rows: [
            { slotId: "quality.reject", assetTagId: extra.id, transform: "none" },
            { slotId: "quality.reject", assetTagId: extra.id, transform: "none" },
          ],
        }),
      409,
      "appears twice",
    );
  });

  it("refuses a total and a reason counter of one machine in one save (AC-26)", async () => {
    const total = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "Total_NG_Prod"),
      tagName: "Total_NG_Prod",
    });
    const seal = await ctx.tags.create({
      ...tagInput("asset-1", "reject", "NG_Seal_Leak"),
      tagName: "NG_Seal_Leak",
      rejectReasonId: "rr-seal",
    });
    const before = (await ctx.bindings.changes()).length;
    await expectStatus(
      () =>
        ctx.service.createBatch({
          workUnitId: "wu-1",
          validFrom: "2026-03-01",
          rows: [
            { slotId: "quality.reject", assetTagId: total.id, transform: "none" },
            { slotId: "quality.reject", assetTagId: seal.id, transform: "none" },
          ],
        }),
      422,
      "reject_total_and_reasons",
    );
    expect((await ctx.bindings.changes()).length).toBe(before);
  });

  it("refuses quality rows in two units in one save", async () => {
    const kg = await ctx.tags.create({
      ...tagInput("asset-1", "good", "Good_Weight"),
      uomId: "kg",
    });
    await expectStatus(
      () =>
        ctx.service.createBatch({
          workUnitId: "wu-1",
          validFrom: "2026-03-01",
          rows: [
            {
              slotId: "quality.total",
              assetTagId: "tag-1",
              transform: "unit_convert",
              incumbentBindingId: "wkb-1",
            },
            {
              slotId: "quality.good",
              assetTagId: kg.id,
              transform: "none",
              incumbentBindingId: "wkb-2",
            },
          ],
        }),
      422,
      "same unit",
    );
    expect((await ctx.bindings.get("wkb-1"))?.validTo).toBeNull();
  });

  it("refuses an empty save", async () => {
    await expectStatus(
      () => ctx.service.createBatch({ workUnitId: "wu-1", validFrom: "2026-03-01", rows: [] }),
      422,
    );
  });
});
