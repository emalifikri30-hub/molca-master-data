import { describe, expect, it } from "vite-plus/test";

import { ShiftsStore } from "./shifts-store.js";

import type { EnterpriseShift } from "./shifts.js";

/** A persisted store whose repository returns `rows` in the id order `list` uses. */
function persistedStore(rows: EnterpriseShift[]): ShiftsStore {
  const store = new ShiftsStore();
  const byId = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  (store as unknown as { enterpriseRepo: unknown }).enterpriseRepo = {
    list: async () => byId,
  };
  return store;
}

describe("enterprise shift order (Site tab: newest at the bottom)", () => {
  it("keeps the in-memory seed in insertion order", async () => {
    const rows = await new ShiftsStore().listEnterprise();
    expect(rows.map((r) => r.id)).toEqual(["es-1", "es-2", "es-3"]);
  });

  it("returns persisted rows oldest first by creation time, not by id", async () => {
    const store = persistedStore([
      {
        id: "es-1",
        enterpriseId: "ent-1",
        label: "Shift 1",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "es-4",
        enterpriseId: "ent-1",
        label: "Shift 4",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: "2026-03-01T00:00:00Z",
      },
      {
        id: "es-2",
        enterpriseId: "ent-1",
        label: "Shift 2",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: "2026-01-02T00:00:00Z",
      },
      {
        id: "es-3",
        enterpriseId: "ent-1",
        label: "Shift 3",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    ]);
    const rows = await store.listEnterprise();
    expect(rows.map((r) => r.label)).toEqual(["Shift 1", "Shift 2", "Shift 3", "Shift 4"]);
  });

  it("breaks creation-time ties by id", async () => {
    const same = "2026-02-01T00:00:00Z";
    const store = persistedStore([
      {
        id: "es-b",
        enterpriseId: "ent-1",
        label: "B",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: same,
      },
      {
        id: "es-a",
        enterpriseId: "ent-1",
        label: "A",
        validFrom: "2026-01-01",
        validTo: null,
        createdAt: same,
      },
    ]);
    const rows = await store.listEnterprise();
    expect(rows.map((r) => r.id)).toEqual(["es-a", "es-b"]);
  });
});
