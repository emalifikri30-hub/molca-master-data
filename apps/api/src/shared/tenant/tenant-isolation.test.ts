// Real-SQL isolation tests (F-00 rule 6, E-2): every statement runs against PGlite with
// the full migration set applied, through the same stores and services the API uses.
// Tenant = Keycloak organization id. Each test names the rule it checks.

import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { buildAuditRows } from "../audit/audit-rows.js";
import { runAudited, type AuditContext } from "../audit/audit-context.js";
import { createPgliteDb } from "../database/testing/pglite-db.js";
import {
  areaTable,
  auditLogTable,
  enterpriseTable,
  measurementGroupTable,
  productDetailTable,
  productTable,
  siteTable,
  tenantTable,
  unitOfMeasurementTable,
  workCenterTable,
  workUnitKpiBindingTable,
} from "../database/schema/schema.js";
import { AuditLogService } from "../../module/mes/audit-log/audit-log-service.js";
import { AuditLogStore } from "../../module/mes/audit-log/audit-log-store.js";
import { AreasService } from "../../module/mes/areas/areas-service.js";
import {
  AreasReaderRepository,
  AreasWriterRepository,
} from "../../module/mes/areas/areas-repository.js";
import { EnterpriseService } from "../../module/mes/enterprise/enterprise-service.js";
import { EnterpriseStore } from "../../module/mes/enterprise/enterprise-store.js";
import { WorkCentersStore } from "../../module/mes/work-centers/work-centers-store.js";
import { WorkUnitKpiBindingsStore } from "../../module/mes/work-unit-kpi-bindings/work-unit-kpi-bindings-store.js";
import { WorkUnitsStore } from "../../module/mes/work-units/work-units-store.js";
import {
  ProductsReaderRepository,
  ProductsWriterRepository,
} from "../../module/mes/products/products-repository.js";
import { ProductsService } from "../../module/mes/products/products-service.js";
import { PlanningClient } from "../../module/planning/planning-client.js";
import {
  SitesReaderRepository,
  SitesWriterRepository,
} from "../../module/mes/sites/sites-repository.js";
import { SitesService } from "../../module/mes/sites/sites-service.js";
import { createFindTenant } from "./tenant-store.js";
import { runInTenant } from "./tenant-context.js";

import type { PGlite } from "@electric-sql/pglite";
import type { PostgresDB } from "../database/postgres.js";

const REGION = "ap3";
const TODAY = "2026-10-12";
const ORG_A = "org-a";
const ORG_B = "org-b";
const ACTOR = {
  type: "user" as const,
  subjectId: "user-a",
  displayName: "A User",
  source: "ui" as const,
};

let db: PostgresDB;
let client: PGlite;

// Services are built the way the container builds them, over the tenant-scoped repositories.
const enterprises = () =>
  new EnterpriseService({ enterpriseStore: new EnterpriseStore({ db, region: REGION }) });
const sites = () =>
  new SitesService({
    sitesReaderRepository: new SitesReaderRepository({ db, region: REGION }),
    sitesWriterRepository: new SitesWriterRepository({ db, region: REGION }),
  });
const areas = () =>
  new AreasService({
    areasReaderRepository: new AreasReaderRepository({ db, region: REGION }),
    areasWriterRepository: new AreasWriterRepository({ db, region: REGION }),
  });
const products = () =>
  new ProductsService({
    // Planning is stubbed at fetch (see the cross-tenant test); its client is the real one.
    planningClient: new PlanningClient({
      planningBaseUrl: "http://planning.test",
      planningTimeoutMs: 5_000,
    }),
    productsReaderRepository: new ProductsReaderRepository({ db, region: REGION }),
    productsWriterRepository: new ProductsWriterRepository({ db, region: REGION }),
    // Work master and reference data are not used by these calls; close() reads both,
    // and is covered with empty answers.
    workMasterService: {
      data: { readBoms: async () => [], readRoutings: async () => [] },
    } as never,
    referenceDataStore: {} as never,
  });

/** Runs `work` and returns what it threw, or undefined when it did not throw. */
async function thrown(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
    return undefined;
  } catch (error) {
    return error;
  }
}

