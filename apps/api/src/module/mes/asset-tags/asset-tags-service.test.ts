import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AreasStore } from "../areas/areas-store.js";
import { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import { AssetsStore } from "../assets/assets-store.js";
import { DataSourcesStore } from "../data-sources/data-sources-store.js";
import { EnterpriseStore } from "../enterprise/enterprise-store.js";
import { SitesStore } from "../sites/sites-store.js";
import { WorkCentersStore } from "../work-centers/work-centers-store.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";
import { AssetTagsStore } from "./asset-tags-store.js";
import { AssetTagsService } from "./asset-tags-service.js";

import type { CreateAssetTags } from "./asset-tags.js";
import type { DataSource } from "../data-sources/data-sources.js";

// PRD-003 US-FND-DSR-001 — address naming rules 7/9/11 (PO 2026-09-28).
// Seeds: asset-1 (tag "IM-03") stands on wu-1 → SITE_01.AREA_01.WC_01.WU_01.
const genOpcua: Omit<DataSource, "id" | "validTo"> = {
  siteId: "site-1",
  name: "Line 3 Gateway",
  protocol: "opcua",
  nodeNaming: "generated",
  namespaceUri: "ns-u-1",
  topicRoot: "",
  connectionConfig: { endpoint: "opc.tcp://10.0.3.10:4840" },
  validFrom: "2024-01-01",
};
const genMqtt = (id: string): Omit<DataSource, "id" | "validTo"> => ({
  siteId: "site-1",
  name: id,
  protocol: "mqtt",
  nodeNaming: "generated",
  namespaceUri: "",
  topicRoot: "molca",
  connectionConfig: { endpoint: "mqtt://broker:1883" },
  validFrom: "2024-01-01",
});

const baseTag: CreateAssetTags = {
  assetId: "asset-1",
  dataSourceId: "ds-gen",
  tagName: "Seq_Count",
  node: "",
  kind: "cumulative_counter",
  tagRole: "total",
  rejectReasonId: "",
  downtimeReasonId: "",
  uomId: "pcs",
  countBasis: "unit",
  validFrom: "2026-01-01",
};

async function messageOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return err.message;
    throw err;
  }
  return "";
}

