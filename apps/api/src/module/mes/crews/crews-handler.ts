import { Hono } from "hono";
import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import type { Crew } from "./crews.js";
import type { TCrewsService } from "./crews-service.js";

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  siteId: z.string().default(""),
  shift: z.string().max(20).default(""),
  leaderId: z.string().default(""),
  memberIds: z.array(z.string().min(1)).max(200).default([]),
});
const updateSchema = createSchema.partial();

function createCrewsHandler({ crewsService }: { crewsService: TCrewsService }) {
  const app = new Hono();

  app.get("/", queryValidator(paginationSchema.extend({ q: z.string().optional() })), async (c) => {
    const { page, size, q } = c.req.valid("query");
    const { items, meta } = await crewsService.getPaged(page, size, q);
    return c.json(WebResponse.builder<Crew[]>().data(items).meta(meta).build(), 200);
  });
  app.post("/", jsonValidator(createSchema), async (c) =>
    c.json(
      WebResponse.builder<Crew>()
        .data(await crewsService.create(c.req.valid("json")))
        .build(),
      201,
    ),
  );
  app.get("/:id", async (c) =>
    c.json(
      WebResponse.builder<Crew>()
        .data(await crewsService.get(c.req.param("id")))
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
      WebResponse.builder<Crew>()
        .data(await crewsService.update(c.req.param("id"), patch))
        .build(),
      200,
    );
  });
  app.post(
    "/:id/deactivate",
    jsonValidator(z.object({ validTo: z.string().min(1).optional() })),
    async (c) =>
      c.json(
        WebResponse.builder<Crew>()
          .data(await crewsService.deactivate(c.req.param("id"), c.req.valid("json").validTo))
          .build(),
        200,
      ),
  );
  return app;
}

export { createCrewsHandler };