const notFound = (error: unknown) => error instanceof HTTPException && error.status === 404;

beforeAll(async () => {
  ({ db, client } = await createPgliteDb());
  await db.insert(tenantTable).values([
    { tenantId: ORG_A, tenantCode: "ORG-A", tenantName: "Org A", validFrom: "2026-01-01" },
    { tenantId: ORG_B, tenantCode: "ORG-B", tenantName: "Org B", validFrom: "2026-01-01" },
    // findTenant fixtures (codes must be unique).
    {
      tenantId: "org-ended",
      tenantCode: "ENDED",
      tenantName: "Ended",
      validFrom: "2026-01-01",
      validTo: TODAY,
    },
    { tenantId: "org-future", tenantCode: "FUTURE", tenantName: "Future", validFrom: "2026-10-13" },
  ]);
  // Product base unit: one per tenant, as the seed gives each tenant its own.
  await db.insert(measurementGroupTable).values({
    id: "mg-count",
    region: REGION,
    tenantId: ORG_A,
    code: "COUNT",
    name: "Count",
    validFrom: "2026-01-01",
  });
  await db.insert(unitOfMeasurementTable).values({
    id: "uom-pcs",
    region: REGION,
    tenantId: ORG_A,
    code: "PCS",
    name: "Piece",
    unit: "pcs",
    measurementGroupId: "mg-count",
  });
}, 60_000);

afterAll(async () => {
  await client.close();
});

