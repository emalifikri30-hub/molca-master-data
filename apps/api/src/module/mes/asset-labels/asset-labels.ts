import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { inArray } from "drizzle-orm";
import { ulid } from "ulidx";
import * as z from "zod";

import { jsonValidator } from "@molca/helper";
import { WebResponse } from "@molca/network";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { assetLabelTable } from "../../../shared/database/schema/schema.js";

import type { AwilixContainer } from "awilix";
import type { EntityRepository } from "../../../shared/database/entity-repository.js";

// QR labels, a sub-feature of the asset register: one label per asset, printed (again) from here, then marked as
// installed on the machine, damaged (to reprint) or retired with the asset. The label text and its QR link are
// built by the web from the asset; this keeps who printed and installed what, and when.

type Label = {
  id: string;
  assetId: string;
  status: "printed" | "installed" | "damaged" | "retired";
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string;
  installedAt: string | null;
  installedBy: string;
  note: string;
  validFrom: string | null;
  validTo: string | null;
};

const KEYS = [
  "id",
  "assetId",
  "status",
  "printCount",
  "lastPrintedAt",
  "lastPrintedBy",
  "installedAt",
  "installedBy",
  "note",
  "validFrom",
  "validTo",
];

const ok = <T>(data: T) => WebResponse.builder<T>().data(data).build();
const now = () => new Date().toISOString();

class AssetLabels {
  constructor(private readonly repo?: EntityRepository<Label>) {}

  private need() {
    if (!this.repo) throw new HTTPException(503, { message: "database unavailable" });
    return this.repo;
  }

  async list(assetIds?: string[]) {
    return this.need().list(
      assetIds?.length ? inArray(assetLabelTable.assetId, assetIds) : undefined,
    );
  }

  private async of(assetId: string) {
    return (await this.list([assetId]))[0];
  }

  /** A print run: each asset's label counts one more print; a damaged or retired label is printed anew. */
  async print(assetIds: string[], by: string) {
    const out: Label[] = [];
    for (const assetId of [...new Set(assetIds)]) {
      const cur = await this.of(assetId);
      const set = { lastPrintedAt: now(), lastPrintedBy: by };
      if (!cur) {
        out.push(
          await this.need().insert({
            id: ulid(),
            assetId,
            status: "printed",
            printCount: 1,
            installedAt: null,
            installedBy: "",
            note: "",
            validFrom: now().slice(0, 10),
            validTo: null,
            ...set,
          }),
        );
        continue;
      }
      // a reprint of a label that hangs on the machine keeps it installed (a spare); otherwise it waits to go up
      const status = cur.status === "installed" ? "installed" : "printed";
      out.push(
        (await this.need().update(cur.id, { ...set, status, printCount: cur.printCount + 1 }))!,
      );
    }
    return out;
  }

  async mark(assetId: string, status: "installed" | "damaged" | "retired", by: string, note = "") {
    const cur = await this.of(assetId);
    if (!cur) throw new HTTPException(409, { message: "print the label first" });
    if (status === "installed" && cur.status === "retired")
      throw new HTTPException(409, {
        message: "a retired label cannot be installed: print a new one",
      });
    const set: Partial<Label> = { status, note };
    if (status === "installed") Object.assign(set, { installedAt: now(), installedBy: by });
    if (status === "retired") set.validTo = now().slice(0, 10);
    return (await this.need().update(cur.id, set))!;
  }
}

function mountAssetLabels(api: Hono, container: AwilixContainer) {
  const deps: DbDeps = { db: container.resolve("db"), region: container.resolve("region") };
  const labels = new AssetLabels(openRepo<Label>(deps, assetLabelTable, KEYS));
  const app = new Hono();
  const who = (c: { get: (k: "jwtPayload") => unknown }) => {
    const jwt = (c.get("jwtPayload") ?? {}) as { name?: string; preferred_username?: string };
    return jwt.name ?? jwt.preferred_username ?? "";
  };
  app.get("/", async (c) =>
    c.json(ok(await labels.list(c.req.query("assetIds")?.split(",").filter(Boolean))), 200),
  );
  app.post(
    "/print",
    jsonValidator(z.object({ assetIds: z.array(z.string().min(1)).min(1).max(500) })),
    async (c) => c.json(ok(await labels.print(c.req.valid("json").assetIds, who(c as never))), 200),
  );
  app.post(
    "/:assetId/status",
    jsonValidator(
      z.object({
        status: z.enum(["installed", "damaged", "retired"]),
        note: z.string().max(300).optional(),
      }),
    ),
    async (c) => {
      const b = c.req.valid("json");
      return c.json(
        ok(await labels.mark(c.req.param("assetId"), b.status, who(c as never), b.note)),
        200,
      );
    },
  );
  api.route("/asset-labels", app);
}

export { AssetLabels, mountAssetLabels };
export type { Label };
