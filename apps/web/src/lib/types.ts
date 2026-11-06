// Shapes mirrored from the BFF / MAM API responses.

type Me = {
  sub: string;
  preferredUsername: string;
  email: string;
};

type PageMeta = {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

// MAM WebResponse envelope.
type WebResponse<T> = {
  data: T | null;
  meta?: PageMeta;
  error: string | null;
};

type Lifecycle =
  | "planned"
  | "installed"
  | "operational"
  | "under_maintenance"
  | "idle"
  | "decommissioned";

// GET /api/v1/me/access — permission codes and the tenant's licence (visible-but-locked screens).
type Access = {
  tenantId: string;
  userId: string;
  userName: string;
  roles?: string[];
  permissions: string[];
  licence: {
    modules: string[];
    billing: "current" | "grace" | "degraded" | "suspended";
    limits: Record<string, number>;
    expiresAt: string;
    termEnd: string;
  } | null;
};

// GET /api/v1/assets/tree — the platform hierarchy with the assets placed on each work unit.
type AssetNode = {
  id: string;
  tag: string;
  name: string;
  type: string | null;
  status: Lifecycle;
  serialNumber: string;
  level: string;
  criticality: "A" | "B" | "C" | null;
  iso14224Class: string | null;
  openWorkOrders: number;
  /** an open work order says the machine is stopped */
  stopped?: boolean;
};

type HierarchyNode = {
  id: string;
  code: string;
  name: string;
  level: "tenant" | "enterprise" | "site" | "area" | "work-center" | "work-unit";
  active: boolean;
  children: HierarchyNode[];
  assets: AssetNode[];
};

type AssetTree = {
  tenant: { id: string; code: string; name: string };
  root: HierarchyNode;
  readAt: string;
  counts: { workUnits: number; assets: number; placed: number };
};

// GET /api/v1/assets/:id — the master-data asset with what MAM keeps about it.
type MdAsset = {
  id: string;
  assetTag: string;
  assetName: string;
  assetTypeId: string | null;
  serialNumber: string;
  parentAssetId: string | null;
  componentLevel: string;
  lifecycleStatus: Lifecycle;
  commissioningDate: string;
  attributes: Record<string, string>;
};

type AssetProfile = {
  id: string;
  assetId: string;
  iso14224Class: string | null;
  safetyScore: number | null;
  productionScore: number | null;
  costScore: number | null;
  criticality: "A" | "B" | "C" | null;
  criticalityOverride: boolean;
  criticalityReason: string;
  costCenter: string | null;
  erpAssetId: string | null;
  updatedAt: string;
  updatedBy: string;
  strategy?: { id: string; en: string } | null;
};

type MeterReading = {
  id: string;
  value: string;
  readAt: string;
  readBy: string;
  note: string;
  correctsId: string | null;
};
type Meter = {
  id: string;
  kind: string;
  unit: string;
  source: string;
  lastValue: string | null;
  lastReadAt: string | null;
  readings?: MeterReading[];
};
type Component = {
  id: string;
  level: string;
  code: string;
  name: string;
  iso14224Item: string | null;
};
type PlacementChange = {
  id: string;
  kind: string;
  workUnitId: string;
  reason: string;
  changedAt: string;
};

type AssetDetail = {
  asset: MdAsset;
  profile: AssetProfile | null;
  meters: Meter[];
  components: Component[];
  placementChanges: PlacementChange[];
};

type ProfileInput = {
  iso14224Class?: string | null;
  safetyScore?: number | null;
  productionScore?: number | null;
  costScore?: number | null;
  costCenter?: string | null;
  override?: { criticality: "A" | "B" | "C"; reason: string } | null;
};

type FailureCode = {
  id: string;
  iso14224Class: string;
  kind: "mode" | "mechanism" | "cause";
  code: string;
  labelId: string;
  labelEn: string;
  custom: boolean;
};

export type {
  Access,
  AssetDetail,
  AssetNode,
  AssetProfile,
  AssetTree,
  Component,
  FailureCode,
  HierarchyNode,
  Lifecycle,
  MdAsset,
  Me,
  Meter,
  MeterReading,
  PageMeta,
  PlacementChange,
  ProfileInput,
  WebResponse,
};
