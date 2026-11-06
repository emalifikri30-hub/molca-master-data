// The PLATFORM tenant endpoints (dx-platform cross-repo contract §1, M-1…M-6) over HTTP,
// on real SQL (PGlite, every migration applied), with the same chain the app mounts:
// auth → platform gate → transaction → handler, and the tenant API beside it.
// Each test names the rule it checks.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createOrganizationMiddleware } from "@molca/security";

import { AuditLogService } from "../mes/audit-log/audit-log-service.js";
import { AuditLogStore } from "../mes/audit-log/audit-log-store.js";
import { createPgliteDb } from "../../shared/database/testing/pglite-db.js";
import {
  auditLogTable,
  measurementGroupTable,
  tenantTable,
  unitOfMeasurementTable,
} from "../../shared/database/schema/schema.js";
import { createTransact } from "../../shared/database/transaction.js";
import { appErrorHandler } from "../../shared/errors/app-error-handler.js";
import { mapPgError } from "../../shared/errors/pg-error.js";
import { createTenantMiddleware } from "../../shared/tenant/tenant-middleware.js";
import { createFindTenant } from "../../shared/tenant/tenant-store.js";
import { createPlatformApi } from "./platform-api.js";
import { PlatformTenantsService } from "./platform-tenants-service.js";
import { PlatformTenantsStore } from "./platform-tenants-store.js";
import { MEASUREMENT_GROUPS } from "../mes/reference-data/measurement-groups.js";
import { SEED_UNITS } from "../mes/reference-data/seed-units.js";

import type { PGlite } from "@electric-sql/pglite";
import type { MiddlewareHandler } from "hono";
import type { AppJwtPayload } from "@molca/mes";
import type { PostgresDB } from "../../shared/database/postgres.js";

const REGION = "ap3";
const ZONE = "Asia/Jakarta";
/** 2026-10-12 10:00 in Jakarta. */
const NOW = new Date("2026-10-12T03:00:00Z");

/** dx-platform's service-account token: azp dx-platform-svc, no organization (contract §0). */
const SVC: AppJwtPayload = {
  sub: "svc-sub-1",
  azp: "dx-platform-svc",
  preferred_username: "service-account-dx-platform-svc",
};
const ON_BEHALF = {
  "X-On-Behalf-Of": "superadmin-sub",
  "X-On-Behalf-Of-Name": encodeURIComponent("Ayu Superadmin"),
};

let db: PostgresDB;
let client: PGlite;
let app: Hono;

/** Stands in for the JWT check: the bearer is the payload as JSON. No bearer → 401. */
const fakeAuth: MiddlewareHandler = async (c, next) => {
  const raw = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!raw) return c.json({ error: "token not found" }, 401);
  c.set("jwtPayload" as never, JSON.parse(raw) as never);
  await next();
};

function buildApp(): Hono {
  const auditLogService = new AuditLogService({
    auditLogStore: new AuditLogStore({ db, region: REGION }),
  });
  const root = new Hono();
  root.route(
    "/",
    createPlatformApi({
      authMw: fakeAuth,
      transact: createTransact(db),
      platformTenantsService: new PlatformTenantsService({
        platformTenantsStore: new PlatformTenantsStore({ db, region: REGION }),
        auditLogService,
      }),
    }),
  );
  // The tenant API as app.ts mounts it, with one probe route.
  const api = new Hono().basePath("/api/v1");
  api.use("*", fakeAuth);
  api.use("*", createOrganizationMiddleware());
  api.use(
    "*",
    createTenantMiddleware({ findTenant: createFindTenant(db), timeZone: ZONE, now: () => NOW }),
  );
  api.get("/sites", (c) => c.json({ data: [], error: null }, 200));
  root.route("/", api);
  root.onError(appErrorHandler);
  return root;
}

type Call = { token?: AppJwtPayload | null; body?: unknown; headers?: Record<string, string> };

async function call(method: string, path: string, { token = SVC, body, headers = {} }: Call = {}) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${JSON.stringify(token)}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as { data: any; error: any } };
}

const create = (body: unknown, headers: Record<string, string> = ON_BEHALF) =>
  call("POST", "/api/v1/platform/tenants", { body, headers });

const refusalCode = (json: { error: string }) =>
  (JSON.parse(json.error.replace(/^REFUSAL:/, "")) as { code: string }).code;

