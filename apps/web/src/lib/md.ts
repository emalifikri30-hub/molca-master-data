import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/http";

import type { AssetTree, HierarchyNode, WebResponse } from "@/lib/types";

// Master Data on the web: the site hierarchy, assets, their placement on work units, asset classes and types.
// The API (apps/api, schema master_data) owns the records; this file is the one door to it. Every call goes
// through the BFF proxy, which adds the person's bearer token.
const API = "/api/proxy/api/v1";
export const mdKey = ["md"] as const;

type Page<T> = { data: T[] | null; error: string | null; meta?: { totalPages: number } };

/** Every row of a paged list (the API caps a page at 100). */
async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await http.get<Page<T>>(`${API}${path}`, { params: { page, size: 100 } });
    if (data.data == null) throw new Error(data.error ?? `${path} unavailable`);
    out.push(...data.data);
    if (!data.meta || page >= data.meta.totalPages) return out;
  }
}
/** A write. Every change by a person except creating a record needs a reason; it goes in x-audit-reason. */
async function send<T>(
  method: "post" | "put",
  path: string,
  body: unknown,
  reason?: string,
): Promise<T> {
  const headers = reason ? { "x-audit-reason": encodeURIComponent(reason) } : undefined;
  const { data } = await http[method]<WebResponse<T>>(`${API}${path}`, body, { headers });
  if (data.data == null) throw new Error(data.error ?? `${path} failed`);
  return data.data;
}

type ComponentLevel = "equipment_unit" | "subunit" | "maintainable_item" | "part";
type Lifecycle =
  | "planned"
  | "installed"
  | "operational"
  | "under_maintenance"
  | "idle"
  | "decommissioned";
const COMPONENT_LEVELS: ComponentLevel[] = [
  "equipment_unit",
  "subunit",
  "maintainable_item",
  "part",
];
const LIFECYCLES: Lifecycle[] = [
  "planned",
  "installed",
  "operational",
  "under_maintenance",
  "idle",
  "decommissioned",
];

type Asset = {
  id: string;
  assetTag: string;
  assetName: string;
  assetTypeId: string;
  serialNumber: string;
  parentAssetId: string;
  componentLevel: ComponentLevel;
  lifecycleStatus: Lifecycle;
  commissioningDate: string;
  attributes: Record<string, string>;
};
type AssetInput = Omit<Asset, "id">;
type Placement = {
  id: string;
  assetId: string;
  workUnitId: string;
  placementRole: "primary" | "secondary";
  validFrom: string;
  validTo: string | null;
};
type AssetType = {
  id: string;
  assetClassId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  validTo?: string | null;
};
type AssetClass = {
  id: string;
  code: string;
  name: string;
  parentClassId?: string;
  validTo?: string | null;
};
type MdNode = Omit<HierarchyNode, "assets"> & { children: MdNode[] };

type Registry = {
  tree: AssetTree;
  assets: Asset[];
  placements: Placement[];
  types: AssetType[];
  classes: AssetClass[];
  /** work unit id → its path (site › area › line › unit) */
  paths: Map<string, string[]>;
};

