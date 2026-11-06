import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { TWorkMasterService } from "./work-master-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().nullable();
/** Optional on the wire, null when left out — older clients keep working. */
const optNum = num.optional().transform((v) => v ?? null);
const optId = z
  .string()
  .min(1)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const bomLineSchema = z.object({
  componentProductId: z.string().min(1),
  qtyPerUnit: z.number(),
  uomId: z.string().min(1),
  scrapFactor: z.number(),
  // WMS-002 rule 8: entry step (null = the first step), consumed / produced.
  stepId: optId,
  lineUse: z.enum(["consumed", "produced"]).default("consumed"),
  isPrimaryOutput: z
    .boolean()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  // WMS-002 rule 10: dispensing tolerance.
  dispenseToleranceType: z
    .enum(["percent", "absolute"])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  dispenseToleranceValue: optNum,
});

const bomBody = {
  validFrom: date,
  baseQty: z.number().optional(),
  baseUomId: z.string().min(1).optional(),
  isPhantom: z.boolean().optional(),
  lines: z.array(bomLineSchema),
};

const bomSchema = z.object({
  productId: z.string().min(1),
  flowId: z.string().min(1).optional(),
  ...bomBody,
});

const stationSchema = z.object({ workUnitId: z.string().min(1), cycleTimeValue: num });

const stepFields = {
  stepNumber: z.number().int(),
  stepName: z.string().default(""),
  stepType: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  workUnitId: optId,
  requiredWorkUnitClassId: optId,
  cycleTimeValue: num,
  uomId: z.string().min(1),
  timeConversionId: z.string().min(1),
  batchSize: optNum,
  standardSpeedValue: optNum,
  speedUomId: optId,
  standardSetupTime: optNum,
  setupTimeConversionId: optId,
  crewSize: optNum,
  plannedShrinkage: optNum,
  yieldMinPct: optNum,
  yieldMaxPct: optNum,
  maxHoldTime: optNum,
  holdTimeConversionId: optId,
  stations: z.array(stationSchema).optional(),
  waitsFor: z.array(z.string().min(1)).optional(),
};

const operationSchema = z.object({
  routingId: z.string().min(1),
  validFrom: date,
  ...stepFields,
});

const stepSchema = z.object(stepFields);

const changeSchema = z.object({
  validFrom: date,
  uomId: z.string().min(1).optional(),
  timeConversionId: z.string().min(1).optional(),
  cycleTimeValue: num,
  standardSpeedValue: num,
  standardSetupTime: num,
  setupTimeConversionId: z.string().min(1).nullable().optional(),
  crewSize: num,
  batchSize: num,
  plannedShrinkage: num.optional(),
  yieldMinPct: num.optional(),
  yieldMaxPct: num.optional(),
  maxHoldTime: num.optional(),
  holdTimeConversionId: z.string().min(1).nullable().optional(),
  overrides: z.array(stationSchema).optional(),
});

const routingSchema = z.object({
  productId: z.string().min(1),
  workCenterId: z.string().min(1),
  validFrom: date,
  flowId: z.string().min(1).optional(),
  isPrimary: z.boolean().optional(),
  enforceSequence: z.boolean().optional(),
  // WMS-003 AC-19: one step per ticked work unit, in the work center's flow order.
  steps: z
    .array(
      z.object({
        workUnitId: z.string().min(1),
        stepName: z.string().optional(),
        timeConversionId: z.string().min(1),
      }),
    )
    .optional(),
});

const routingPatchSchema = z.object({
  isPrimary: z.boolean().optional(),
  enforceSequence: z.boolean().optional(),
  validFrom: date.optional(),
});

const detailSchema = z.object({
  validFrom: date,
  instructions: z.array(
    z.object({
      instructionId: z.string().min(1).nullable().optional(),
      instructionText: z.string(),
      requiresConfirmation: z.boolean().default(false),
    }),
  ),
  checks: z.array(
    z.object({
      checkId: z.string().min(1).nullable().optional(),
      checkName: z.string(),
      valueType: z.enum(["numeric", "pass_fail", "text"]),
      targetValue: num,
      minValue: num,
      maxValue: num,
      uomId: z.string().min(1).nullable(),
      sampleCount: z.number().int().min(1).default(1),
      frequencyType: z.enum(["once", "start_middle_end", "interval"]).default("once"),
      frequencyIntervalValue: num,
      frequencyIntervalConversionId: z.string().min(1).nullable(),
      isCritical: z.boolean().default(false),
    }),
  ),
});

type WorkMasterHandlerDeps = { workMasterService: TWorkMasterService };

/** `/work-master` — PRD-003 WMS-002 / WMS-003. */
function createWorkMasterHandler({ workMasterService: svc }: WorkMasterHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  // Planning reads these keys (PRD-004 PLN); keep them.
  app.get("/", async (c) => {
    return c.json(ok(await svc.data.snapshot()), 200);
  });

  // WMS-002 — BOM versions.
  app.post("/boms", jsonValidator(bomSchema), async (c) =>
    c.json(ok(await svc.createBom(c.req.valid("json"))), 201),
  );
  app.put("/boms/:id", jsonValidator(z.object(bomBody)), async (c) =>
    c.json(ok(await svc.updateBom(c.req.param("id"), c.req.valid("json"))), 200),
  );
  app.post("/boms/:id/release", async (c) =>
    c.json(ok(await svc.releaseBom(c.req.param("id"))), 200),
  );

  // WMS-003 — routing versions and steps.
  app.post("/routings", jsonValidator(routingSchema), async (c) =>
    c.json(ok(await svc.createRouting(c.req.valid("json"))), 201),
  );
  app.put("/routings/:id", jsonValidator(routingPatchSchema), async (c) =>
    c.json(ok(await svc.updateRouting(c.req.param("id"), c.req.valid("json"))), 200),
  );
  app.post("/routings/:id/new-draft", async (c) =>
    c.json(ok(await svc.newDraft(c.req.param("id"))), 201),
  );
  app.post("/routings/:id/release", async (c) =>
    c.json(ok(await svc.releaseRouting(c.req.param("id"))), 200),
  );
  app.put("/routings/:id/steps/:stepId", jsonValidator(stepSchema), async (c) =>
    c.json(
      ok(await svc.updateStep(c.req.param("id"), c.req.param("stepId"), c.req.valid("json"))),
      200,
    ),
  );
  app.delete("/routings/:id/steps/:stepId", async (c) =>
    c.json(ok(await svc.removeStep(c.req.param("id"), c.req.param("stepId"))), 200),
  );
  app.put("/routings/:id/steps/:stepId/detail", jsonValidator(detailSchema), async (c) =>
    c.json(
      ok(await svc.saveDetail(c.req.param("id"), c.req.param("stepId"), c.req.valid("json"))),
      200,
    ),
  );
  app.post("/operations", jsonValidator(operationSchema), async (c) =>
    c.json(ok(await svc.addOperation(c.req.valid("json"))), 201),
  );
  app.post("/operations/:id/change-standard", jsonValidator(changeSchema), async (c) =>
    c.json(ok(await svc.changeStandard(c.req.param("id"), c.req.valid("json"))), 200),
  );

  return app;
}

export { createWorkMasterHandler };
