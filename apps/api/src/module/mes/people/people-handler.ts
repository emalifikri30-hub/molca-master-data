import { Hono } from "hono";
import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { Person } from "./people.js";
import type { TPeopleService } from "./people-service.js";

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  username: z.string().trim().max(120).default(""),
  craft: z.string().trim().max(60).default(""),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  siteId: z.string().default(""),
  shift: z.string().max(20).default(""),
  hourlyRate: z.coerce
    .number()
    .min(0)
    .nullable()
    .default(null)
    .transform((v) => (v == null ? null : String(v))),
  phone: z.string().trim().max(40).default(""),
});
const updateSchema = createSchema.partial();

function createPeopleHandler({ peopleService }: { peopleService: TPeopleService }) {
  const app = new Hono();

  app.get("/", queryValidator(paginationSchema.extend({ q: z.string().optional() })), async (c) => {
    const { page, size, q } = c.req.valid("query");
    const { items, meta } = await peopleService.getPaged(page, size, q);
    return c.json(WebResponse.builder<Person[]>().data(items).meta(meta).build(), 200);
  });
  app.post("/", jsonValidator(createSchema), async (c) =>
    c.json(
      WebResponse.builder<Person>()
        .data(await peopleService.create(c.req.valid("json")))
        .build(),
      201,
    ),
  );
  app.get("/:id", async (c) =>
    c.json(
      WebResponse.builder<Person>()
        .data(await peopleService.get(c.req.param("id")))
        .build(),
      200,
    ),
  );
  app.put("/:id", jsonValidator(updateSchema), async (c) => {
    // only what was sent changes: the create schema's defaults must not reset the other fields
    const sent = (await c.req.json()) as Record<string, unknown>;
    const patch = Object.fromEntries(
      Object.entries(c.req.valid("json")).filter(([k]) => k in sent),
    );
    return c.json(
      WebResponse.builder<Person>()
        .data(await peopleService.update(c.req.param("id"), patch))
        .build(),
      200,
    );
  });
  app.post(
    "/:id/deactivate",
    jsonValidator(z.object({ validTo: z.string().min(1).optional() })),
    async (c) =>
      c.json(
        WebResponse.builder<Person>()
          .data(await peopleService.deactivate(c.req.param("id"), c.req.valid("json").validTo))
          .build(),
        200,
      ),
  );
  return app;
}

export { createPeopleHandler };
