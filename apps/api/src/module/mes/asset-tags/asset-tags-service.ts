import { refusal } from "../../../shared/errors/refusal.js";
import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { assertNoFloorTagClash } from "../asset-placements/floor-tag-clash.js";

import { generatedAddress, type AddressCodes } from "./generated-address.js";

import { COUNTED_ROLES, TAG_KINDS } from "./asset-tags.js";

import type {
  AssetTags,
  AssetTagsFilter,
  CountSide,
  CreateAssetTags,
  TagKind,
  TagRole,
  UpdateAssetTags,
} from "./asset-tags.js";
import type { AssetTagsStore } from "./asset-tags-store.js";
import type { AreasStore } from "../areas/areas-store.js";
import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { AssetsStore } from "../assets/assets-store.js";
import type { DataSource } from "../data-sources/data-sources.js";
import type { DataSourcesStore } from "../data-sources/data-sources-store.js";
import type { EnterpriseStore } from "../enterprise/enterprise-store.js";
import type { SitesStore } from "../sites/sites-store.js";
import type { WorkCentersStore } from "../work-centers/work-centers-store.js";
import type { WorkUnitsStore } from "../work-units/work-units-store.js";

type PagedAssetTagsResult = PagedResult<AssetTags>;

type TAssetTagsService = {
  getPaged: (page: number, size: number, filter: AssetTagsFilter) => Promise<PagedAssetTagsResult>;
  get: (id: string) => Promise<AssetTags>;
  create: (input: CreateAssetTags) => Promise<AssetTags>;
  update: (id: string, patch: UpdateAssetTags) => Promise<AssetTags>;
  deactivate: (id: string) => Promise<AssetTags>;
};

type AssetTagsServiceDeps = {
  assetTagsStore: AssetTagsStore;
  assetsStore: AssetsStore;
  dataSourcesStore: DataSourcesStore;
  assetPlacementsStore: AssetPlacementsStore;
  workUnitsStore: WorkUnitsStore;
  workCentersStore: WorkCentersStore;
  areasStore: AreasStore;
  sitesStore: SitesStore;
  enterpriseStore: EnterpriseStore;
};

/** F-04 §9.7: `count_side` is `output` unless set, on total/good/reject only. */
function defaultCountSide(t: { tagRole: TagRole; countSide?: CountSide | "" }): CountSide | "" {
  if (!COUNTED_ROLES.has(t.tagRole)) return t.countSide ?? "";
  return t.countSide ? t.countSide : "output";
}

/**
 * F-04 §9.7 (PO 2026-10-03, docs-molcadx#85 item 4): an `occurrence` tag
 * fires once per event with no running number. It is a reject reason only,
 * so unit, counting basis and side don't apply — cleared, never stored.
 */
function normalizeOccurrence<
  T extends { kind?: TagKind; uomId?: string; countBasis?: string; countSide?: string },
>(t: T): T {
  if (t.kind !== "occurrence") return t;
  return { ...t, uomId: "", countBasis: "", countSide: "" };
}

/** Every kind but `occurrence` — what a role other than `reject_reason` may use. */
const NON_OCCURRENCE_KINDS = TAG_KINDS.filter((k) => k !== "occurrence");

/**
 * F-04 §9.7 role rules for the roles added 2026-09-30 / 2026-10-01:
 * `activity_signal` is a `value` with a unit, `lot_marker` a `boolean`;
 * `count_side` only on total/good/reject. 2026-10-02/03: `measured_total`
 * needs a unit; `occurrence` is only a reject reason, naming its cause.
 */