describe("AssetTagsService — generated addresses (DSR-001 rules 7/9/11)", () => {
  let svc: AssetTagsService;
  let assetsStore: AssetsStore;
  let placementsStore: AssetPlacementsStore;

  beforeEach(() => {
    const dataSourcesStore = new DataSourcesStore();
    dataSourcesStore.items.push(
      { ...genOpcua, id: "ds-gen", validTo: null },
      { ...genMqtt("mqtt-a"), id: "ds-mqtt-a", validTo: null },
      { ...genMqtt("mqtt-b"), id: "ds-mqtt-b", validTo: null },
      { ...genOpcua, siteId: "site-2", id: "ds-other-site", validTo: null },
    );
    assetsStore = new AssetsStore();
    placementsStore = new AssetPlacementsStore();
    svc = new AssetTagsService({
      assetTagsStore: new AssetTagsStore(),
      assetsStore,
      dataSourcesStore,
      assetPlacementsStore: placementsStore,
      workUnitsStore: new WorkUnitsStore(),
      workCentersStore: new WorkCentersStore(),
      areasStore: new AreasStore(),
      sitesStore: new SitesStore(),
      enterpriseStore: new EnterpriseStore(),
    });
  });

  it("refuses a tag on a source at another site than the machine (DSR-001 AC-17)", async () => {
    const message = await messageOf(() =>
      svc.create({ ...baseTag, dataSourceId: "ds-other-site" }),
    );
    expect(JSON.parse(message.replace(/^REFUSAL:/, ""))).toEqual({
      code: "site_mismatch",
      machine: "IM-03",
      machineSite: "SITE_01",
      sourceSite: "SITE_02",
    });
  });

  it("defaults a counter to the output side, and refuses a side on other roles (F-04 §9.7)", async () => {
    const row = await svc.create(baseTag);
    expect(row.countSide).toBe("output");
    const refused = await messageOf(() =>
      svc.create({
        ...baseTag,
        tagName: "State",
        tagRole: "machine_state",
        kind: "enum",
        countSide: "input",
      }),
    );
    expect(refused).toContain("count_side_not_applicable");
  });

  it("holds activity_signal to a value with a unit, lot_marker to a boolean (F-04 §9.7)", async () => {
    const signal = { ...baseTag, tagName: "Motor_Current", tagRole: "activity_signal" as const };
    expect(await messageOf(() => svc.create({ ...signal, kind: "boolean" }))).toContain(
      "role_kind",
    );
    expect(await messageOf(() => svc.create({ ...signal, kind: "value", uomId: "" }))).toContain(
      "role_needs_unit",
    );
    const ok = await svc.create({ ...signal, kind: "value", uomId: "amp" });
    expect(ok).toMatchObject({ tagRole: "activity_signal", countSide: "" });
    const lot = { ...baseTag, tagName: "Lot_Open", tagRole: "lot_marker" as const, uomId: "" };
    expect(await messageOf(() => svc.create({ ...lot, kind: "value" }))).toContain("role_kind");
    expect(await svc.create({ ...lot, kind: "boolean" })).toMatchObject({ tagRole: "lot_marker" });
  });

  it("saves an occurrence reject reason with its cause and no unit, basis or side (DSR-001 AC-27)", async () => {
    const row = await svc.create({
      ...baseTag,
      tagName: "Empty_Sachet",
      tagRole: "reject_reason",
      kind: "occurrence",
      rejectReasonId: "rr-empty-sachet",
      uomId: "pcs",
      countBasis: "unit",
    });
    expect(row).toMatchObject({
      kind: "occurrence",
      rejectReasonId: "rr-empty-sachet",
      uomId: "",
      countBasis: "",
      countSide: "",
    });
  });

  it("refuses occurrence on any role but reject_reason, and without a cause (DSR-001 AC-26/AC-27)", async () => {
    const onReject = await messageOf(() =>
      svc.create({ ...baseTag, tagName: "NG_Total", tagRole: "reject", kind: "occurrence" }),
    );
    expect(onReject).toContain("role_kind");
    const noCause = await messageOf(() =>
      svc.create({
        ...baseTag,
        tagName: "Empty_Sachet",
        tagRole: "reject_reason",
        kind: "occurrence",
        rejectReasonId: "",
      }),
    );
    expect(noCause).toContain("reject_reason_id");
  });

  it("refuses a measured_total tag without a unit (DSR-001 §5)", async () => {
    const weight = { ...baseTag, tagName: "Total_Weight", tagRole: "measured_total" as const };
    expect(await messageOf(() => svc.create({ ...weight, uomId: "" }))).toContain(
      "role_needs_unit",
    );
    expect(await svc.create({ ...weight, uomId: "g" })).toMatchObject({ uomId: "g" });
  });

  it("saves with an empty node on a generated source — the address is derived (rule 9 / AC-8)", async () => {
    const row = await svc.create(baseTag);
    expect(row.node).toBe("");
  });

  it("refuses a typed address on a generated source (rule 9)", async () => {
    const msg = await messageOf(() => svc.create({ ...baseTag, node: "PLC1.DB10.DBW9" }));
    expect(msg).toContain("builds addresses from location");
  });

  it("refuses an empty address on a typed source (rule 9)", async () => {
    const msg = await messageOf(() => svc.create({ ...baseTag, dataSourceId: "ds-1", node: "" }));
    expect(msg).toContain("keeps its own node names");
  });

  it("refuses a second tag that would produce the same address (AC-11)", async () => {
    // A twin machine with the same floor tag — the asset-tag uniqueness
    // scope is still open (AST-002 AC-2), so this is a legal row today.
    const twin = await assetsStore.create(
      {
        assetTag: "IM-03",
        assetName: "",
        assetTypeId: "type-1",
        serialNumber: "",
        parentAssetId: "",
        componentLevel: "equipment_unit",
        lifecycleStatus: "operational",
        commissioningDate: "",
        attributes: {},
      },
      "2026-01-01",
      null,
    );
    await placementsStore.create({
      assetId: twin.id,
      workUnitId: "wu-1",
      placementRole: "secondary",
      validFrom: "2026-01-01",
    });
    await svc.create(baseTag);
    const msg = await messageOf(() => svc.create({ ...baseTag, assetId: twin.id }));
    expect(msg).toBe("Seq_Count on IM-03 already uses this address.");
  });

  it("refuses the same MQTT topic on sources sharing broker and topic root (rule 7)", async () => {
    const twin = await assetsStore.create(
      {
        assetTag: "IM-03",
        assetName: "",
        assetTypeId: "type-1",
        serialNumber: "",
        parentAssetId: "",
        componentLevel: "equipment_unit",
        lifecycleStatus: "operational",
        commissioningDate: "",
        attributes: {},
      },
      "2026-01-01",
      null,
    );
    await placementsStore.create({
      assetId: twin.id,
      workUnitId: "wu-1",
      placementRole: "secondary",
      validFrom: "2026-01-01",
    });
    await svc.create({ ...baseTag, dataSourceId: "ds-mqtt-a" });
    const msg = await messageOf(() =>
      svc.create({ ...baseTag, dataSourceId: "ds-mqtt-b", assetId: twin.id }),
    );
    expect(msg).toContain("already uses this address");
  });

  it("end-dating a tag does not re-run the address rules", async () => {
    const row = await svc.create({ ...baseTag, dataSourceId: "ds-1", node: "PLC1.DB10.DBW9" });
    const ended = await svc.update(row.id, { validTo: "2026-09-28" });
    expect(ended.validTo).toBe("2026-09-28");
  });
});
