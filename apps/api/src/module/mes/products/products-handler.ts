import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { TProductsService } from "./products-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productType = z.enum([
  "raw_material",
  "packaging",
  "consumable",
  "semi_finished",
  "finished_good",
]);
const packagingLevel = z.enum(["primary", "secondary"]).nullable().optional();

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  productType,
  packagingLevel,
  baseUomId: z.string().min(1),
});
// PRO-002 limits: weights and dimensions not negative, barcode ≤ 30
// characters, shelf life a whole number of days from 0 to 3,650.
const nonNegative = z.number().nonnegative();
const barcode = z.string().max(30).optional();
const shelfLifeDays = z.number().int().min(0).max(3650).optional();
// PRO-002 (PO 2026-10-10, docs-molcadx#125): the product Edit modal also saves
// batch tracked, barcode and shelf life — one request, one reason.
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  productType: productType.optional(),
  packagingLevel,
  baseUomId: z.string().min(1).optional(),
  // PO 2026-10-10: units in the Edit modal — the weight and dimension units are
  // saved here too, and checked like the per-unit drawer checks them.
  details: z
    .object({
      isBatchTracked: z.boolean(),
      barcode,
      shelfLifeDays,
      weightUomId: z.string().nullable().optional(),
      dimensionUomId: z.string().nullable().optional(),
    })
    .optional(),
});
// PRO-002 (per-unit measurement, PO 2026-10-05): the envelope and dimensions
// live on PRODUCT_UOM_MEASUREMENT rows; PRODUCT_DETAIL keeps the two unit
// pickers and the tracking fields.
const detailSchema = z.object({
  weightUomId: z.string().nullable(),
  dimensionUomId: z.string().nullable().optional(),
  barcode,
  isBatchTracked: z.boolean(),
  shelfLifeDays,
});
const measurementRowSchema = z.object({
  uomId: z.string().min(1),
  minWeight: nonNegative,
  standardWeight: nonNegative,
  maxWeight: nonNegative,
  length: nonNegative.optional(),
  width: nonNegative.optional(),
  height: nonNegative.optional(),
});
const measurementsSchema = z.object({ rows: z.array(measurementRowSchema) });
const conversionSchema = z.object({
  fromUomId: z.string().min(1),
  toUomId: z.string().min(1),
  conversionValue: z.number(),
});

type ProductsHandlerDeps = { productsService: TProductsService };

/** `/products` — PRD-003 PRO-001…003 (PRO-004 cycle times retired 2026-09-28). Static paths are declared before `/:id`. */
function createProductsHandler({ productsService: svc }: ProductsHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  app.get("/", async (c) => c.json(ok(await svc.list()), 200));
  app.post("/", jsonValidator(createSchema), async (c) =>
    c.json(ok(await svc.create(c.req.valid("json"))), 201),
  );
  app.get("/details", async (c) => c.json(ok(await svc.allDetails()), 200));
  app.get("/measurements", async (c) => c.json(ok(await svc.allMeasurements()), 200));
  app.get("/conversions", async (c) => c.json(ok(await svc.allConversions()), 200));
  app.put(
    "/conversions/:conversionId",
    jsonValidator(z.object({ conversionValue: z.number() })),
    async (c) =>
      c.json(
        ok(
          await svc.updateConversion(
            c.req.param("conversionId"),
            c.req.valid("json").conversionValue,
          ),
        ),
        200,
      ),
  );

  app.get("/:id", async (c) => c.json(ok(await svc.get(c.req.param("id"))), 200));
  app.put("/:id", jsonValidator(updateSchema), async (c) => {
    const { details, ...patch } = c.req.valid("json");
    return c.json(ok(await svc.update(c.req.param("id"), patch, details)), 200);
  });
  app.post("/:id/close", jsonValidator(z.object({ validTo: date })), async (c) =>
    c.json(ok(await svc.close(c.req.param("id"), c.req.valid("json").validTo)), 200),
  );
  app.get("/:id/detail", async (c) => c.json(ok(await svc.detail(c.req.param("id"))), 200));
  app.get("/:id/detail-versions", async (c) =>
    c.json(ok(await svc.detailVersions(c.req.param("id"))), 200),
  );
  app.put("/:id/detail", jsonValidator(detailSchema), async (c) =>
    c.json(
      ok(await svc.upsertDetail({ ...c.req.valid("json"), productId: c.req.param("id") })),
      200,
    ),
  );
  app.get("/:id/measurements", async (c) =>
    c.json(ok(await svc.measurements(c.req.param("id"))), 200),
  );
  app.get("/:id/measurements/versions", async (c) =>
    c.json(ok(await svc.measurementVersions(c.req.param("id"))), 200),
  );
  app.put("/:id/measurements", jsonValidator(measurementsSchema), async (c) =>
    c.json(
      ok(
        await svc.upsertMeasurements(
          c.req.param("id"),
          c.req.valid("json").rows.map((r) => ({
            ...r,
            length: r.length ?? undefined,
            width: r.width ?? undefined,
            height: r.height ?? undefined,
          })),
        ),
      ),
      200,
    ),
  );
  app.get("/:id/conversions", async (c) =>
    c.json(ok(await svc.conversions(c.req.param("id"))), 200),
  );
  app.post("/:id/conversions", jsonValidator(conversionSchema), async (c) =>
    c.json(
      ok(await svc.createConversion({ ...c.req.valid("json"), productId: c.req.param("id") })),
      201,
    ),
  );

  return app;
}

export { createProductsHandler };
