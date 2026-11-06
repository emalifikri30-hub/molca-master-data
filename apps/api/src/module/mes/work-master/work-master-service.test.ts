import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { ProductsStore } from "../products/products-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { WorkMasterService } from "./work-master-service.js";
import { WorkMasterStore } from "./work-master-store.js";

import type { BomLine } from "./work-master.js";

// Seed: rt-1 (released v1) routes FG-BREAD-500 (prod-3, base pack = uom-5) at
// wc-1 (wu-1 Filler Cell → wu-2 Capping Cell); conv-1 says 1 carton (uom-6) =
// 12 pack. uom-2 = kg has no path. tc-3 = hours. bom-1 (released v1) is
// prod-3's BOM; bom-2 is SF-DOUGH's (prod-2, semi-finished).
const step = {
  stepNumber: 30,
  stepName: "Capper",
  stepType: null,
  workUnitId: "wu-2",
  requiredWorkUnitClassId: null,
  timeConversionId: "tc-1",
  batchSize: 1,
  standardSpeedValue: null,
  speedUomId: null,
  standardSetupTime: null,
  setupTimeConversionId: null,
  crewSize: null,
  plannedShrinkage: null,
  yieldMinPct: null,
  yieldMaxPct: null,
  maxHoldTime: null,
  holdTimeConversionId: null,
  validFrom: "2026-07-01",
};

async function refusalOf(fn: () => unknown): Promise<{ kind?: string } & Record<string, unknown>> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) {
      return JSON.parse(err.message.replace(/^REFUSAL:/, "")).refusal ?? {};
    }
    throw err;
  }
  return {};
}

const line = (l: Partial<BomLine> = {}): Omit<BomLine, "id"> => ({
  componentProductId: "prod-2",
  stepId: null,
  lineUse: "consumed",
  isPrimaryOutput: null,
  qtyPerUnit: 0.55,
  uomId: "uom-2",
  scrapFactor: 0.02,
  dispenseToleranceType: null,
  dispenseToleranceValue: null,
  ...l,
});

