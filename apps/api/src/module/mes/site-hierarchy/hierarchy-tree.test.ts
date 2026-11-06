// F-01 §9.14 — the tree builder and the service's rootId / includeInactive rules, on
// in-memory rows. Dates are far past / far future so the tests do not depend on the clock.

import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";

import { buildHierarchyTree, findNode, type HierarchyRows } from "./hierarchy-tree.js";
import { HierarchyTreeService } from "./hierarchy-tree-service.js";

import type { HierarchyTreeRepository } from "./hierarchy-tree-repository.js";

const TODAY = "2026-11-04";
const OPEN = null;
const CLOSED = "2000-01-01"; // valid_to in the past: inactive
const FUTURE = "2999-12-31";
const TENANT = { tenantId: "org-a", tenantCode: "ORG-A", tenantName: "Org A" };

const rows: HierarchyRows = {
  enterprises: [
    { id: "ent-2", code: "E2", name: "Beta", validTo: OPEN },
    { id: "ent-1", code: "E1", name: "Alpha", validTo: OPEN },
    { id: "ent-old", code: "EO", name: "Retired", validTo: CLOSED },
  ],
  sites: [
    { id: "site-10", code: "S10", name: "Site 10", enterpriseId: "ent-1", validTo: FUTURE },
    { id: "site-2", code: "S2", name: "Site 2", enterpriseId: "ent-1", validTo: OPEN },
    { id: "site-closed", code: "SC", name: "Closed site", enterpriseId: "ent-1", validTo: CLOSED },
    {
      id: "site-under-old",
      code: "SU",
      name: "Under retired",
      enterpriseId: "ent-old",
      validTo: OPEN,
    },
  ],
  areas: [
    { id: "area-1", code: "A1", name: "Area", siteId: "site-2", validTo: OPEN },
    { id: "area-x", code: "AX", name: "Retired area", siteId: "site-2", validTo: CLOSED },
  ],
  workCenters: [
    { id: "wc-1", code: "W1", name: "Line", areaId: "area-1", validTo: OPEN },
    { id: "wc-x", code: "WX", name: "Gone line", areaId: "area-1", validTo: CLOSED },
  ],
  workUnits: [
    { id: "wu-1", code: "U1", name: "Machine", workCenterId: "wc-1", validTo: OPEN },
    { id: "wu-x", code: "UX", name: "Old machine", workCenterId: "wc-1", validTo: CLOSED },
  ],
};

const options = (includeInactive: boolean) => ({ includeInactive, today: TODAY });

describe("buildHierarchyTree (F-01 §9.14)", () => {
  it("returns the tenant as the root, with the node shape the screen uses", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(false));
    expect(tree).toMatchObject({
      id: "org-a",
      code: "ORG-A",
      name: "Org A",
      level: "tenant",
      active: true,
    });
    const enterprise = tree.children[0];
    expect(Object.keys(enterprise).sort()).toEqual([
      "active",
      "children",
      "code",
      "id",
      "level",
      "name",
    ]);
  });

  it("nests Tenant → Enterprise → Site → Area → Work Center → Work Unit", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(false));
    const site = tree.children[0].children[0];
    const area = site.children[0];
    const workCenter = area.children[0];
    const workUnit = workCenter.children[0];
    expect(tree.children[0]).toMatchObject({ id: "ent-1", level: "enterprise" });
    expect(site).toMatchObject({ id: "site-2", level: "site" });
    expect(area).toMatchObject({ id: "area-1", level: "area" });
    expect(workCenter).toMatchObject({ id: "wc-1", level: "work-center" });
    expect(workUnit).toMatchObject({ id: "wu-1", level: "work-unit", children: [] });
  });

  it("sorts siblings by name, numeric-aware (Site 2 before Site 10)", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(true));
    const names = tree.children[0].children.map((s) => s.name);
    expect(names).toEqual(["Closed site", "Site 2", "Site 10"]);
    const enterprises = tree.children.map((e) => e.name);
    expect(enterprises).toEqual(["Alpha", "Beta", "Retired"]);
  });

  it("with includeInactive=false drops an inactive node and its whole branch", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(false));
    // Retired enterprise is gone with its site, which has no kept ancestor path.
    expect(tree.children.map((e) => e.id)).toEqual(["ent-1", "ent-2"]);
    // Closed site, retired area and retired work center are gone; their children too.
    const site = tree.children.find((e) => e.id === "ent-1")!.children;
    expect(site.map((s) => s.id)).toEqual(["site-2", "site-10"]);
    const areas = site.find((s) => s.id === "site-2")!.children.map((a) => a.id);
    expect(areas).toEqual(["area-1"]);
    const workUnits = findNode(tree, "wc-1")!.children.map((u) => u.id);
    expect(workUnits).toEqual(["wu-1"]);
    expect(findNode(tree, "wc-x")).toBeUndefined();
    expect(findNode(tree, "wu-x")).toBeUndefined();
  });

  it("with includeInactive=true keeps inactive nodes, marked active=false", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(true));
    expect(findNode(tree, "ent-old")).toMatchObject({ active: false });
    expect(findNode(tree, "site-closed")).toMatchObject({ active: false });
    expect(findNode(tree, "wu-x")).toMatchObject({ active: false });
    expect(findNode(tree, "site-10")).toMatchObject({ active: true });
  });

  it("treats a future valid_to as active (valid_to is exclusive)", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(false));
    expect(findNode(tree, "site-10")).toBeDefined();
  });

  it("findNode returns the node by id, or undefined for an unknown id", () => {
    const tree = buildHierarchyTree(TENANT, rows, options(false));
    expect(findNode(tree, "wu-1")).toMatchObject({ id: "wu-1" });
    expect(findNode(tree, "nope")).toBeUndefined();
  });
});

describe("HierarchyTreeService.tree (F-01 §9.14 rootId rules)", () => {
  const service = new HierarchyTreeService({
    hierarchyTreeRepository: { load: async () => rows } as unknown as HierarchyTreeRepository,
  });

  it("returns the whole tree when rootId is the tenant id", async () => {
    const tree = await service.tree(TENANT, { includeInactive: false, rootId: "org-a" });
    expect(tree.id).toBe("org-a");
    expect(tree.children.map((e) => e.id)).toEqual(["ent-1", "ent-2"]);
  });

  it("returns the subtree of a rootId", async () => {
    const node = await service.tree(TENANT, { includeInactive: false, rootId: "site-2" });
    expect(node).toMatchObject({ id: "site-2", level: "site" });
    expect(node.children.map((a) => a.id)).toEqual(["area-1"]);
  });

  it("returns 404 for an unknown rootId", async () => {
    const error = await service
      .tree(TENANT, { includeInactive: false, rootId: "missing" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    expect((error as HTTPException).status).toBe(404);
  });

  it("returns 404 for an inactive rootId when includeInactive=false", async () => {
    const error = await service
      .tree(TENANT, { includeInactive: false, rootId: "site-closed" })
      .catch((e: unknown) => e);
    expect((error as HTTPException).status).toBe(404);
  });

  it("returns the inactive rootId when includeInactive=true", async () => {
    const node = await service.tree(TENANT, { includeInactive: true, rootId: "site-closed" });
    expect(node).toMatchObject({ id: "site-closed", active: false });
  });
});