describe("tenant isolation over the real schema (F-00 rule 6)", () => {
  describe("enterprise, sites, areas, products", () => {
    let enterpriseId = "";
    let siteId = "";
    let areaId = "";
    let productId = "";

    it("a session for one organization can write its own enterprise, site, area and product", async () => {
      await runInTenant({ tenantId: ORG_A }, async () => {
        const ent = await new EnterpriseStore({ db, region: REGION }).create({
          code: "ENT-A",
          name: "Enterprise A",
          validFrom: "2026-01-01",
        });
        enterpriseId = ent.id;
        const site = await sites().create({
          enterpriseId,
          code: "SITE-A",
          name: "Site A",
          timezone: "Asia/Jakarta",
        });
        siteId = site.id;
        const area = await areas().create({ siteId, code: "AREA-A", name: "Area A" });
        areaId = area.id;
        const product = await products().create({
          code: "PRD-A",
          name: "Product A",
          productType: "finished_good",
          packagingLevel: null,
          baseUomId: "uom-pcs",
        });
        productId = product.id;
      });
      expect(enterpriseId).not.toBe("");
      expect(siteId).not.toBe("");
      expect(areaId).not.toBe("");
      expect(productId).not.toBe("");
    });

    it("a session for one organization cannot list another organization's enterprises, sites, areas or products (F-00 rule 6)", async () => {
      await runInTenant({ tenantId: ORG_B }, async () => {
        const e = await enterprises().getPaged(1, 50, {});
        expect(e.items).toEqual([]);
        const s = await sites().getPaged(1, 50, {});
        expect(s.items).toEqual([]);
        const a = await areas().getPaged(1, 50, {});
        expect(a.items).toEqual([]);
        expect(await products().list()).toEqual([]);
      });
    });

    it("a session for one organization cannot read another organization's rows by id (F-00 rule 6)", async () => {
      await runInTenant({ tenantId: ORG_B }, async () => {
        expect(notFound(await thrown(() => enterprises().get(enterpriseId)))).toBe(true);
        expect(notFound(await thrown(() => sites().get(siteId)))).toBe(true);
        expect(notFound(await thrown(() => areas().get(areaId)))).toBe(true);
        expect(notFound(await thrown(() => products().get(productId)))).toBe(true);
      });
    });

    it("a session for one organization cannot update another organization's rows (F-00 rule 6)", async () => {
      await runInTenant({ tenantId: ORG_B }, async () => {
        expect(
          notFound(await thrown(() => enterprises().update(enterpriseId, { name: "Hacked" }))),
        ).toBe(true);
        expect(notFound(await thrown(() => sites().update(siteId, { name: "Hacked" })))).toBe(true);
        expect(notFound(await thrown(() => areas().update(areaId, { name: "Hacked" })))).toBe(true);
        expect(notFound(await thrown(() => products().update(productId, { name: "Hacked" })))).toBe(
          true,
        );
      });
    });

    it("a session for one organization cannot deactivate another organization's rows (F-00 rule 6)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ data: { workOrders: [], jobOrders: [], executions: [] } }),
            ),
        ),
      );
      try {
        await runInTenant({ tenantId: ORG_B }, async () => {
          expect(notFound(await thrown(() => enterprises().deactivate(enterpriseId)))).toBe(true);
          expect(notFound(await thrown(() => sites().update(siteId, { validTo: TODAY })))).toBe(
            true,
          );
          expect(notFound(await thrown(() => areas().update(areaId, { validTo: TODAY })))).toBe(
            true,
          );
          expect(notFound(await thrown(() => products().close(productId, TODAY)))).toBe(true);
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("A's rows are unchanged after every cross-tenant attempt from B (F-00 rule 6)", async () => {
      await runInTenant({ tenantId: ORG_A }, async () => {
        const [ent] = await enterprises()
          .getPaged(1, 50, {})
          .then((r) => r.items);
        expect(ent).toMatchObject({ id: enterpriseId, name: "Enterprise A", validTo: null });
        expect(await sites().get(siteId)).toMatchObject({ name: "Site A" });
        expect(await areas().get(areaId)).toMatchObject({ name: "Area A" });
        expect(await products().get(productId)).toMatchObject({ name: "Product A" });
      });
      // Read the raw rows too, so a filter bug in the service layer cannot hide a change.
      const [raw] = await db
        .select()
        .from(enterpriseTable)
        .where(eq(enterpriseTable.id, enterpriseId));
      expect(raw).toMatchObject({ name: "Enterprise A", validTo: null, tenantId: ORG_A });
      const [rawSite] = await db.select().from(siteTable).where(eq(siteTable.id, siteId));
      expect(rawSite).toMatchObject({ name: "Site A", validTo: null, tenantId: ORG_A });
      const [rawArea] = await db.select().from(areaTable).where(eq(areaTable.id, areaId));
      expect(rawArea).toMatchObject({ name: "Area A", validTo: null, tenantId: ORG_A });
      const [rawProduct] = await db
        .select()
        .from(productTable)
        .where(eq(productTable.id, productId));
      expect(rawProduct).toMatchObject({ name: "Product A", validTo: null, tenantId: ORG_A });
    });

    it("a session for one organization cannot create an area under another organization's site (F-00 rule 6)", async () => {
      await runInTenant({ tenantId: ORG_B }, async () => {
        const error = await thrown(() =>
          areas().create({ siteId, code: "AREA-X", name: "Cross tenant" }),
        );
        // Refused: the parent site is not visible in this tenant, so it reads as missing.
        expect(notFound(error)).toBe(true);
      });
      await runInTenant({ tenantId: ORG_A }, async () => {
        expect(
          await areas()
            .getPaged(1, 50, {})
            .then((r) => r.items.map((a) => a.code)),
        ).toEqual(["AREA-A"]);
      });
    });
  });

  describe("cross-tenant links (F-00 rule 6, link check in EntityRepository)", () => {
    it("org-b cannot create a site under org-a's enterprise", async () => {
      const enterpriseA = (
        await db.select().from(enterpriseTable).where(eq(enterpriseTable.tenantId, ORG_A))
      )[0];
      expect(enterpriseA).toBeDefined();
      await runInTenant({ tenantId: ORG_B }, async () => {
        const error = await thrown(() =>
          sites().create({
            enterpriseId: enterpriseA!.id,
            code: "SITE-LINK-X",
            name: "Cross tenant site",
            timezone: "Asia/Jakarta",
          }),
        );
        expect(notFound(error)).toBe(true);
      });
      const created = await db.select().from(siteTable).where(eq(siteTable.code, "SITE-LINK-X"));
      expect(created).toEqual([]);
    });

    it("org-b cannot point its own area at org-a's site on UPDATE", async () => {
      const siteA = (await db.select().from(siteTable).where(eq(siteTable.tenantId, ORG_A)))[0];
      expect(siteA).toBeDefined();
      await runInTenant({ tenantId: ORG_B }, async () => {
        const enterpriseB = await new EnterpriseStore({ db, region: REGION }).create({
          code: "ENT-B",
          name: "Enterprise B",
          validFrom: "2026-01-01",
        });
        const siteB = await sites().create({
          enterpriseId: enterpriseB.id,
          code: "SITE-B",
          name: "Site B",
          timezone: "Asia/Jakarta",
        });
        const areaB = await areas().create({ siteId: siteB.id, code: "AREA-B", name: "Area B" });
        const error = await thrown(() => areas().update(areaB.id, { siteId: siteA!.id }));
        expect(notFound(error)).toBe(true);
        expect(await areas().get(areaB.id)).toMatchObject({ siteId: siteB.id });
      });
    });

    it("org-b cannot add a product detail for org-a's product", async () => {
      const productA = (
        await db.select().from(productTable).where(eq(productTable.tenantId, ORG_A))
      )[0];
      expect(productA).toBeDefined();
      await runInTenant({ tenantId: ORG_B }, async () => {
        const error = await thrown(() =>
          new ProductsWriterRepository({ db, region: REGION }).insertDetail({
            productId: productA!.id,
            weightUomId: null,
            isBatchTracked: false,
          }),
        );
        expect(notFound(error)).toBe(true);
      });
      const details = await db
        .select()
        .from(productDetailTable)
        .where(eq(productDetailTable.productId, productA!.id));
      expect(details).toEqual([]);
    });

    it("a link within the same tenant still works", async () => {
      await runInTenant({ tenantId: ORG_A }, async () => {
        const enterprise = (
          await db.select().from(enterpriseTable).where(eq(enterpriseTable.tenantId, ORG_A))
        )[0];
        const site = await sites().create({
          enterpriseId: enterprise!.id,
          code: "SITE-A2",
          name: "Site A2",
          timezone: "Asia/Jakarta",
        });
        const area = await areas().create({ siteId: site.id, code: "AREA-A2", name: "Area A2" });
        expect(area).toMatchObject({ siteId: site.id });
        await new ProductsWriterRepository({ db, region: REGION }).insertDetail({
          productId: (
            await db.select().from(productTable).where(eq(productTable.tenantId, ORG_A))
          )[0]!.id,
          weightUomId: null,
          isBatchTracked: false,
        });
      });
    });

    it("a NULL or empty optional link still works", async () => {
      const siteA = (await db.select().from(siteTable).where(eq(siteTable.tenantId, ORG_A)))[0];
      await runInTenant({ tenantId: ORG_A }, async () => {
        const area = await areas().create({
          siteId: siteA!.id,
          code: "AREA-A3",
          name: "Area A3",
          classId: "",
        });
        expect(area.classId).toBe("");
        const updated = await areas().update(area.id, { classId: "" });
        expect(updated).toMatchObject({ classId: "" });
      });
    });
    it("org-b cannot create a work center under org-a's area (F-00 rule 6)", async () => {
      const areaA = (await db.select().from(areaTable).where(eq(areaTable.tenantId, ORG_A)))[0];
      expect(areaA).toBeDefined();
      await runInTenant({ tenantId: ORG_B }, async () => {
        const error = await thrown(() =>
          new WorkCentersStore({ db, region: REGION }).create({
            areaId: areaA!.id,
            code: "WC-LINK-X",
            name: "Cross tenant work center",
            type: "production_line",
          }),
        );
        expect(notFound(error)).toBe(true);
      });
      const created = await db
        .select()
        .from(workCenterTable)
        .where(eq(workCenterTable.code, "WC-LINK-X"));
      expect(created).toEqual([]);
    });

    it("org-b cannot bind a KPI to org-a's work unit (F-00 rule 6)", async () => {
      const areaA = (await db.select().from(areaTable).where(eq(areaTable.tenantId, ORG_A)))[0];
      const workUnitA = await runInTenant({ tenantId: ORG_A }, async () => {
        const workCenter = await new WorkCentersStore({ db, region: REGION }).create({
          areaId: areaA!.id,
          code: "WC-KPI-A",
          name: "Work center for KPI",
          type: "production_line",
        });
        return new WorkUnitsStore({ db, region: REGION }).create({
          workCenterId: workCenter.id,
          code: "WU-KPI-A",
          name: "Work unit for KPI",
        });
      });
      await runInTenant({ tenantId: ORG_B }, async () => {
        const error = await thrown(() =>
          new WorkUnitKpiBindingsStore({ db, region: REGION }).create({
            workUnitId: workUnitA.id,
            slotId: "slot-x",
            assetTagId: "tag-x",
            transform: "none",
            validFrom: TODAY,
          }),
        );
        // workUnitId is checked first, so the refusal names the work unit, not the tag.
        expect(notFound(error)).toBe(true);
      });
      const bindings = await db
        .select()
        .from(workUnitKpiBindingTable)
        .where(eq(workUnitKpiBindingTable.workUnitId, workUnitA.id));
      expect(bindings).toEqual([]);
    });
  });

  describe("rows with no tenant", () => {
    it("rows with a NULL tenant_id are invisible to every tenant (F-00 rule 6)", async () => {
      await db.insert(enterpriseTable).values({
        id: "ent-null",
        region: REGION,
        code: "ENT-NULL",
        name: "No tenant",
        validFrom: "2026-01-01",
      });
      await runInTenant({ tenantId: ORG_A }, async () => {
        const rows = await enterprises().getPaged(1, 50, {});
        expect(rows.items.map((r) => r.id)).not.toContain("ent-null");
        expect(notFound(await thrown(() => enterprises().get("ent-null")))).toBe(true);
      });
      await runInTenant({ tenantId: ORG_B }, async () => {
        const rows = await enterprises().getPaged(1, 50, {});
        expect(rows.items.map((r) => r.id)).not.toContain("ent-null");
        expect(notFound(await thrown(() => enterprises().get("ent-null")))).toBe(true);
      });
    });
  });

  describe("audit", () => {
    it("the audit row written for a save in organization A carries tenant_id A (F-14 §9.1, F-00 rule 6)", async () => {
      const auditLog = new AuditLogService({
        auditLogStore: new AuditLogStore({ db, region: REGION }),
      });
      const siteRow = (await db.select().from(siteTable).where(eq(siteTable.tenantId, ORG_A)))[0];
      expect(siteRow).toBeDefined();
      const context: AuditContext = {
        actor: ACTOR,
        reason: "rename for test",
        writes: [],
        actions: new Map(),
      };
      await runInTenant({ tenantId: ORG_A }, () =>
        runAudited(context, () => sites().update(siteRow!.id, { name: "Site A renamed" })),
      );
      const rows = buildAuditRows(context, "tx-audit-a");
      expect(rows.length).toBeGreaterThan(0);
      await runInTenant({ tenantId: ORG_A }, async () => {
        for (const row of rows) await auditLog.record(row);
      });
      const written = await db
        .select({ tenantId: auditLogTable.tenantId })
        .from(auditLogTable)
        .where(eq(auditLogTable.transactionId, "tx-audit-a"));
      expect(written.length).toBe(rows.length);
      expect(written.every((r) => r.tenantId === ORG_A)).toBe(true);
    });
  });

  describe("tenant registry (createFindTenant)", () => {
    it("an organization whose tenant is in force today is found (F-01 §9.1)", async () => {
      expect(await createFindTenant(db)(ORG_A, TODAY)).toEqual({
        tenantId: ORG_A,
        tenantCode: "ORG-A",
        tenantName: "Org A",
      });
    });

    it("a tenant whose valid_to is today is not found (exclusive end, F-01 §9.1)", async () => {
      expect(await createFindTenant(db)("org-ended", TODAY)).toBeUndefined();
    });

    it("a tenant whose valid_from is tomorrow is not found (F-01 §9.1)", async () => {
      expect(await createFindTenant(db)("org-future", TODAY)).toBeUndefined();
    });

    it("an unknown organization is not found (F-00 rule 6)", async () => {
      expect(await createFindTenant(db)("org-unknown", TODAY)).toBeUndefined();
    });
  });
});