/** Everything the Assets and Hierarchy pages show, read once and joined here. */
async function getRegistry(): Promise<Registry> {
  const [{ data: tree }, assets, placements, allTypes, allClasses] = await Promise.all([
    http.get<WebResponse<MdNode>>(`${API}/site-hierarchy/tree`),
    all<Asset>("/assets"),
    all<Placement>("/asset-placements"),
    all<AssetType>("/asset-types"),
    all<AssetClass>("/asset-classes"),
  ]);
  if (!tree.data) throw new Error(tree.error ?? "hierarchy unavailable");
  const live = placements.filter((p) => !p.validTo);
  // classes and types that are still in force (a retired one keeps its rows for history)
  const today = new Date().toISOString().slice(0, 10);
  const types = allTypes.filter((x) => !x.validTo || x.validTo > today);
  const classes = allClasses.filter((x) => !x.validTo || x.validTo > today);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const paths = new Map<string, string[]>();
  let units = 0;
  const walk = (n: MdNode, path: string[]): HierarchyNode => {
    const here = n.level === "tenant" ? path : [...path, n.name];
    if (n.level === "work-unit") {
      units++;
      paths.set(n.id, here);
    }
    const placed = live
      .filter((p) => p.workUnitId === n.id)
      .map((p) => assets.find((a) => a.id === p.assetId))
      .filter((a): a is Asset => !!a);
    return {
      ...n,
      children: n.children.map((c) => walk(c, here)),
      assets: placed.map((a) => ({
        id: a.id,
        tag: a.assetTag,
        name: a.assetName,
        type: typeName.get(a.assetTypeId) ?? null,
        status: a.lifecycleStatus,
        serialNumber: a.serialNumber,
        level: a.componentLevel,
        criticality: null,
        iso14224Class: null,
        openWorkOrders: 0,
      })),
    };
  };
  const root = walk(tree.data, []);
  return {
    tree: {
      tenant: { id: tree.data.id, code: tree.data.code, name: tree.data.name },
      root,
      readAt: new Date().toISOString(),
      counts: {
        workUnits: units,
        assets: assets.length,
        placed: new Set(live.map((p) => p.assetId)).size,
      },
    },
    assets,
    placements: live,
    types,
    classes,
    paths,
  };
}

const registryKey = [...mdKey, "registry"] as const;
const useRegistry = () =>
  useQuery({ queryKey: registryKey, queryFn: getRegistry, staleTime: 60_000 });

function useMdMutation<I, O>(fn: (i: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: mdKey }),
  });
}

/**
 * Register an asset and, when a work unit is given, place it there from today: primary when the unit has no
 * primary asset yet, secondary otherwise (a work unit holds one primary asset).
 */
const useCreateAsset = () =>
  useMdMutation(
    async ({
      workUnitId,
      role,
      ...input
    }: AssetInput & { workUnitId?: string; role?: "primary" | "secondary" }) => {
      const asset = await send<Asset>("post", "/assets", input);
      if (workUnitId)
        await send("post", "/asset-placements", {
          assetId: asset.id,
          workUnitId,
          placementRole: role ?? "primary",
          validFrom: new Date().toISOString().slice(0, 10),
        });
      return asset;
    },
  );
const useUpdateAsset = () =>
  useMdMutation(({ id, reason, ...patch }: Partial<AssetInput> & { id: string; reason: string }) =>
    send<Asset>("put", `/assets/${id}`, patch, reason),
  );
/** Move an asset to another work unit: the current placement closes, a new primary one opens today. */
const useMoveAsset = () =>
  useMdMutation(
    ({
      assetId,
      workUnitId,
      role,
      reason,
    }: {
      assetId: string;
      workUnitId: string;
      role: "primary" | "secondary";
      reason: string;
    }) =>
      send(
        "post",
        "/asset-placements",
        {
          assetId,
          workUnitId,
          placementRole: role,
          validFrom: new Date().toISOString().slice(0, 10),
          replace: true,
          mode: "move",
        },
        reason,
      ),
  );

// ---- site hierarchy ------------------------------------------------------------------------------------------
type NodeLevel = "enterprise" | "site" | "area" | "work-center" | "work-unit";
type EditableLevel = Exclude<NodeLevel, "enterprise">;
type WorkCenterType = "production_line" | "process_cell" | "production_unit" | "storage_zone";
const WORK_CENTER_TYPES: WorkCenterType[] = [
  "production_line",
  "process_cell",
  "production_unit",
  "storage_zone",
];
/** Each level's endpoint and the field that points at its parent. */
const LEVEL_API: Record<EditableLevel, { path: string; parent: string }> = {
  site: { path: "/sites", parent: "enterpriseId" },
  area: { path: "/areas", parent: "siteId" },
  "work-center": { path: "/work-centers", parent: "areaId" },
  "work-unit": { path: "/work-units", parent: "workCenterId" },
};
/** The level a node's children have. */
const CHILD_LEVEL: Partial<Record<NodeLevel, EditableLevel>> = {
  enterprise: "site",
  site: "area",
  area: "work-center",
  "work-center": "work-unit",
};
type NodeInput = { code: string; name: string; type?: WorkCenterType; timezone?: string };
type NodeRecord = NodeInput & { id: string };
type Impact = {
  name: string;
  descendantCount: number;
  blockers: { type: string; label: string }[];
};

