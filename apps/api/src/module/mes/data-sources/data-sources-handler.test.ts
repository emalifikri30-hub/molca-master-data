import { describe, expect, it } from "vite-plus/test";

import { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import { createDataSourcesHandler } from "./data-sources-handler.js";
import { DataSourcesService } from "./data-sources-service.js";
import { DataSourcesStore } from "./data-sources-store.js";
import { SitesStore } from "../sites/sites-store.js";

// PRD-003 US-FND-DSR-001 rule 16 (PO 2026-10-02) over HTTP: the real service
// and in-memory stores behind the route, so validation and refusals are the
// ones the screen gets.
function makeApp() {
  const dataSourcesStore = new DataSourcesStore();
  const svc = new DataSourcesService({
    dataSourcesStore,
    assetTagsStore: new AssetTagsStore(),
    sitesStore: new SitesStore(),
  });
  return { app: createDataSourcesHandler({ dataSourcesService: svc }), dataSourcesStore };
}

const JSON_HEADERS = { "content-type": "application/json" };

async function createSource(app: ReturnType<typeof makeApp>["app"]): Promise<string> {
  const res = await app.request("/", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      siteId: "site-1",
      name: "Line 3 PLC",
      protocol: "opcua",
      namespaceUri: "urn:molca:JKT1",
      connectionConfig: { endpoint: "opc.tcp://10.0.0.5:4840", password: "s3cret" },
      validFrom: "2026-10-02",
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()).data.id;
}

function patch(app: ReturnType<typeof makeApp>["app"], id: string, body: unknown) {
  return app.request(`/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

describe("PATCH /data-sources/:id (DSR-001 rule 16)", () => {
  it("edits the endpoint in place; the response shows it, never the password (AC-22, AC-6)", async () => {
    const { app, dataSourcesStore } = makeApp();
    const id = await createSource(app);
    const res = await patch(app, id, {
      connectionConfig: { endpoint: "opc.tcp://10.0.0.9:4840", password: "" },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe(id);
    expect(data.connectionConfig).toEqual({
      endpoint: "opc.tcp://10.0.0.9:4840",
      password: "••••••",
    });
    expect((await dataSourcesStore.get(id))?.connectionConfig.password).toBe("s3cret");
  });

  it("refuses a protocol change (AC-24)", async () => {
    const { app } = makeApp();
    const id = await createSource(app);
    const res = await patch(app, id, { protocol: "mqtt" });
    expect(res.status).toBe(409);
  });

  it("refuses an edit that leaves a generated OPC UA source without a namespace (rule 7)", async () => {
    const { app } = makeApp();
    const id = await createSource(app);
    const res = await patch(app, id, { namespaceUri: "" });
    expect(res.status).toBe(400);
  });

  it("refuses a namespace that is neither a URI nor a number (DSR-001 AC-8b)", async () => {
    const { app } = makeApp();
    const id = await createSource(app);
    for (const namespaceUri of ["abc", "-1"]) {
      const res = await patch(app, id, { namespaceUri });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("URI or a whole number");
    }
  });

  it("accepts a namespace number typed as the gateway shows it (DSR-001 AC-8b)", async () => {
    const { app } = makeApp();
    const id = await createSource(app);
    const res = await patch(app, id, { namespaceUri: "2" });
    expect(res.status).toBe(200);
  });
});