const groupsOf = (tenantId: string) =>
  db.select().from(measurementGroupTable).where(eq(measurementGroupTable.tenantId, tenantId));

const unitsOf = (tenantId: string) =>
  db.select().from(unitOfMeasurementTable).where(eq(unitOfMeasurementTable.tenantId, tenantId));

const auditOf = (tenantId: string) =>
  db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.tenantId, tenantId))
    .orderBy(auditLogTable.id);

beforeAll(async () => {
  ({ db, client } = await createPgliteDb());
  app = buildApp();
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await db.delete(auditLogTable);
  await db.delete(unitOfMeasurementTable);
  await db.delete(measurementGroupTable);
  await db.delete(tenantTable);
});

describe("E-2 exception: /platform/* takes only the dx-platform-svc token", () => {
  it("accepts dx-platform-svc without an organization", async () => {
    expect((await call("GET", "/api/v1/platform/tenants")).status).toBe(200);
  });

  it("refuses a request without a token", async () => {
    expect((await call("GET", "/api/v1/platform/tenants", { token: null })).status).toBe(401);
  });

  it("never accepts a person's token, even with the realm role dx-superadmin (TNT-G1)", async () => {
    const superadmin: AppJwtPayload = {
      sub: "superadmin-sub",
      azp: "dx-platform-web",
      realm_access: { roles: ["dx-superadmin"] },
    };
    const res = await call("GET", "/api/v1/platform/tenants", { token: superadmin });
    expect(res.status).toBe(403);
    expect(res.json).toEqual({ error: "platform service only" });
  });

  it("refuses a dx-platform-svc token that names an organization: the tenant comes from the path", async () => {
    const withOrg: AppJwtPayload = {
      ...SVC,
      organization: { acme: { id: "org-acme", name: "Acme" } },
    };
    const res = await call("GET", "/api/v1/platform/tenants", { token: withOrg });
    expect(res.status).toBe(403);
  });

  it("keeps refusing the organization-less service token on every tenant route (E-2)", async () => {
    const res = await call("GET", "/api/v1/sites");
    expect(res.status).toBe(403);
    expect(res.json).toEqual({ error: "no organization" });
  });
});