async function getNode(level: EditableLevel, id: string): Promise<NodeRecord> {
  const { data } = await http.get<WebResponse<NodeRecord>>(`${API}${LEVEL_API[level].path}/${id}`);
  if (data.data == null) throw new Error(data.error ?? "node unavailable");
  return data.data;
}
const useNode = (level: EditableLevel | null, id: string | null) =>
  useQuery({
    queryKey: [...mdKey, "node", level, id],
    queryFn: () => getNode(level!, id!),
    enabled: !!level && !!id,
  });
const useCreateNode = () =>
  useMdMutation(
    ({ level, parentId, ...input }: NodeInput & { level: EditableLevel; parentId: string }) =>
      send<NodeRecord>("post", LEVEL_API[level].path, {
        ...input,
        [LEVEL_API[level].parent]: parentId,
      }),
  );
const useUpdateNode = () =>
  useMdMutation(
    ({
      level,
      id,
      reason,
      ...input
    }: Partial<NodeInput> & { level: EditableLevel; id: string; reason: string }) =>
      send<NodeRecord>("put", `${LEVEL_API[level].path}/${id}`, input, reason),
  );
async function getImpact(kind: EditableLevel, id: string): Promise<Impact> {
  const { data } = await http.get<WebResponse<Impact>>(`${API}/site-hierarchy/impact`, {
    params: { kind, id },
  });
  if (data.data == null) throw new Error(data.error ?? "impact unavailable");
  return data.data;
}
const useImpact = (kind: EditableLevel | null, id: string | null) =>
  useQuery({
    queryKey: [...mdKey, "impact", kind, id],
    queryFn: () => getImpact(kind!, id!),
    enabled: !!kind && !!id,
  });
const useDeactivateNode = () =>
  useMdMutation(({ kind, id, reason }: { kind: EditableLevel; id: string; reason: string }) =>
    send("post", "/site-hierarchy/deactivate", { kind, id }, reason),
  );

export {
  CHILD_LEVEL,
  WORK_CENTER_TYPES,
  useCreateNode,
  useDeactivateNode,
  useImpact,
  useNode,
  useUpdateNode,
};
export type { EditableLevel, NodeInput, NodeLevel, WorkCenterType };
// ---- asset classes and types ---------------------------------------------------------------------------------
type ClassInput = { code: string; name: string; parentClassId: string };
type TypeInput = {
  assetClassId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
};
const useSaveClass = () =>
  useMdMutation(({ id, reason, ...input }: ClassInput & { id?: string; reason?: string }) =>
    id
      ? send<AssetClass>("put", `/asset-classes/${id}`, input, reason)
      : send<AssetClass>("post", "/asset-classes", input),
  );
const useSaveType = () =>
  useMdMutation(({ id, reason, ...input }: TypeInput & { id?: string; reason?: string }) =>
    id
      ? send<AssetType>("put", `/asset-types/${id}`, input, reason)
      : send<AssetType>("post", "/asset-types", { ...input, attributes: {} }),
  );
/** A class or type stops from today (never deleted: assets that used it keep their history). */
const useRetire = () =>
  useMdMutation(
    ({ kind, id, reason }: { kind: "asset-classes" | "asset-types"; id: string; reason: string }) =>
      send("post", `/${kind}/${id}/deactivate`, {}, reason),
  );

