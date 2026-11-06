import { describe, expect, it } from "vite-plus/test";

import { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import { DataSourcesStore } from "./data-sources-store.js";
import { SitesStore } from "../sites/sites-store.js";
import { DataSourcesService } from "./data-sources-service.js";

import type { HTTPException } from "hono/http-exception";

const input = {
  siteId: "site-1",
  name: "Line 3 Gateway",
  protocol: "opcua" as const,
  nodeNaming: "generated" as const,
  namespaceUri: "ns-u-1",
  topicRoot: "",
  connectionConfig: { endpoint: "opc.tcp://10.0.0.5:4840", password: "s3cret" },
  validFrom: "2026-10-01",
};

function service() {
  const dataSourcesStore = new DataSourcesStore();
  const assetTagsStore = new AssetTagsStore();
  return {
    svc: new DataSourcesService({ dataSourcesStore, assetTagsStore, sitesStore: new SitesStore() }),
    dataSourcesStore,
    assetTagsStore,
  };
}

async function refusalOf(run: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await run();
  } catch (e) {
    return JSON.parse((e as HTTPException).message.replace(/^REFUSAL:/, ""));
  }
  throw new Error("expected a refusal");
}

// PRD-003 US-FND-DSR-001 AC-6: credentials are not displayed in any form.
describe("DataSourcesService never returns credentials (DSR-001 AC-6)", () => {
  it("masks the credentials on create, list and deactivate; the endpoint stays readable", async () => {
    const { svc } = service();
    const created = await svc.create(input);
    const listed = (await svc.list()).find((r) => r.id === created.id);
    const closed = await svc.deactivate(created.id, "2026-10-02");
    for (const row of [created, listed, closed]) {
      expect(row?.connectionConfig).toEqual({
        endpoint: "opc.tcp://10.0.0.5:4840",
        password: "••••••",
      });
      expect(JSON.stringify(row)).not.toContain("s3cret");
    }
  });
});

// PRD-003 US-FND-DSR-001 rule 16 (PO 2026-10-02): a data source is edited in place.
describe("DataSourcesService.update (DSR-001 rule 16)", () => {
  it("changes the endpoint in place — same id, no address warning (AC-22)", async () => {
    const { svc, dataSourcesStore, assetTagsStore } = service();
    const created = await svc.create(input);
    const tags = (await assetTagsStore.paginate({ limit: 100, offset: 0 })).items;
    for (const tag of tags) await assetTagsStore.update(tag.id, { dataSourceId: created.id });
    const updated = await svc.update(created.id, {
      connectionConfig: { endpoint: "opc.tcp://10.0.0.9:4840", password: "" },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.connectionConfig.endpoint).toBe("opc.tcp://10.0.0.9:4840");
    expect((await dataSourcesStore.get(created.id))?.connectionConfig.password).toBe("s3cret");
  });

  it("keeps a credential left empty, replaces a typed one (AC-23)", async () => {
    const { svc, dataSourcesStore } = service();
    const created = await svc.create(input);
    await svc.update(created.id, {
      name: "Line 3 PLC",
      connectionConfig: { endpoint: "opc.tcp://10.0.0.5:4840", password: "" },
    });
    expect((await dataSourcesStore.get(created.id))?.connectionConfig.password).toBe("s3cret");
    // The masked placeholder sent back by a form also keeps it.
    await svc.update(created.id, {
      connectionConfig: { endpoint: "opc.tcp://10.0.0.5:4840", password: "••••••" },
    });
    expect((await dataSourcesStore.get(created.id))?.connectionConfig.password).toBe("s3cret");
    await svc.update(created.id, {
      connectionConfig: { endpoint: "opc.tcp://10.0.0.5:4840", password: "n3w" },
    });
    expect((await dataSourcesStore.get(created.id))?.connectionConfig.password).toBe("n3w");
  });

  it("refuses a protocol change — another protocol is a new data source (AC-24)", async () => {
    const { svc } = service();
    const created = await svc.create(input);
    expect(await refusalOf(() => svc.update(created.id, { protocol: "mqtt" }))).toEqual({
      code: "protocol_locked",
    });
  });

  it("asks before a naming change moves live addresses, with the count (rule 14, AC-15)", async () => {
    const { svc, assetTagsStore } = service();
    const created = await svc.create(input);
    const active = (await assetTagsStore.paginate({ limit: 100, offset: 0 })).items.filter(
      (t) => t.validTo === null,
    );
    for (const tag of active) await assetTagsStore.update(tag.id, { dataSourceId: created.id });
    expect(active.length).toBeGreaterThan(0);
    expect(
      await refusalOf(() => svc.update(created.id, { namespaceUri: "urn:molca:JKT1" })),
    ).toEqual({ code: "address_change", count: active.length });
    const confirmed = await svc.update(created.id, {
      namespaceUri: "urn:molca:JKT1",
      confirmAddressChange: true,
    });
    expect(confirmed.namespaceUri).toBe("urn:molca:JKT1");
  });

  it("changes a naming setting with no tags without asking", async () => {
    const { svc } = service();
    const created = await svc.create(input);
    const updated = await svc.update(created.id, { nodeNaming: "manual", namespaceUri: "" });
    expect(updated.nodeNaming).toBe("manual");
  });

  it("gives a new generated OPC UA source the site's namespace (F-13 §9.1, item 4)", async () => {
    const { svc } = service();
    const row = await svc.create({ ...input, namespaceUri: "" });
    expect(row.namespaceUri).toBe("urn:molca:SITE_01");
  });

  it("refuses a new source without a known site (F-13 §9.1)", async () => {
    const { svc } = service();
    expect(await refusalOf(() => svc.create({ ...input, siteId: "nowhere" }))).toEqual({
      code: "site_not_found",
      siteId: "nowhere",
    });
  });
});
