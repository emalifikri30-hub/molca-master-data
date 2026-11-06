import * as z from "zod";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { namespaceForm } from "../asset-tags/generated-address.js";

import type { TDataSourcesService } from "./data-sources-service.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * DSR-001 rule 7: a generated OPC UA source needs a namespace — a URI or a
 * numeric index, typed as the gateway shows it (PO 2026-10-06); a namespace
 * is OPC UA only; `topic_root` is MQTT-only, optional, generated only (H-DS-7:
 * value scope TBD, free text). Checked on create and on the row an edit would
 * produce (rule 16).
 */
function namingIssues(
  v: {
    protocol: "mqtt" | "opcua" | "other";
    nodeNaming: "generated" | "manual";
    namespaceUri: string;
    topicRoot: string;
  },
  { namespaceDefaulted = false }: { namespaceDefaulted?: boolean } = {},
): Array<{ message: string; path: string }> {
  const issues: Array<{ message: string; path: string }> = [];
  if (
    !namespaceDefaulted &&
    v.protocol === "opcua" &&
    v.nodeNaming === "generated" &&
    v.namespaceUri === ""
  ) {
    issues.push({
      message: "a generated OPC UA source needs a namespace",
      path: "namespaceUri",
    });
  }
  if (v.namespaceUri !== "" && v.protocol !== "opcua") {
    issues.push({
      message: "a namespace belongs to an OPC UA source only",
      path: "namespaceUri",
    });
  }
  // AC-8b (PO 2026-10-06): a URI or a whole number ≥ 0 — anything else is
  // refused with dsr-001.error.namespace-format on screen.
  if (v.namespaceUri !== "" && namespaceForm(v.namespaceUri) === "invalid") {
    issues.push({
      message: "a namespace must be a URI or a whole number",
      path: "namespaceUri",
    });
  }
  if (v.topicRoot !== "" && !(v.protocol === "mqtt" && v.nodeNaming === "generated")) {
    issues.push({ message: "a topic root is only for a generated MQTT source", path: "topicRoot" });
  }
  return issues;
}

type DataSourcesHandlerDeps = { dataSourcesService: TDataSourcesService };

function createDataSourcesHandler({ dataSourcesService: svc }: DataSourcesHandlerDeps) {
  const app = new Hono();
  const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();

  app.get("/", async (c) => c.json(ok(await svc.list()), 200));
  app.post(
    "/",
    jsonValidator(
      z
        .object({
          siteId: z.string().min(1),
          name: z.string().min(1),
          protocol: z.enum(["mqtt", "opcua", "other"]),
          // DSR-001 rule 7 (PO 2026-09-28): address naming is per connection,
          // `generated` the default for a new source. A generated OPC UA
          // source needs a namespace (URI or index, PO 2026-10-06);
          // `topic_root` is MQTT-only, optional, generated only (H-DS-7: value
          // scope TBD, free text).
          nodeNaming: z.enum(["generated", "manual"]).default("generated"),
          namespaceUri: z.string().default(""),
          topicRoot: z.string().default(""),
          connectionConfig: z.record(z.string(), z.string()),
          validFrom: date,
        })
        .superRefine((v, ctx) => {
          // An empty namespace on a new generated OPC UA source gets the site default.
          for (const issue of namingIssues(v, { namespaceDefaulted: true })) {
            ctx.addIssue({ code: "custom", message: issue.message, path: [issue.path] });
          }
        }),
    ),
    async (c) => c.json(ok(await svc.create(c.req.valid("json"))), 201),
  );
  // DSR-001 rule 16 (PO 2026-10-02): edit in place. `protocol` is accepted
  // only so the service can refuse a change of it (`protocol_locked`).
  app.patch(
    "/:id",
    jsonValidator(
      z.object({
        name: z.string().min(1).optional(),
        protocol: z.enum(["mqtt", "opcua", "other"]).optional(),
        nodeNaming: z.enum(["generated", "manual"]).optional(),
        namespaceUri: z.string().optional(),
        topicRoot: z.string().optional(),
        connectionConfig: z.record(z.string(), z.string()).optional(),
        confirmAddressChange: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const patch = c.req.valid("json");
      const current = (await svc.list()).find((r) => r.id === id);
      if (current) {
        const issue = namingIssues({
          protocol: current.protocol,
          nodeNaming: patch.nodeNaming ?? current.nodeNaming,
          namespaceUri: patch.namespaceUri ?? current.namespaceUri,
          topicRoot: patch.topicRoot ?? current.topicRoot,
        })[0];
        if (issue) throw new HTTPException(400, { message: issue.message });
      }
      return c.json(ok(await svc.update(id, patch)), 200);
    },
  );
  app.post("/:id/deactivate", jsonValidator(z.object({ validTo: date })), async (c) =>
    c.json(ok(await svc.deactivate(c.req.param("id"), c.req.valid("json").validTo)), 200),
  );

  return app;
}

export { createDataSourcesHandler };