export { useRetire, useSaveClass, useSaveType };
export type { ClassInput, TypeInput };
// ---- people --------------------------------------------------------------------------------------------------
type Person = {
  id: string;
  code: string;
  name: string;
  username: string;
  craft: string;
  skills: string[];
  siteId: string;
  shift: string;
  hourlyRate: string | null;
  phone: string;
  validFrom: string;
  validTo: string | null;
};
type PersonInput = Omit<Person, "id" | "validFrom" | "validTo" | "hourlyRate"> & {
  hourlyRate: number | null;
};
const CRAFTS = [
  "mekanik",
  "elektrik",
  "packing_engineering",
  "process",
  "utility",
  "lain",
] as const;
const usePeople = () =>
  useQuery({
    queryKey: [...mdKey, "people"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      return (await all<Person>("/people")).filter((x) => !x.validTo || x.validTo > today);
    },
  });
const useSavePerson = () =>
  useMdMutation(({ id, reason, ...input }: PersonInput & { id?: string; reason?: string }) =>
    id
      ? send<Person>("put", `/people/${id}`, input, reason)
      : send<Person>("post", "/people", input),
  );
const useRetirePerson = () =>
  useMdMutation(({ id, reason }: { id: string; reason: string }) =>
    send("post", `/people/${id}/deactivate`, {}, reason),
  );

export { CRAFTS, usePeople, useRetirePerson, useSavePerson };
export type { Person, PersonInput };
// ---- crews ---------------------------------------------------------------------------------------------------
type Crew = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  shift: string;
  leaderId: string;
  memberIds: string[];
  validFrom: string;
  validTo: string | null;
};
type CrewInput = Omit<Crew, "id" | "validFrom" | "validTo">;
const useCrews = () =>
  useQuery({
    queryKey: [...mdKey, "crews"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      return (await all<Crew>("/crews")).filter((x) => !x.validTo || x.validTo > today);
    },
  });
const useSaveCrew = () =>
  useMdMutation(({ id, reason, ...input }: CrewInput & { id?: string; reason?: string }) =>
    id ? send<Crew>("put", `/crews/${id}`, input, reason) : send<Crew>("post", "/crews", input),
  );
const useRetireCrew = () =>
  useMdMutation(({ id, reason }: { id: string; reason: string }) =>
    send("post", `/crews/${id}/deactivate`, {}, reason),
  );

export { useCrews, useRetireCrew, useSaveCrew };
export type { Crew, CrewInput };
// ---- MRO catalogue: items (with valuation), stores, bins, failure codes ------------------------------------------
type Item = {
  id: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  critical: boolean;
  rotable: boolean;
  minQty: string;
  maxQty: string | null;
  leadTimeDays: number | null;
  unitCost: string | null;
  batchTracked: boolean;
  erpCode: string;
  validFrom: string;
  validTo: string | null;
};
type ItemInput = {
  code: string;
  name: string;
  category: string;
  uom: string;
  critical: boolean;
  rotable: boolean;
  minQty: number;
  maxQty: number | null;
  leadTimeDays: number | null;
  batchTracked: boolean;
  erpCode: string;
  unitCost?: number | null;
};
type ItemCost = {
  id: string;
  itemId: string;
  source: "receipt" | "manual";
  oldCost: string | null;
  newCost: string;
  price: string | null;
  quantity: string | null;
  onHand: string | null;
  reference: string;
  reason: string;
  byName: string;
  at: string;
};
type MdStore = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  workUnitId: string;
  validTo: string | null;
};
type MdBin = { id: string; storeId: string; code: string; tag: string; validTo: string | null };
type FailureCode = {
  id: string;
  iso14224Class: string;
  kind: "mode" | "mechanism" | "cause";
  code: string;
  labelId: string;
  labelEn: string;
  custom: boolean;
  validTo: string | null;
};

const live = <T extends { validTo: string | null }>(rows: T[]) => {
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((r) => !r.validTo || r.validTo > today);
};
const useItems = () =>
  useQuery({
    queryKey: [...mdKey, "items"],
    queryFn: async () => live(await all<Item>("/items")),
    staleTime: 30_000,
  });
