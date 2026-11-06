import { describe, expect, it } from "vite-plus/test";

import { sensitive } from "./change-rules.js";

describe("sensitive Master Data changes", () => {
  it("holds retiring an asset, not other edits", () => {
    expect(sensitive("PUT", "/api/v1/assets/a1", { lifecycleStatus: "decommissioned" })).toEqual({
      entity: "asset",
      entityId: "a1",
      action: "decommission",
    });
    expect(sensitive("PUT", "/api/v1/assets/a1", { assetName: "x" })).toBeNull();
  });
  it("holds deactivating catalogue records and hierarchy nodes", () => {
    expect(sensitive("POST", "/api/v1/items/i1/deactivate", {})).toMatchObject({
      action: "deactivate",
      entity: "items",
    });
    expect(
      sensitive("POST", "/api/v1/site-hierarchy/deactivate", { kind: "work-units", id: "w1" }),
    ).toMatchObject({ entityId: "w1" });
    expect(sensitive("POST", "/api/v1/people/p1/deactivate", {})).toBeNull();
  });
  it("holds a manual revaluation, not a receipt cost from Maintenance", () => {
    expect(sensitive("POST", "/api/v1/items/i1/costs", { source: "manual" })).toMatchObject({
      action: "revalue",
    });
    expect(sensitive("POST", "/api/v1/items/i1/costs", { source: "receipt" })).toBeNull();
  });
});
