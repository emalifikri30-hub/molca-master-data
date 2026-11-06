import * as z from "zod";
import { Hono } from "hono";

import { jsonValidator, queryValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { CLASS_LEVELS } from "./location-classes.js";

import type { ClassLevel } from "./location-classes.js";
import type { TLocationClassesService } from "./location-classes-service.js";

const level = z.enum(CLASS_LEVELS as [ClassLevel, ...ClassLevel[]]);

type LocationClassesHandlerDeps = { locationClassesService: TLocationClassesService };

function createLocationClassesHandler({ locationClassesService: svc }: LocationClassesHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  app.get("/", queryValidator(z.object({ level })), async (c) =>
    c.json(ok(await svc.list(c.req.valid("query").level)), 200),
  );
  app.post(
    "/",
    jsonValidator(
      z.object({
        id: z.string().optional(),
        level,
        code: z.string().min(1),
        name: z.string().min(1),
      }),
    ),
    async (c) => c.json(ok(await svc.save(c.req.valid("json"))), 200),
  );
  app.post("/:id/deactivate", async (c) =>
    c.json(ok(await svc.deactivate(c.req.param("id"))), 200),
  );
  app.post("/:id/reactivate", async (c) =>
    c.json(ok(await svc.reactivate(c.req.param("id"))), 200),
  );

  return app;
}

export { createLocationClassesHandler };