function assertRoleRules(t: {
  tagRole: TagRole;
  kind: TagKind;
  uomId: string;
  countSide?: CountSide | "";
  rejectReasonId?: string;
}): void {
  // PRD-003 DSR-001 AC-26/AC-27: `occurrence` belongs to a reject reason only.
  if (t.kind === "occurrence" && t.tagRole !== "reject_reason") {
    throw refusal(422, "role_kind", { role: t.tagRole, kind: NON_OCCURRENCE_KINDS.join(" / ") });
  }
  // DSR-001 AC-27: an occurrence reject reason names its cause (`reject_reason_id`).
  if (t.kind === "occurrence" && !t.rejectReasonId) {
    throw new HTTPException(422, { message: "an occurrence reject reason needs reject_reason_id" });
  }
  // DSR-001 §5 / prd-molcadx#26 item 5: `uom_id` required for measured_total.
  if (t.tagRole === "measured_total" && !t.uomId) {
    throw refusal(422, "role_needs_unit", { role: t.tagRole });
  }
  if (t.tagRole === "activity_signal" && t.kind !== "value") {
    throw refusal(422, "role_kind", { role: t.tagRole, kind: "value" });
  }
  if (t.tagRole === "activity_signal" && !t.uomId) {
    throw refusal(422, "role_needs_unit", { role: t.tagRole });
  }
  if (t.tagRole === "lot_marker" && t.kind !== "boolean") {
    throw refusal(422, "role_kind", { role: t.tagRole, kind: "boolean" });
  }
  if (t.countSide && !COUNTED_ROLES.has(t.tagRole)) {
    throw refusal(422, "count_side_not_applicable", { role: t.tagRole });
  }
}

class AssetTagsService implements TAssetTagsService {
  private store: AssetTagsStore;
  private assetsStore: AssetsStore;
  private dataSourcesStore: DataSourcesStore;
  private assetPlacementsStore: AssetPlacementsStore;
  private workUnitsStore: WorkUnitsStore;
  private workCentersStore: WorkCentersStore;
  private areasStore: AreasStore;
  private sitesStore: SitesStore;
  private enterpriseStore: EnterpriseStore;

  constructor({
    assetTagsStore,
    assetsStore,
    dataSourcesStore,
    assetPlacementsStore,
    workUnitsStore,
    workCentersStore,
    areasStore,
    sitesStore,
    enterpriseStore,
  }: AssetTagsServiceDeps) {
    this.store = assetTagsStore;
    this.assetsStore = assetsStore;
    this.dataSourcesStore = dataSourcesStore;
    this.assetPlacementsStore = assetPlacementsStore;
    this.workUnitsStore = workUnitsStore;
    this.workCentersStore = workCentersStore;
    this.areasStore = areasStore;
    this.sitesStore = sitesStore;
    this.enterpriseStore = enterpriseStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: AssetTagsFilter,
  ): Promise<PagedAssetTagsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({
      limit,
      offset,
      assetId: filter.assetId,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<AssetTags> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-tags not found" });
    return row;
  }

  async create(input: CreateAssetTags): Promise<AssetTags> {
    input = normalizeOccurrence({ ...input, countSide: defaultCountSide(input) });
    assertRoleRules(input);
    const asset = await this.assetsStore.get(input.assetId);
    if (!asset) throw new HTTPException(404, { message: "asset not found" });
    // F-04 §9.7 (A-6a): a component cannot carry its own tag declaration —
    // its signal is declared against the parent Equipment unit.
    if (asset.componentLevel !== "equipment_unit") {
      throw new HTTPException(422, {
        message: "a tag can only be declared against an equipment-unit-level asset",
      });
    }
    // DSR-001 rule 8: a tag name is unique per machine among active tags.
    const clash = input.tagName
      ? (
          await this.store.paginate({
            limit: Number.MAX_SAFE_INTEGER,
            offset: 0,
            assetId: input.assetId,
          })
        ).items.find((r) => r.validTo === null && r.tagName === input.tagName)
      : undefined;
    if (clash) {
      throw new HTTPException(409, {
        message: `${input.tagName} already exists on this machine.`,
      });
    }
    // DSR-001 rules 7/9/11 (2026-09-28): address naming and uniqueness.
    await this.assertAddressRules(input);
    return this.store.create(input);
  }

  async update(id: string, patch: UpdateAssetTags): Promise<AssetTags> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-tags not found" });
    if (
      patch.tagRole !== undefined ||
      patch.kind !== undefined ||
      patch.uomId !== undefined ||
      patch.countSide !== undefined ||
      patch.rejectReasonId !== undefined
    ) {
      const merged = { ...row, ...patch };
      patch = { ...patch, countSide: defaultCountSide(merged) };
      if (merged.kind === "occurrence") {
        patch = { ...patch, uomId: "", countBasis: "", countSide: "" };
      }
      assertRoleRules({ ...merged, ...patch });
    }
    // A patch that touches the address decides re-runs the naming and
    // uniqueness rules against the merged row (end-dating never does).
    const addressTouched =
      patch.dataSourceId !== undefined ||
      patch.assetId !== undefined ||
      patch.tagName !== undefined ||
      patch.node !== undefined ||
      patch.workUnitId !== undefined;
    if (addressTouched) {
      await this.assertAddressRules({ ...row, ...patch }, id);
    }
    const updated = await this.store.update(id, patch);
    if (!updated) throw new HTTPException(404, { message: "asset-tags not found" });
    return updated;
  }