describe("WorkMasterService", () => {
  let svc: WorkMasterService;
  let draftId: string;
  beforeEach(async () => {
    svc = new WorkMasterService({
      workMasterStore: new WorkMasterStore(),
      productsReaderRepository: new ProductsStore(),
      workUnitsStore: new WorkUnitsStore(),
    });
    draftId = (await svc.newDraft("rt-1")).id;
  });

  describe("item unit (WMS-003 rules 9–11)", () => {
    it("saves a step per carton when 1 carton = 12 pack is in force (AC-9)", async () => {
      const op = await svc.addOperation({
        ...step,
        routingId: draftId,
        cycleTimeValue: 216,
        uomId: "uom-6",
      });
      expect(op.uomId).toBe("uom-6");
    });

    it("blocks a step with no conversion path to the base unit (AC-8)", async () => {
      const body = await refusalOf(() =>
        svc.addOperation({ ...step, routingId: draftId, cycleTimeValue: 5, uomId: "uom-2" }),
      );
      expect(body.kind).toBe("no_conversion");
    });

    it("stores a typed rate as typed, rounded half-up to 6 decimals (AC-13, AC-15)", async () => {
      const perHour = await svc.addOperation({
        ...step,
        routingId: draftId,
        timeConversionId: "tc-3",
        cycleTimeValue: 1 / 500,
        uomId: "uom-5",
      });
      expect(perHour.cycleTimeValue).toBe(0.002);
      expect(perHour.timeConversionId).toBe("tc-3");
      const seven = await svc.addOperation({
        ...step,
        routingId: draftId,
        stepNumber: 40,
        timeConversionId: "tc-3",
        cycleTimeValue: 1 / 700,
        uomId: "uom-5",
      });
      expect(seven.cycleTimeValue).toBe(0.001429);
    });
  });

  describe("routing versions (WMS-003)", () => {
    it("opens version 2 as a draft copy; Release retires version 1 (AC-16)", async () => {
      expect(
        await refusalOf(() =>
          svc.addOperation({ ...step, routingId: "rt-1", cycleTimeValue: 20, uomId: "uom-5" }),
        ),
      ).toMatchObject({ kind: "not_draft", status: "released" });
      const draft = svc.data.routings.find((r) => r.id === draftId)!;
      expect(draft).toMatchObject({ version: 2, status: "draft" });
      const copied = svc.data.operations.filter((o) => o.routingId === draftId);
      expect(copied.map((o) => o.stepId).sort()).toEqual(["step-1", "step-2"]);
      expect(svc.data.instructions.some((i) => i.routingId === draftId)).toBe(true);
      await svc.addOperation({ ...step, routingId: draftId, cycleTimeValue: 20, uomId: "uom-5" });
      await svc.releaseRouting(draftId);
      const v1 = svc.data.routings.find((r) => r.id === "rt-1")!;
      expect(v1.status).toBe("retired");
      expect(draft.status).toBe("released");
      expect(svc.data.operations.filter((o) => o.routingId === "rt-1")).toHaveLength(2);
    });

    it("refuses releasing a version that drops a step a released BOM line uses (W-22, AC-36)", async () => {
      // bom-1 (released, prod-3's flow pf-1) has its line enter at step-1 of rt-1.
      const bom = svc.data.boms.find((b) => b.id === "bom-1")!;
      bom.lines[0].stepId = "step-1";
      await svc.removeStep(draftId, "step-1");
      expect(await refusalOf(() => svc.releaseRouting(draftId))).toMatchObject({
        kind: "step_used_by_bom",
        version: 2,
        bomVersion: 1,
      });
      // Nothing changed: version 1 is still the released one.
      expect(svc.data.routings.find((r) => r.id === "rt-1")!.status).toBe("released");
      // Once the line is moved to a step the new version keeps, the release goes through.
      bom.lines[0].stepId = "step-2";
      expect((await svc.releaseRouting(draftId)).status).toBe("released");
    });

    it("keeps one draft per flow and work center (draft_exists)", async () => {
      expect(await refusalOf(() => svc.newDraft("rt-1"))).toMatchObject({
        kind: "draft_exists",
        draftId,
      });
    });

    it("pre-fills one step per ticked work unit, named after it (AC-19, rule 12)", async () => {
      const r = await svc.createRouting({
        productId: "prod-2",
        workCenterId: "wc-1",
        validFrom: "2026-07-01",
        steps: [
          { workUnitId: "wu-1", timeConversionId: "tc-1" },
          { workUnitId: "wu-2", timeConversionId: "tc-1" },
        ],
      });
      const steps = svc.data.operations
        .filter((o) => o.routingId === r.id)
        .sort((a, b) => a.stepNumber - b.stepNumber);
      expect(steps.map((s) => s.stepName)).toEqual(["Filler Cell", "Capping Cell"]);
      expect(steps.every((s) => s.cycleTimeValue === null)).toBe(true);
      // A flow "Standard" was made for the product (WMS-002 context).
      expect(svc.data.flows.find((f) => f.productId === "prod-2")?.flowName).toBe("Standard");
      // Release needs every cycle time (rule 1, AC-3).
      expect((await refusalOf(() => svc.releaseRouting(r.id))).kind).toBe("cycle_not_positive");
    });

    it("refuses a step with both a work unit and a class, or no name (rule 4, rule 12)", async () => {
      expect(
        (
          await refusalOf(() =>
            svc.addOperation({
              ...step,
              routingId: draftId,
              requiredWorkUnitClassId: "mixer",
              cycleTimeValue: 20,
              uomId: "uom-5",
            }),
          )
        ).kind,
      ).toBe("station_or_class");
      expect(
        (
          await refusalOf(() =>
            svc.updateStep(draftId, "step-1", {
              ...step,
              stepNumber: 10,
              stepName: " ",
              cycleTimeValue: 20,
              uomId: "uom-5",
            }),
          )
        ).kind,
      ).toBe("step_name_required");
    });

    it("refuses steps that wait for each other in a loop (AC-21)", async () => {
      const filler = {
        ...step,
        stepNumber: 10,
        stepName: "Filler",
        workUnitId: "wu-1",
        cycleTimeValue: 20,
        uomId: "uom-5",
      };
      await svc.updateStep(draftId, "step-2", {
        ...filler,
        stepNumber: 20,
        stepName: "Capper",
        workUnitId: "wu-2",
        waitsFor: ["step-1"],
      });
      const body = await refusalOf(() =>
        svc.updateStep(draftId, "step-1", { ...filler, waitsFor: ["step-2"] }),
      );
      expect(body.kind).toBe("loop");
      expect((body.steps as Array<string>).sort()).toEqual(["Capper", "Filler"]);
    });

    // PRD-003 WMS-003 rule 21 (PO, 2026-10-22, F-08 §9.2.3): a routing ends in exactly one step.
    // Refused on save: a step that would leave two ends is not written.
    it("refuses a save that leaves two end steps; the joining step is accepted (WMS-003 AC-37)", async () => {
      const cell = { ...step, cycleTimeValue: 20, uomId: "uom-5", workUnitId: "wu-1" };
      await svc.updateStep(draftId, "step-1", { ...cell, stepNumber: 10, stepName: "Bake" });
      await svc.updateStep(draftId, "step-2", {
        ...cell,
        stepNumber: 20,
        stepName: "Glaze",
        waitsFor: ["step-1"],
      });
      // Print also waits for Bake: Glaze and Print both end the version, so the save is refused.
      expect(
        await refusalOf(() =>
          svc.addOperation({
            ...cell,
            routingId: draftId,
            stepNumber: 30,
            stepName: "Print",
            waitsFor: ["step-1"],
          }),
        ),
      ).toMatchObject({ kind: "end_steps", steps: ["Glaze", "Print"] });
      expect(
        svc.data.operations.some((o) => o.routingId === draftId && o.stepName === "Print"),
      ).toBe(false);
      // Pack waits for Glaze: Glaze is no longer an end, Pack is the only one, and the save goes through.
      await svc.addOperation({
        ...cell,
        routingId: draftId,
        stepNumber: 40,
        stepName: "Pack",
        waitsFor: ["step-2"],
      });
      await svc.releaseRouting(draftId);
      expect(svc.data.routings.find((r) => r.id === draftId)).toMatchObject({ status: "released" });
    });

    it("refuses a step edit that leaves two end steps and keeps the stored waits (WMS-003 AC-37)", async () => {
      const cell = { ...step, cycleTimeValue: 20, uomId: "uom-5", workUnitId: "wu-1" };
      await svc.updateStep(draftId, "step-1", { ...cell, stepNumber: 10, stepName: "Bake" });
      await svc.updateStep(draftId, "step-2", {
        ...cell,
        stepNumber: 20,
        stepName: "Glaze",
        waitsFor: ["step-1"],
      });
      await svc.addOperation({
        ...cell,
        routingId: draftId,
        stepNumber: 40,
        stepName: "Pack",
        waitsFor: ["step-2"],
      });
      // Glaze stops waiting for Bake: Bake and Pack are both ends now.
      expect(
        await refusalOf(() =>
          svc.updateStep(draftId, "step-2", {
            ...cell,
            stepNumber: 20,
            stepName: "Glaze",
            waitsFor: [],
          }),
        ),
      ).toMatchObject({ kind: "end_steps", steps: ["Bake", "Pack"] });
      expect(
        svc.data.dependencies.some(
          (d) => d.stepId === "step-2" && d.predecessorStepId === "step-1",
        ),
      ).toBe(true);
    });

    it('releases a routing with no "Waits for" rows: the last step is the one end (WMS-003 AC-37)', async () => {
      const cell = { ...step, cycleTimeValue: 20, uomId: "uom-5", workUnitId: "wu-1" };
      await svc.addOperation({ ...cell, routingId: draftId, stepNumber: 40, stepName: "Pack" });
      await svc.releaseRouting(draftId);
      expect(svc.data.routings.find((r) => r.id === draftId)).toMatchObject({ status: "released" });
    });

    it("dates a standard change, carrying shrinkage, yield and hold time (AC-1, AC-28)", async () => {
      const next = await svc.changeStandard("op-1", {
        validFrom: "2026-07-01",
        cycleTimeValue: 18,
        standardSpeedValue: null,
        standardSetupTime: 15,
        setupTimeConversionId: "tc-2",
        crewSize: 2,
        batchSize: null,
        plannedShrinkage: 0.04,
        yieldMinPct: 93,
        yieldMaxPct: 97,
        maxHoldTime: 2,
        holdTimeConversionId: "tc-3",
      });
      expect(next).toMatchObject({ stepId: "step-1", plannedShrinkage: 0.04, maxHoldTime: 2 });
      expect(svc.data.operations.find((o) => o.id === "op-1")?.validTo).toBe("2026-07-01");
      expect(
        (
          await refusalOf(() =>
            svc.changeStandard("op-2", {
              validFrom: "2026-07-01",
              cycleTimeValue: 200,
              standardSpeedValue: null,
              standardSetupTime: null,
              crewSize: null,
              batchSize: null,
              maxHoldTime: 2,
              holdTimeConversionId: null,
            }),
          )
        ).kind,
      ).toBe("hold_time");
    });

    it("dates an instruction text change, but needs a draft to add one (AC-29)", async () => {
      const current = { instructionId: "instr-1", requiresConfirmation: true };
      const checks = [
        {
          checkId: "check-1",
          checkName: "Pack weight",
          valueType: "numeric" as const,
          targetValue: 500,
          minValue: 480,
          maxValue: 520,
          uomId: "uom-3",
          sampleCount: 5,
          frequencyType: "interval" as const,
          frequencyIntervalValue: 30,
          frequencyIntervalConversionId: "tc-2",
          isCritical: true,
        },
      ];
      const saved = await svc.saveDetail("rt-1", "step-1", {
        validFrom: "2026-07-01",
        instructions: [{ ...current, instructionText: "Check the film roll" }],
        checks,
      });
      expect(saved.instructions[0]).toMatchObject({
        instructionText: "Check the film roll",
        sequence: 1,
      });
      expect(svc.data.instructions.find((i) => i.id === "oi-1")?.validTo).toBe("2026-07-01");
      const add = () =>
        svc.saveDetail("rt-1", "step-1", {
          validFrom: "2026-08-01",
          instructions: [
            { ...current, instructionText: "Check the film roll" },
            { instructionText: "Start the filler", requiresConfirmation: false },
          ],
          checks,
        });
      expect((await refusalOf(add)).kind).toBe("not_draft");
      const onDraft = await svc.saveDetail(draftId, "step-1", {
        validFrom: "2026-08-01",
        instructions: [
          { instructionText: "Start the filler", requiresConfirmation: false },
          { ...current, instructionText: "Check the film roll" },
        ],
        checks,
      });
      expect(onDraft.instructions.map((i) => i.sequence)).toEqual([1, 2]);
    });

    it("refuses a check that breaks the rules (AC-30)", async () => {
      const body = await refusalOf(() =>
        svc.saveDetail(draftId, "step-1", {
          validFrom: "2026-08-01",
          instructions: [],
          checks: [
            {
              checkName: "Tablet weight",
              valueType: "numeric",
              targetValue: 250,
              minValue: null,
              maxValue: null,
              uomId: "uom-3",
              sampleCount: 10,
              frequencyType: "interval",
              frequencyIntervalValue: 15,
              frequencyIntervalConversionId: "tc-2",
              isCritical: true,
            },
          ],
        }),
      );
      expect(body).toMatchObject({ kind: "check_no_limit", checkName: "Tablet weight" });
    });
  });

  describe("BOM versions (WMS-002)", () => {
    it("saves a new BOM as a draft, version 1 of an automatic flow (AC-1)", async () => {
      svc.data.boms = svc.data.boms.filter((b) => b.productId !== "prod-3");
      svc.data.flows = svc.data.flows.filter((f) => f.productId !== "prod-3");
      const bom = await svc.createBom({
        productId: "prod-3",
        validFrom: "2026-12-01",
        lines: [line()],
      });
      expect(bom).toMatchObject({ version: 1, status: "draft", baseQty: 1, baseUomId: "uom-5" });
      expect(svc.data.flows.find((f) => f.id === bom.flowId)?.flowName).toBe("Standard");
    });

    it("rejects a zero quantity (AC-2)", async () => {
      expect(
        (
          await refusalOf(() =>
            svc.updateBom("bom-1", { validFrom: "2026-12-01", lines: [line({ qtyPerUnit: 0 })] }),
          )
        ).kind,
      ).toBe("qty_not_positive");
    });

    it("opens version 2 for an edit of a released version; release retires version 1 (AC-4)", async () => {
      const v2 = await svc.updateBom("bom-1", {
        validFrom: "2026-12-01",
        lines: [line(), line({ componentProductId: "prod-1", qtyPerUnit: 0.1 })],
      });
      const v1 = svc.data.boms.find((b) => b.id === "bom-1")!;
      expect(v2).toMatchObject({ version: 2, status: "draft" });
      expect(v1.lines).toHaveLength(1);
      expect(v1.status).toBe("released");
      await svc.releaseBom(v2.id);
      expect(v1).toMatchObject({ status: "retired", validTo: "2026-12-01" });
      expect(v2.status).toBe("released");
    });

    it("refuses a release that overlaps a released version (AC-5)", async () => {
      const v2 = await svc.updateBom("bom-1", { validFrom: "2025-12-01", lines: [line()] });
      expect(await refusalOf(() => svc.releaseBom(v2.id))).toMatchObject({
        kind: "overlap",
        validFrom: "2026-01-01",
        validTo: null,
      });
    });

    it("allows phantom only on a semi-finished product (AC-13)", async () => {
      expect(
        (
          await refusalOf(() =>
            svc.updateBom("bom-1", { validFrom: "2026-12-01", isPhantom: true, lines: [line()] }),
          )
        ).kind,
      ).toBe("phantom_not_semi");
      const dough = await svc.updateBom("bom-2", {
        validFrom: "2026-12-01",
        isPhantom: true,
        lines: [line({ componentProductId: "prod-1", qtyPerUnit: 0.6 })],
      });
      expect(dough.isPhantom).toBe(true);
    });

    it("opens the next version for a tolerance change on a released BOM (AC-19)", async () => {
      const v2 = await svc.updateBom("bom-1", {
        validFrom: "2026-12-01",
        lines: [line({ dispenseToleranceType: "percent", dispenseToleranceValue: 1 })],
      });
      expect(v2.version).toBe(2);
      expect(v2.lines[0].dispenseToleranceValue).toBe(1);
      expect(
        svc.data.boms.find((b) => b.id === "bom-1")?.lines[0].dispenseToleranceType,
      ).toBeNull();
      expect(
        (
          await refusalOf(() =>
            svc.updateBom(v2.id, {
              validFrom: "2026-12-01",
              lines: [line({ dispenseToleranceType: "percent", dispenseToleranceValue: 100 })],
            }),
          )
        ).kind,
      ).toBe("tolerance_percent");
    });

    it("rejects a circular BOM (AC-3)", async () => {
      const body = await refusalOf(() =>
        svc.updateBom("bom-2", {
          validFrom: "2026-12-01",
          lines: [line({ componentProductId: "prod-3", uomId: "uom-5", qtyPerUnit: 1 })],
        }),
      );
      expect(body.kind).toBe("circular");
    });
  });
});
