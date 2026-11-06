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
async function send<T>(method: "post" | "put", path: string, body: unknown): Promise<T> {
  const { data } = await http[method]<WebResponse<T>>(`${API}${path}`, body);
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
};
type AssetClass = { id: string; code: string; name: string; parentId?: string | null };
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
  const [{ data: tree }, assets, placements, types, classes] = await Promise.all([
    http.get<WebResponse<MdNode>>(`${API}/site-hierarchy/tree`),
    all<Asset>("/assets"),
    all<Placement>("/asset-placements"),
    all<AssetType>("/asset-types"),
    all<AssetClass>("/asset-classes"),
  ]);
  if (!tree.data) throw new Error(tree.error ?? "hierarchy unavailable");
  const live = placements.filter((p) => !p.validTo);
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
  useMdMutation(({ id, ...patch }: Partial<AssetInput> & { id: string }) =>
    send<Asset>("put", `/assets/${id}`, patch),
  );
/** Move an asset to another work unit: the current placement closes, a new primary one opens today. */
const useMoveAsset = () =>
  useMdMutation(
    ({
      assetId,
      workUnitId,
      role,
    }: {
      assetId: string;
      workUnitId: string;
      role: "primary" | "secondary";
    }) =>
      send("post", "/asset-placements", {
        assetId,
        workUnitId,
        placementRole: role,
        validFrom: new Date().toISOString().slice(0, 10),
        replace: true,
        mode: "move",
      }),
  );

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