  /** F-00 / F-14: never hard-deleted — deactivation sets valid_to (today). */
  async deactivate(id: string): Promise<AssetTags> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "asset-tags not found" });
    if (current.validTo != null) throw refusal(422, "already_inactive", { id });
    const row = await this.store.deactivate(id, new Date().toISOString().slice(0, 10));
    if (!row) throw new HTTPException(404, { message: "asset-tags not found" });
    return row;
  }

  /** The source a tag points at (DSR-001 §5). */
  private async sourceOf(dataSourceId: string): Promise<DataSource> {
    const source = await this.dataSourcesStore.get(dataSourceId);
    if (!source) throw new HTTPException(404, { message: "data source not found" });
    return source;
  }

  /**
   * The codes of the active placement the tag's address is built from
   * (F-04 §9.7.1): the tag's own lane on a multi-lane machine, else the
   * machine's only placement. null when there is none — a multi-lane tag
   * without a work unit has no address (DSR-001 rules 12/13), never a stale one.
   */
  private async codesFor(assetId: string, ownWorkUnitId: string): Promise<AddressCodes | null> {
    const active = (
      await this.assetPlacementsStore.paginate({ limit: Number.MAX_SAFE_INTEGER, offset: 0 })
    ).items.filter((p) => p.assetId === assetId && p.validTo === null);
    const wuId =
      ownWorkUnitId !== "" && active.some((p) => p.workUnitId === ownWorkUnitId)
        ? ownWorkUnitId
        : active.length === 1
          ? active[0].workUnitId
          : "";
    if (wuId === "") return null;
    const wu = await this.workUnitsStore.get(wuId);
    const wc = wu && (await this.workCentersStore.get(wu.workCenterId));
    const area = wc && (await this.areasStore.get(wc.areaId));
    const site = area && (await this.sitesStore.get(area.siteId));
    const enterprise = site && (await this.enterpriseStore.get(site.enterpriseId));
    if (!wu || !wc || !area || !site || !enterprise) return null;
    return {
      enterprise: enterprise.code,
      site: site.code,
      area: area.code,
      workCenter: wc.code,
      workUnit: wu.code,
    };
  }

  /** The site of the machine's active placement (the tag's own lane first), or null. */
  private async placedSite(assetId: string, ownWorkUnitId: string) {
    const active = (await this.assetPlacementsStore.byAsset(assetId)).filter(
      (p) => p.validTo === null,
    );
    const wuId =
      ownWorkUnitId !== "" && active.some((p) => p.workUnitId === ownWorkUnitId)
        ? ownWorkUnitId
        : active[0]?.workUnitId;
    if (!wuId) return null;
    const wu = await this.workUnitsStore.get(wuId);
    const wc = wu && (await this.workCentersStore.get(wu.workCenterId));
    const area = wc && (await this.areasStore.get(wc.areaId));
    return (area && (await this.sitesStore.get(area.siteId))) ?? null;
  }

  /**
   * F-13 §9.1 / DSR-001 AC-17: a data source serves one site; a tag of a
   * machine placed at another site is refused (`dsr-001.error.site-mismatch`).
   * A machine with no placement has no site yet and is not refused.
   */
  private async assertSameSite(
    assetId: string,
    ownWorkUnitId: string,
    source: DataSource,
  ): Promise<void> {
    if (!source.siteId) return;
    const site = await this.placedSite(assetId, ownWorkUnitId);
    if (!site || site.id === source.siteId) return;
    const sourceSite = await this.sitesStore.get(source.siteId);
    const asset = await this.assetsStore.get(assetId);
    throw refusal(422, "site_mismatch", {
      machine: asset?.assetTag ?? assetId,
      machineSite: site.code,
      sourceSite: sourceSite?.code ?? source.siteId,
    });
  }

  /** The tag's address as the spec defines it: typed node, else the generated one. */
  private async addressOf(
    tag: {
      dataSourceId: string;
      assetId: string;
      workUnitId?: string;
      tagName?: string;
      node?: string;
    },
    source: DataSource,
  ): Promise<string> {
    if (source.nodeNaming === "manual") return tag.node === undefined ? "" : tag.node;
    const asset = await this.assetsStore.get(tag.assetId);
    return generatedAddress({
      nodeNaming: source.nodeNaming,
      protocol: source.protocol,
      namespaceUri: source.namespaceUri,
      topicRoot: source.topicRoot,
      codes: await this.codesFor(tag.assetId, tag.workUnitId ?? ""),
      assetTag: asset?.assetTag ?? "",
      tagName: tag.tagName ?? "",
    });
  }

  /**
   * DSR-001 rule 9: the address is typed only on a `manual` source and must
   * stay empty on a `generated` one (the address is derived, never stored).
   * Rules 7/11: no two active addresses may collide — across sources sharing
   * the same namespace value (OPC UA; typed spelling, so one namespace
   * spelled two ways, `urn:molca:MJK` and `2`, can hide a clash — blind spot
   * accepted PO 2026-10-06) or the broker + topic root (MQTT, empty roots
   * count as one value). Refused with the rule's own message.
   */
  private async assertAddressRules(
    input: {
      dataSourceId: string;
      assetId: string;
      workUnitId?: string;
      tagName?: string;
      node?: string;
    },
    excludeId?: string,
  ): Promise<void> {
    const source = await this.sourceOf(input.dataSourceId);
    await this.assertSameSite(input.assetId, input.workUnitId ?? "", source);
    const typedNode = (input.node ?? "").trim();
    if (source.nodeNaming === "manual" && typedNode === "") {
      throw new HTTPException(422, {
        message: "Type the address — this source keeps its own node names.",
      });
    }
    if (source.nodeNaming === "generated" && typedNode !== "") {
      throw new HTTPException(422, {
        message: "Leave the address empty — this source builds addresses from location.",
      });
    }
    const mine = await this.addressOf(input, source);
    if (mine === "") return; // no placement: declared, not read (rule 13)
    // Rule 10 / AC-10b: the floor tag is cleaned, never refused — but two
    // machines on one work unit that clean alike can't share the address path.
    const asset = await this.assetsStore.get(input.assetId);
    if (asset) {
      const lanes = (await this.assetPlacementsStore.byAsset(asset.id)).filter(
        (p) => p.validTo === null,
      );
      await assertNoFloorTagClash(
        { placements: this.assetPlacementsStore, assets: this.assetsStore },
        asset,
        lanes.map((p) => p.workUnitId),
      );
    }
    const others = (await this.store.paginate({ limit: Number.MAX_SAFE_INTEGER, offset: 0 })).items;
    for (const other of others) {
      if (other.validTo !== null || other.id === excludeId) continue;
      const otherSource = await this.dataSourcesStore.get(other.dataSourceId);
      if (!otherSource || otherSource.protocol !== source.protocol) continue;
      const related =
        source.protocol === "mqtt"
          ? (otherSource.connectionConfig.endpoint ?? "") ===
              (source.connectionConfig.endpoint ?? "") && otherSource.topicRoot === source.topicRoot
          : otherSource.namespaceUri === source.namespaceUri;
      if (!related) continue;
      if ((await this.addressOf(other, otherSource)) === mine) {
        const machine = await this.assetsStore.get(other.assetId);
        const label = machine ? machine.assetName || machine.assetTag : other.assetId;
        throw new HTTPException(409, {
          message: `${other.tagName} on ${label} already uses this address.`,
        });
      }
    }
  }
}

export { AssetTagsService };
export type { TAssetTagsService, AssetTagsServiceDeps, PagedAssetTagsResult };