const useItemCosts = (id: string | null) =>
  useQuery({
    queryKey: [...mdKey, "item-costs", id],
    queryFn: async () => {
      const { data } = await http.get<WebResponse<ItemCost[]>>(`${API}/items/${id}/costs`);
      return data.data ?? [];
    },
    enabled: !!id,
  });
const useStoresBins = () =>
  useQuery({
    queryKey: [...mdKey, "stores"],
    queryFn: async () => {
      const [stores, bins] = await Promise.all([all<MdStore>("/stores"), all<MdBin>("/bins")]);
      return { stores: live(stores), bins: live(bins) };
    },
    staleTime: 30_000,
  });
const useFailureCodes = () =>
  useQuery({
    queryKey: [...mdKey, "failure-codes"],
    queryFn: async () => live(await all<FailureCode>("/failure-codes")),
    staleTime: 60_000,
  });

const useSaveItem = () =>
  useMdMutation(({ id, reason, ...input }: ItemInput & { id?: string; reason?: string }) =>
    id ? send<Item>("put", `/items/${id}`, input, reason) : send<Item>("post", "/items", input),
  );
/** A revaluation: a new unit cost by hand, always with a reason (receipts arrive from Maintenance). */
const useRevalue = () =>
  useMdMutation(
    ({
      id,
      newCost,
      reason,
      byName,
    }: {
      id: string;
      newCost: number;
      reason: string;
      byName: string;
    }) => send("post", `/items/${id}/costs`, { source: "manual", newCost, reason, byName }, reason),
  );
const useSaveStore = () =>
  useMdMutation(
    ({
      id,
      reason,
      ...input
    }: {
      id?: string;
      reason?: string;
      code: string;
      name: string;
      siteId: string;
    }) =>
      id
        ? send<MdStore>("put", `/stores/${id}`, input, reason)
        : send<MdStore>("post", "/stores", input),
  );
const useSaveBin = () =>
  useMdMutation(
    ({
      id,
      reason,
      ...input
    }: {
      id?: string;
      reason?: string;
      storeId: string;
      code: string;
      tag: string;
    }) =>
      id ? send<MdBin>("put", `/bins/${id}`, input, reason) : send<MdBin>("post", "/bins", input),
  );
const useSaveFailureCode = () =>
  useMdMutation(
    ({
      id,
      reason,
      ...input
    }: {
      id?: string;
      reason?: string;
      iso14224Class: string;
      kind: FailureCode["kind"];
      code: string;
      labelId: string;
      labelEn: string;
      custom: boolean;
    }) =>
      id
        ? send<FailureCode>("put", `/failure-codes/${id}`, input, reason)
        : send<FailureCode>("post", "/failure-codes", input),
  );
/** Retire a catalogue record (never deleted: stock and work orders keep pointing at it). */
const useRetireRecord = () =>
  useMdMutation(
    ({
      kind,
      id,
      reason,
    }: {
      kind: "items" | "stores" | "bins" | "failure-codes";
      id: string;
      reason: string;
    }) => send("post", `/${kind}/${id}/deactivate`, {}, reason),
  );

export {
  useFailureCodes,
  useItemCosts,
  useItems,
  useRetireRecord,
  useRevalue,
  useSaveBin,
  useSaveFailureCode,
  useSaveItem,
  useSaveStore,
  useStoresBins,
};
export type { FailureCode, Item, ItemCost, ItemInput, MdBin, MdStore };
export {
  COMPONENT_LEVELS,
  LIFECYCLES,
  getRegistry,
  useCreateAsset,
  useMoveAsset,
  useRegistry,
  useUpdateAsset,
};
export type {
  Asset,
  AssetClass,
  AssetInput,
  AssetType,
  ComponentLevel,
  Lifecycle,
  Placement,
  Registry,
};
