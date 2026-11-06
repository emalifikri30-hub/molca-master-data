import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { TReferenceDataService } from "./reference-data-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().optional();

const unitSchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1).max(10),
  measurementGroupId: z.string().min(1),
});
const groupSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1) });
const timeSchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  // REF-005: a positive whole number of seconds, refused rather than rounded.
  secondsPerUnit: z.number().int().positive(),
});
const downtimeSchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  downtimeCategory: z.enum(["unplanned", "planned", "small_stop"]),
});
const rejectSchema = z.object({ id, code: z.string().min(1), name: z.string().min(1) });
const tickSchema = z.object({
  kind: z.enum(["downtime", "reject"]),
  reasonId: z.string().min(1),
  assetId: z.string().min(1),
  on: z.boolean(),
});

type ReferenceDataHandlerDeps = { referenceDataService: TReferenceDataService };

/** `/reference-data/*` — PRD-003 REF-001…006. */
function createReferenceDataHandler({ referenceDataService: svc }: ReferenceDataHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();
  app.get("/measurement-groups", async (c) => c.json(ok(await svc.data.listGroups()), 200));
  // REF-004 (PO, 2026-10-26): groups can be added and ended ("deleted").
  app.post("/measurement-groups", jsonValidator(groupSchema), async (c) =>
    c.json(ok(await svc.saveGroup(c.req.valid("json"))), 200),
  );
  app.post("/measurement-groups/:id/deactivate", async (c) =>
    c.json(ok(await svc.endGroup(c.req.param("id"))), 200),
  );
  app.get("/units", async (c) => c.json(ok(await svc.data.listUnits()), 200));
  app.post("/units", jsonValidator(unitSchema), async (c) =>
    c.json(ok(await svc.saveUnit(c.req.valid("json"))), 200),
  );
  // PRD-003 REF-006 (PO, 2026-10-21, F-05 T-9): units and time conversions deactivate like reasons.
  app.get("/units/:id/impact", async (c) =>
    c.json(ok(await svc.unitImpact(c.req.param("id"))), 200),
  );
  app.post("/units/:id/deactivate", jsonValidator(z.object({ effectiveDate: date })), async (c) =>
    c.json(ok(await svc.deactivateUnit(c.req.param("id"), c.req.valid("json").effectiveDate)), 200),
  );
  app.post("/units/:id/reactivate", async (c) =>
    c.json(ok(await svc.reactivateUnit(c.req.param("id"))), 200),
  );
  app.get("/time-conversions", async (c) => c.json(ok(await svc.data.listTimeConversions()), 200));
  app.get("/time-conversions/:id/impact", async (c) =>
    c.json(ok(await svc.timeImpact(c.req.param("id"))), 200),
  );
  app.post(
    "/time-conversions/:id/deactivate",
    jsonValidator(z.object({ effectiveDate: date })),
    async (c) =>
      c.json(
        ok(await svc.deactivateTime(c.req.param("id"), c.req.valid("json").effectiveDate)),
        200,
      ),
  );
  app.post("/time-conversions/:id/reactivate", async (c) =>
    c.json(ok(await svc.reactivateTime(c.req.param("id"))), 200),
  );
  app.post("/time-conversions", jsonValidator(timeSchema), async (c) =>
    c.json(ok(await svc.saveTime(c.req.valid("json"))), 200),
  );
  app.get("/downtime-reasons", async (c) => c.json(ok(await svc.data.listDowntimeReasons()), 200));
  app.post("/downtime-reasons", jsonValidator(downtimeSchema), async (c) =>
    c.json(ok(await svc.saveDowntime({ ...c.req.valid("json"), deletedAt: null })), 200),
  );
  app.get("/reject-reasons", async (c) => c.json(ok(await svc.data.listRejectReasons()), 200));
  app.post("/reject-reasons", jsonValidator(rejectSchema), async (c) =>
    c.json(ok(await svc.saveReject({ ...c.req.valid("json"), deletedAt: null })), 200),
  );

  for (const kind of ["downtime", "reject"] as const) {
    app.get(`/${kind}-reasons/:id/impact`, async (c) =>
      c.json(ok(await svc.impact(kind, c.req.param("id"))), 200),
    );
    app.post(
      `/${kind}-reasons/:id/deactivate`,
      jsonValidator(z.object({ effectiveDate: date })),
      async (c) =>
        c.json(
          ok(await svc.deactivate(kind, c.req.param("id"), c.req.valid("json").effectiveDate)),
          200,
        ),
    );
    app.post(`/${kind}-reasons/:id/reactivate`, async (c) =>
      c.json(ok(await svc.reactivate(kind, c.req.param("id"))), 200),
    );
  }

  app.get("/ticks", async (c) => c.json(ok(await svc.data.listTicks()), 200));
  app.post("/ticks", jsonValidator(tickSchema), async (c) => {
    const { kind, reasonId, assetId, on } = c.req.valid("json");
    return c.json(ok(await svc.setTick(kind, reasonId, assetId, on)), 200);
  });

  return app;
}

export { createReferenceDataHandler };
