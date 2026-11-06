import { describe, expect, it } from "vite-plus/test";

import { scopeHint } from "./audit-scope.js";

describe("scopeHint (F-14 §9.1 scope snapshot)", () => {
  it("a hierarchy record is its own level", () => {
    expect(scopeHint("WORK_CENTER", { id: "wc-1", areaId: "area-1" })).toEqual({
      level: "work_center",
      id: "wc-1",
    });
    expect(scopeHint("SITE", { id: "site-1", enterpriseId: "ent-1" })).toEqual({
      level: "site",
      id: "site-1",
    });
  });

  it("another record resolves to the deepest level it points at", () => {
    expect(scopeHint("ASSET_PLACEMENT", { id: "pl", workUnitId: "wu-1" })).toEqual({
      level: "work_unit",
      id: "wu-1",
    });
    expect(scopeHint("EQUIPMENT_FLOW", { id: "f", workCenterId: "wc-1" })).toEqual({
      level: "work_center",
      id: "wc-1",
    });
    expect(scopeHint("DATA_SOURCE", { id: "ds", siteId: "site-1" })).toEqual({
      level: "site",
      id: "site-1",
    });
  });

  it("a record with no place in the hierarchy is tenant scope", () => {
    expect(scopeHint("PRODUCT", { id: "p", code: "A5RB" })).toBeNull();
    expect(scopeHint("ASSET_TAGS", { id: "t", workUnitId: "" })).toBeNull();
  });
});