describe("M-4 POST /platform/tenants", () => {
  it("creates the tenant with the code upper-case and the name trimmed (TNT-G15)", async () => {
    const res = await create({
      tenantId: "org-acme",
      tenantCode: " acme ",
      tenantName: "  Acme Corp ",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(201);
    expect(res.json.data).toEqual({
      tenantId: "org-acme",
      tenantCode: "ACME",
      tenantName: "Acme Corp",
      validFrom: "2026-10-12",
      validTo: null,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
  });

  it("gives the new tenant the F-05 §9.4 seed measurement groups, valid from its first day", async () => {
    await create({
      tenantId: "org-acme",
      tenantCode: "ACME",
      tenantName: "Acme Corp",
      validFrom: "2026-10-12",
    });
    const rows = await groupsOf("org-acme");
    expect(rows.map((r) => r.code).sort()).toEqual(MEASUREMENT_GROUPS.map((g) => g.code).sort());
    expect(rows.every((r) => r.validFrom === "2026-10-12" && r.region === REGION)).toBe(true);
  });

  it("gives the new tenant the 47 F-05 §9.4 seed units, each under its seed group", async () => {
    await create({
      tenantId: "org-acme",
      tenantCode: "ACME",
      tenantName: "Acme Corp",
      validFrom: "2026-10-12",
    });
    const groups = new Map((await groupsOf("org-acme")).map((g) => [g.id, g.code]));
    const units = await unitsOf("org-acme");
    expect(SEED_UNITS).toHaveLength(47);
    expect(units).toHaveLength(47);
    const kg = units.find((u) => u.code === "KG");
    expect(kg).toMatchObject({ name: "Kilogram", unit: "kg", region: REGION });
    expect(groups.get(kg!.measurementGroupId)).toBe("mass");
    // "other" gets none.
    expect(units.some((u) => groups.get(u.measurementGroupId) === "other")).toBe(false);
  });

  it("seeds each tenant its own groups, so a second tenant does not clash with the first", async () => {
    await create({ tenantId: "org-a", tenantCode: "A", tenantName: "A", validFrom: "2026-10-12" });
    const res = await create({
      tenantId: "org-b",
      tenantCode: "B",
      tenantName: "B",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(201);
    const a = await groupsOf("org-a");
    const b = await groupsOf("org-b");
    expect(b).toHaveLength(MEASUREMENT_GROUPS.length);
    expect(b.some((r) => a.some((x) => x.id === r.id))).toBe(false);
  });

  it("seeds no groups when the create is refused", async () => {
    await create({ tenantId: "org-a", tenantCode: "A", tenantName: "A", validFrom: "2026-10-12" });
    const res = await create({
      tenantId: "org-b",
      tenantCode: "a",
      tenantName: "B",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(409);
    expect(await groupsOf("org-b")).toHaveLength(0);
  });

  it("writes tenant.create as the service account, on behalf of the superadmin, in that tenant (TNT-G3, TNT-G7)", async () => {
    await create({
      tenantId: "org-acme",
      tenantCode: "ACME",
      tenantName: "Acme Corp",
      validFrom: "2026-10-12",
    });
    const [row] = await auditOf("org-acme");
    expect(row).toMatchObject({
      action: "tenant.create",
      entityType: "TENANT",
      entityId: "org-acme",
      entityCode: "ACME",
      effectiveFrom: "2026-10-12",
      actorType: "service",
      actorSubjectId: "svc-sub-1",
      actorDisplayName: "service-account-dx-platform-svc",
      onBehalfOfSubjectId: "superadmin-sub",
      onBehalfOfDisplayName: "Ayu Superadmin",
      domainCode: "FND",
      moduleCode: "SIT",
      source: "api",
      region: REGION,
    });
    expect(row.changes).toEqual([
      { field: "tenantCode", before: null, after: "ACME" },
      { field: "tenantName", before: null, after: "Acme Corp" },
    ]);
  });

  it("refuses a code already taken in any case with 409 code_taken", async () => {
    await create({
      tenantId: "org-1",
      tenantCode: "ACME",
      tenantName: "One",
      validFrom: "2026-10-12",
    });
    const res = await create({
      tenantId: "org-2",
      tenantCode: "acme",
      tenantName: "Two",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(409);
    expect(res.json).toEqual({ data: null, error: 'REFUSAL:{"code":"code_taken"}' });
  });

  it("refuses a name taken ignoring case and spaces with 409 name_taken", async () => {
    await create({
      tenantId: "org-1",
      tenantCode: "ONE",
      tenantName: "Acme Corp",
      validFrom: "2026-10-12",
    });
    const res = await create({
      tenantId: "org-2",
      tenantCode: "TWO",
      tenantName: " ACME corp ",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(409);
    expect(refusalCode(res.json)).toBe("name_taken");
  });

  it("refuses a tenant id that already exists with 409 tenant_exists", async () => {
    await create({
      tenantId: "org-1",
      tenantCode: "ONE",
      tenantName: "One",
      validFrom: "2026-10-12",
    });
    const res = await create({
      tenantId: "org-1",
      tenantCode: "TWO",
      tenantName: "Two",
      validFrom: "2026-10-12",
    });
    expect(res.status).toBe(409);
    expect(refusalCode(res.json)).toBe("tenant_exists");
  });

  it("refuses a write without X-On-Behalf-Of and writes nothing (TNT-G7)", async () => {
    const res = await create(
      { tenantId: "org-1", tenantCode: "ONE", tenantName: "One", validFrom: "2026-10-12" },
      {},
    );
    expect(res.status).toBe(422);
    expect(refusalCode(res.json)).toBe("on_behalf_of_required");
    expect(await db.select().from(tenantTable)).toEqual([]);
  });

  it("refuses a body without the required fields with 400", async () => {
    const res = await create({ tenantId: "org-1", tenantCode: "ONE", validFrom: "12/10/2026" });
    expect(res.status).toBe(400);
  });
});

describe("M-1 / M-2 / M-3 reads", () => {
  beforeEach(async () => {
    await create({
      tenantId: "org-a",
      tenantCode: "A",
      tenantName: "Alpha",
      validFrom: "2026-01-01",
    });
    await create({
      tenantId: "org-b",
      tenantCode: "B",
      tenantName: "Beta Works",
      validFrom: "2026-01-01",
    });
    await call("PUT", "/api/v1/platform/tenants/org-b/valid-to", {
      body: { validTo: "2026-06-01", reason: "contract ended" },
      headers: ON_BEHALF,
    });
  });

  it("M-1 lists every tenant, inactive ones included", async () => {
    const res = await call("GET", "/api/v1/platform/tenants");
    expect(res.json.data.map((t: { tenantId: string }) => t.tenantId)).toEqual(["org-a", "org-b"]);
    expect(res.json.data[1].validTo).toBe("2026-06-01");
  });

  it("M-2 returns one tenant, and 404 not_found for an unknown id", async () => {
    const found = await call("GET", "/api/v1/platform/tenants/org-a");
    expect(found.status).toBe(200);
    expect(found.json.data.tenantCode).toBe("A");
    const missing = await call("GET", "/api/v1/platform/tenants/org-zzz");
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ data: null, error: 'REFUSAL:{"code":"not_found"}' });
  });

  it("M-3 ?code= matches the stored upper-case code, as a list of zero or one", async () => {
    const hit = await call("GET", "/api/v1/platform/tenants?code=b");
    expect(hit.json.data.map((t: { tenantId: string }) => t.tenantId)).toEqual(["org-b"]);
    expect((await call("GET", "/api/v1/platform/tenants?code=ZZZ")).json.data).toEqual([]);
  });

  it("M-3 ?name= compares case-insensitively and trimmed (TNT-G15)", async () => {
    const hit = await call(
      "GET",
      `/api/v1/platform/tenants?name=${encodeURIComponent("  beta WORKS ")}`,
    );
    expect(hit.json.data.map((t: { tenantId: string }) => t.tenantId)).toEqual(["org-b"]);
    expect((await call("GET", "/api/v1/platform/tenants?name=Beta")).json.data).toEqual([]);
  });

  it("M-3 refuses both filters at once", async () => {
    expect((await call("GET", "/api/v1/platform/tenants?code=A&name=Alpha")).status).toBe(400);
  });
});

describe("M-5 PATCH /platform/tenants/:tenantId (rename)", () => {
  beforeEach(async () => {
    await create({
      tenantId: "org-a",
      tenantCode: "A",
      tenantName: "Alpha",
      validFrom: "2026-01-01",
    });
    await create({
      tenantId: "org-b",
      tenantCode: "B",
      tenantName: "Beta",
      validFrom: "2026-01-01",
    });
  });

  const rename = (tenantId: string, body: unknown, headers = ON_BEHALF) =>
    call("PATCH", `/api/v1/platform/tenants/${tenantId}`, { body, headers });

  it("renames, keeps the code, and audits tenant.rename with before and after", async () => {
    const res = await rename("org-a", { tenantName: " Alpha Group ", reason: "new legal name" });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ tenantCode: "A", tenantName: "Alpha Group" });
    const rows = await auditOf("org-a");
    expect(rows.at(-1)).toMatchObject({
      action: "tenant.rename",
      reason: "new legal name",
      onBehalfOfSubjectId: "superadmin-sub",
      changes: [{ field: "tenantName", before: "Alpha", after: "Alpha Group" }],
    });
  });

  it("allows a tenant to change the case of its own name", async () => {
    expect((await rename("org-a", { tenantName: "ALPHA" })).status).toBe(200);
  });

  it("refuses another tenant's name in any case with 409 name_taken", async () => {
    const res = await rename("org-a", { tenantName: "beta" });
    expect(res.status).toBe(409);
    expect(refusalCode(res.json)).toBe("name_taken");
  });

  it("refuses a code change: the code is frozen (TNT-009)", async () => {
    const res = await rename("org-a", { tenantName: "Alpha", tenantCode: "ALP" });
    expect(res.status).toBe(422);
    expect(refusalCode(res.json)).toBe("code_frozen");
  });

  it("answers 404 for an unknown tenant", async () => {
    expect((await rename("org-zzz", { tenantName: "Zed" })).status).toBe(404);
  });
});

describe("M-6 PUT /platform/tenants/:tenantId/valid-to", () => {
  beforeEach(async () => {
    await create({
      tenantId: "org-a",
      tenantCode: "A",
      tenantName: "Alpha",
      validFrom: "2026-01-01",
    });
  });

  const setValidTo = (tenantId: string, body: unknown) =>
    call("PUT", `/api/v1/platform/tenants/${tenantId}/valid-to`, { body, headers: ON_BEHALF });
  const org = (id: string): AppJwtPayload => ({ sub: "u", organization: { a: { id, name: "A" } } });

  it("deactivates with a reason, audits tenant.deactivate, and the tenant's users are refused (TNT-G8 b)", async () => {
    expect((await call("GET", "/api/v1/sites", { token: org("org-a") })).status).toBe(200);
    // Last day 11 Oct: valid_to 12 Oct = today in Jakarta.
    const res = await setValidTo("org-a", { validTo: "2026-10-12", reason: "contract ended" });
    expect(res.status).toBe(200);
    expect(res.json.data.validTo).toBe("2026-10-12");
    expect((await auditOf("org-a")).at(-1)).toMatchObject({
      action: "tenant.deactivate",
      reason: "contract ended",
      effectiveTo: "2026-10-12",
      changes: [{ field: "validTo", before: null, after: "2026-10-12" }],
    });
    const refused = await call("GET", "/api/v1/sites", { token: org("org-a") });
    expect(refused.status).toBe(403);
    expect(refused.json).toEqual({ error: "no active tenant" });
  });

  it("reactivates with null, which also cancels a pending deactivation (TNT-G8 d)", async () => {
    await setValidTo("org-a", { validTo: "2026-12-01", reason: "ends in December" });
    const res = await setValidTo("org-a", { validTo: null, reason: "renewed" });
    expect(res.status).toBe(200);
    expect(res.json.data.validTo).toBeNull();
    expect((await auditOf("org-a")).at(-1)).toMatchObject({
      action: "tenant.reactivate",
      reason: "renewed",
      changes: [{ field: "validTo", before: "2026-12-01", after: null }],
    });
  });

  it("requires a reason both ways (AU-2) and changes nothing without one", async () => {
    for (const body of [{ validTo: "2026-12-01" }, { validTo: null, reason: "  " }]) {
      const res = await setValidTo("org-a", body);
      expect(res.status).toBe(422);
      expect(refusalCode(res.json)).toBe("reason_required");
    }
    expect((await call("GET", "/api/v1/platform/tenants/org-a")).json.data.validTo).toBeNull();
    expect((await auditOf("org-a")).map((r) => r.action)).toEqual(["tenant.create"]);
  });

  it("answers 404 for an unknown tenant", async () => {
    expect((await setValidTo("org-zzz", { validTo: null, reason: "x" })).status).toBe(404);
  });
});

describe("TNT-G15 database keys back the checks up when two writes race", () => {
  const store = () => new PlatformTenantsStore({ db, region: REGION });

  async function clash(work: () => Promise<unknown>): Promise<string | undefined> {
    try {
      await work();
      return undefined;
    } catch (err) {
      const mapped = mapPgError(err);
      return mapped ? await mapped.getResponse().text() : `unmapped: ${String(err)}`;
    }
  }

  it("a second name differing only by case and spaces hits tenant_name_key → name_taken", async () => {
    await store().insert({
      tenantId: "o1",
      tenantCode: "ONE",
      tenantName: "Acme",
      validFrom: "2026-01-01",
    });
    const error = await clash(() =>
      store().insert({
        tenantId: "o2",
        tenantCode: "TWO",
        tenantName: " ACME",
        validFrom: "2026-01-01",
      }),
    );
    expect(error).toBe('REFUSAL:{"code":"name_taken"}');
  });

  it("a same code hits tenant_code_key → code_taken", async () => {
    await store().insert({
      tenantId: "o1",
      tenantCode: "ONE",
      tenantName: "One",
      validFrom: "2026-01-01",
    });
    const error = await clash(() =>
      store().insert({
        tenantId: "o2",
        tenantCode: "ONE",
        tenantName: "Two",
        validFrom: "2026-01-01",
      }),
    );
    expect(error).toBe('REFUSAL:{"code":"code_taken"}');
  });

  it("a lower-case code is refused by tenant_code_upper", async () => {
    const error = await clash(() =>
      store().insert({
        tenantId: "o1",
        tenantCode: "one",
        tenantName: "One",
        validFrom: "2026-01-01",
      }),
    );
    expect(error).toMatch(/^unmapped: .*/);
    expect(await db.select().from(tenantTable)).toEqual([]);
  });
});
