// Real-SQL check of the tree read (F-00 rule 6, E-2; F-01 §9.14): PGlite with the full
// migration set, the same repository and service the API builds, one tenant at a time.

import { HTTPException } from "hono/http-exception";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createPgliteDb } from "../../../shared/database/testing/pglite-db.js";
import {
  areaTable,
  enterpriseTable,
  siteTable,
  tenantTable,
  workCenterTable,
  workUnitTable,
} from "../../../shared/database/schema/schema.js";
import { runInTenant } from "../../../shared/tenant/tenant-context.js";
import { HierarchyTreeRepository } from "./hierarchy-tree-repository.js";
import { HierarchyTreeService } from "./hierarchy-tree-service.js";
import { findNode, type TreeNode } from "./hierarchy-tree.js";

import type { PGlite } from "@electric-sql/pglite";
import type { PostgresDB } from "../../../shared/database/postgres.js";

const REGION = "ap3";
const ORG_A = "org-a";
const ORG_B = "org-b";
const TENANT_A = { tenantId: ORG_A, tenantCode: "ORG-A", tenantName: "Org A" };
const TENANT_B = { tenantId: ORG_B, tenantCode: "ORG-B", tenantName: "Org B" };
const CLOSED = "2000-01-01";

let db: PostgresDB;
let client: PGlite;
let service: HierarchyTreeService;

beforeAll(async () => {
  ({ db, client } = await createPgliteDb());
  service = new HierarchyTreeService({
    hierarchyTreeRepository: new HierarchyTreeRepository({ db, region: REGION }),
  });
  await db.insert(tenantTable).values([
    { tenantId: ORG_A, tenantCode: "ORG-A", tenantName: "Org A", validFrom: "2026-01-01" },
    { tenantId: ORG_B, tenantCode: "ORG-B", tenantName: "Org B", validFrom: "2026-01-01" },
  ]);
  const base = { region: REGION, validFrom: "2026-01-01" };
  await db.insert(enterpriseTable).values([
    { ...base, id: "ent-a", tenantId: ORG_A, code: "ENT-A", name: "Enterprise A" },
    { ...base, id: "ent-b", tenantId: ORG_B, code: "ENT-B", name: "Enterprise B" },
  ]);
  await db.insert(siteTable).values([
    {
      ...base,
      id: "site-a",
      tenantId: ORG_A,
      enterpriseId: "ent-a",
      code: "SITE-A",
      name: "Site A",
      timezone: "Asia/Jakarta",
    },
    {
      ...base,
      id: "site-a-closed",
      tenantId: ORG_A,
      enterpriseId: "ent-a",
      code: "SITE-OLD",
      name: "Site old",
      timezone: "Asia/Jakarta",
      validTo: CLOSED,
    },
    {
      ...base,
      id: "site-b",
      tenantId: ORG_B,
      enterpriseId: "ent-b",
      code: "SITE-B",
      name: "Site B",
      timezone: "Asia/Jakarta",
    },
  ]);
  await db.insert(areaTable).values([
    { ...base, id: "area-a", tenantId: ORG_A, siteId: "site-a", code: "AREA-A", name: "Area A" },
    { ...base, id: "area-b", tenantId: ORG_B, siteId: "site-b", code: "AREA-B", name: "Area B" },
  ]);
  await db.insert(workCenterTable).values([
    {
      ...base,
      id: "wc-a",
      tenantId: ORG_A,
      areaId: "area-a",
      code: "WC-A",
      name: "Line A",
      type: "machine",
    },
  ]);
  await db
    .insert(workUnitTable)
    .values([
      { ...base, id: "wu-a", tenantId: ORG_A, workCenterId: "wc-a", code: "WU-A", name: "Unit A" },
    ]);
}, 60_000);

afterAll(async () => {
  await client.close();
});

const ids = (node: TreeNode): string[] => [node.id, ...node.children.flatMap(ids)];

describe("hierarchy tree is tenant-scoped (F-00 rule 6)", () => {
  it("a tenant's tree holds only its own rows, at every level", async () => {
    const tree = await runInTenant({ tenantId: ORG_A }, () =>
      service.tree(TENANT_A, { includeInactive: true }),
    );
    expect(ids(tree)).toEqual([
      "org-a",
      "ent-a",
      "site-a",
      "area-a",
      "wc-a",
      "wu-a",
      "site-a-closed",
    ]);
    expect(ids(tree)).not.toContain("ent-b");
  });

  it("the other tenant sees only its own enterprise and site", async () => {
    const tree = await runInTenant({ tenantId: ORG_B }, () =>
      service.tree(TENANT_B, { includeInactive: true }),
    );
    expect(ids(tree)).toEqual(["org-b", "ent-b", "site-b", "area-b"]);
  });

  it("default includeInactive=false leaves out the closed site", async () => {
    const tree = await runInTenant({ tenantId: ORG_A }, () =>
      service.tree(TENANT_A, { includeInactive: false }),
    );
    expect(findNode(tree, "site-a-closed")).toBeUndefined();
    expect(findNode(tree, "wu-a")).toMatchObject({ level: "work-unit", active: true });
  });

  it("another tenant's node is not found as rootId (404)", async () => {
    const error = await runInTenant({ tenantId: ORG_B }, () =>
      service.tree(TENANT_B, { includeInactive: true, rootId: "area-a" }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    expect((error as HTTPException).status).toBe(404);
  });

  it("a rootId inside the tenant returns that subtree", async () => {
    const node = await runInTenant({ tenantId: ORG_A }, () =>
      service.tree(TENANT_A, { includeInactive: false, rootId: "wc-a" }),
    );
    expect(ids(node)).toEqual(["wc-a", "wu-a"]);
  });
});
