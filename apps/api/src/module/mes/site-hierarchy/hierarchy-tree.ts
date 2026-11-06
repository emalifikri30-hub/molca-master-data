// docs-molcadx F-01 §9.14 — the Site Hierarchy as one nested tree for other modules.
// Pure: the repository loads the rows, this file nests them. Same node shape as the
// Site Hierarchy tree screen: id, code, name, level, active, children.
import { isActiveRow } from "./hierarchy-rules.js";

type TreeLevel = "tenant" | "enterprise" | "site" | "area" | "work-center" | "work-unit";

type TreeNode = {
  id: string;
  code: string;
  name: string;
  level: TreeLevel;
  /** valid_to is null or after today (UTC). Same rule as `isActiveRow` (F-01 §9.14, S-11). */
  active: boolean;
  children: TreeNode[];
};

type TreeTenant = { tenantId: string; tenantCode: string; tenantName: string };

/** The columns the tree reads from one level. */
type TreeRow = { id: string; code: string; name: string; validTo?: string | null };

type HierarchyRows = {
  enterprises: TreeRow[];
  sites: Array<TreeRow & { enterpriseId: string }>;
  areas: Array<TreeRow & { siteId: string }>;
  workCenters: Array<TreeRow & { areaId: string }>;
  workUnits: Array<TreeRow & { workCenterId: string }>;
};

type TreeOptions = {
  /** false: an inactive node and its whole branch are left out (the default). */
  includeInactive: boolean;
  /** YYYY-MM-DD the `active` rule is judged on. */
  today: string;
};

type ChildLevel = Exclude<TreeLevel, "tenant">;

function toNode(row: TreeRow, level: ChildLevel, children: TreeNode[], today: string): TreeNode {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    level,
    active: isActiveRow(row, today),
    children,
  };
}

function byName(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name, "en", { numeric: true });
}

/**
 * Nests the rows under the tenant. Children are grouped by their parent id and sorted by
 * name. With `includeInactive: false` an inactive row is dropped before grouping, so its
 * whole branch is dropped with it: a child can only be reached through a kept parent.
 */
function buildHierarchyTree(
  tenant: TreeTenant,
  rows: HierarchyRows,
  options: TreeOptions,
): TreeNode {
  const { includeInactive, today } = options;
  const keep = <T extends TreeRow>(list: readonly T[]): T[] =>
    includeInactive ? [...list] : list.filter((r) => isActiveRow(r, today));
  const groupBy = <T extends TreeRow>(list: readonly T[], parentOf: (r: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const row of keep(list)) {
      const key = parentOf(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return groups;
  };

  const sitesByEnterprise = groupBy(rows.sites, (r) => r.enterpriseId);
  const areasBySite = groupBy(rows.areas, (r) => r.siteId);
  const workCentersByArea = groupBy(rows.workCenters, (r) => r.areaId);
  const workUnitsByWorkCenter = groupBy(rows.workUnits, (r) => r.workCenterId);

  const workUnitNodes = (workCenterId: string): TreeNode[] =>
    (workUnitsByWorkCenter.get(workCenterId) ?? [])
      .map((u) => toNode(u, "work-unit", [], today))
      .toSorted(byName);
  const workCenterNodes = (areaId: string): TreeNode[] =>
    (workCentersByArea.get(areaId) ?? [])
      .map((w) => toNode(w, "work-center", workUnitNodes(w.id), today))
      .toSorted(byName);
  const areaNodes = (siteId: string): TreeNode[] =>
    (areasBySite.get(siteId) ?? [])
      .map((a) => toNode(a, "area", workCenterNodes(a.id), today))
      .toSorted(byName);
  const siteNodes = (enterpriseId: string): TreeNode[] =>
    (sitesByEnterprise.get(enterpriseId) ?? [])
      .map((s) => toNode(s, "site", areaNodes(s.id), today))
      .toSorted(byName);

  return {
    id: tenant.tenantId,
    code: tenant.tenantCode,
    name: tenant.tenantName,
    level: "tenant",
    active: true,
    children: keep(rows.enterprises)
      .map((e) => toNode(e, "enterprise", siteNodes(e.id), today))
      .toSorted(byName),
  };
}

/** The node with this id in the tree, or undefined. Ids are unique across levels (ULIDs). */
function findNode(root: TreeNode, id: string): TreeNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export { buildHierarchyTree, findNode };
export type { HierarchyRows, TreeLevel, TreeNode, TreeOptions, TreeRow, TreeTenant };
