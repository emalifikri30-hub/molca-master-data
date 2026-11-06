import { describe, expect, it } from "vite-plus/test";

import { buildAuditRows } from "./audit-rows.js";

import type { AuditActor, AuditContext, CapturedWrite } from "./audit-context.js";

const PERSON: AuditActor = {
  type: "user",
  subjectId: "sub-123",
  displayName: "Ani",
  source: "ui",
};
const JOB: AuditActor = {
  type: "service",
  subjectId: "shift-instance-generator",
  displayName: "Shift instance generator",
  source: "system",
};

function context(writes: Array<Omit<CapturedWrite, "actor"> & { actor?: AuditActor }>) {
  const ctx: AuditContext = {
    actor: PERSON,
    reason: "line 3 retooled",
    writes: writes.map((w) => ({ ...w, actor: w.actor ?? PERSON })),
    actions: new Map(),
  };
  return ctx;
}

describe("buildAuditRows", () => {
  it("writes one create row with every field and the actor from the token", () => {
    const rows = buildAuditRows(
      context([
        {
          table: "site",
          kind: "insert",
          before: null,
          after: {
            id: "s1",
            code: "MJK",
            name: "Mojokerto",
            validFrom: "2026-10-03",
            validTo: null,
          },
        },
      ]),
      "tx-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "create",
      entityType: "SITE",
      entityId: "s1",
      entityCode: "MJK",
      effectiveFrom: "2026-10-03",
      actorType: "user",
      actorSubjectId: "sub-123",
      actorDisplayName: "Ani",
      source: "ui",
      transactionId: "tx-1",
      siteId: "s1",
    });
    expect(rows[0].changes).toEqual([
      { field: "code", before: null, after: "MJK" },
      { field: "name", before: null, after: "Mojokerto" },
    ]);
  });

  it("writes one update row for a close-and-open of one record (F-14 §9.2)", () => {
    const old = {
      id: "d1",
      productId: "p1",
      minWeight: 10,
      validFrom: "2026-01-01",
      validTo: null,
    };
    const rows = buildAuditRows(
      context([
        {
          table: "product_detail",
          kind: "update",
          before: old,
          after: { ...old, validTo: "2026-10-03" },
        },
        {
          table: "product_detail",
          kind: "insert",
          before: null,
          after: {
            id: "d2",
            productId: "p1",
            minWeight: 12,
            validFrom: "2026-10-03",
            validTo: null,
          },
        },
      ]),
      "tx",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "update",
      entityType: "PRODUCT_MEASUREMENT",
      entityId: "d2",
      previousVersionEntityId: "d1",
      effectiveFrom: "2026-10-03",
      effectiveTo: "2026-10-03",
      changes: [{ field: "minWeight", before: 10, after: 12 }],
      reason: "line 3 retooled",
    });
  });

  it("pairs versions by their key, not by order", () => {
    const close = (id: string, assetId: string) => ({
      table: "asset_placement",
      kind: "update" as const,
      before: { id, assetId, workUnitId: "wu-a", validTo: null },
      after: { id, assetId, workUnitId: "wu-a", validTo: "2026-10-03" },
    });
    const rows = buildAuditRows(
      context([
        close("pl-1", "asset-1"),
        close("pl-2", "asset-2"),
        {
          table: "asset_placement",
          kind: "insert",
          before: null,
          after: { id: "pl-3", assetId: "asset-2", workUnitId: "wu-b", validTo: null },
        },
      ]),
      "tx",
    );
    // asset-2 moved (one update); asset-1 was only taken off (one deactivate).
    expect(rows.map((r) => [r.action, r.entityId, r.previousVersionEntityId])).toEqual([
      ["deactivate", "pl-1", null],
      ["update", "pl-3", "pl-2"],
    ]);
  });

  it("reads deactivate and reactivate from valid_to or deleted_at", () => {
    const reason = { id: "r1", code: "JAM", name: "Jam", deletedAt: null };
    const rows = buildAuditRows(
      context([
        {
          table: "downtime_reason",
          kind: "update",
          before: reason,
          after: { ...reason, deletedAt: "2026-10-03T01:00:00Z" },
        },
        {
          table: "work_unit",
          kind: "update",
          before: { id: "wu", code: "S01", validTo: "2026-09-01" },
          after: { id: "wu", code: "S01", validTo: null },
        },
      ]),
      "tx",
    );
    expect(rows.map((r) => [r.action, r.effectiveTo])).toEqual([
      ["deactivate", "2026-10-03"],
      ["reactivate", null],
    ]);
  });

  it("records nothing for a write that changed no business field", () => {
    const row = { id: "a1", code: "X", updatedAt: "t1" };
    const rows = buildAuditRows(
      context([{ table: "area", kind: "update", before: row, after: { ...row, updatedAt: "t2" } }]),
      "tx",
    );
    expect(rows).toEqual([]);
  });

  it("uses a declared business action instead of update", () => {
    const ctx = context([
      {
        table: "routing",
        kind: "update",
        before: { id: "rt", version: 2, status: "draft" },
        after: { id: "rt", version: 2, status: "released" },
      },
    ]);
    ctx.actions.set("ROUTING", "release");
    const rows = buildAuditRows(ctx, "tx");
    expect(rows[0]).toMatchObject({ action: "release", entityCode: "v2" });
  });

  it("folds BOM line writes into one change on the BOM's row", () => {
    const rows = buildAuditRows(
      context([
        {
          table: "bom",
          kind: "update",
          before: { id: "bom-1", version: 1, baseQty: 1 },
          after: { id: "bom-1", version: 1, baseQty: 2 },
        },
        {
          table: "bom_line",
          kind: "delete",
          before: { id: "l1", bomId: "bom-1", qtyPerUnit: 1 },
          after: null,
        },
        {
          table: "bom_line",
          kind: "insert",
          before: null,
          after: { id: "l2", bomId: "bom-1", qtyPerUnit: 3 },
        },
      ]),
      "tx",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].changes).toEqual([
      { field: "baseQty", before: 1, after: 2 },
      { field: "lines", before: [{ qtyPerUnit: 1 }], after: [{ qtyPerUnit: 3 }] },
    ]);
  });

  it("gives a parent with no row of its own an update row for its children", () => {
    const rows = buildAuditRows(
      context([
        {
          table: "operation_check",
          kind: "insert",
          before: null,
          after: { id: "c1", stepId: "step-9", routingId: "rt", checkName: "Seal" },
        },
      ]),
      "tx",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        action: "update",
        entityType: "OPERATION",
        entityId: "step-9",
        changes: [{ field: "checks", before: [], after: [{ routingId: "rt", checkName: "Seal" }] }],
      }),
    ]);
  });

  it("attributes a job's writes to the job, with no reason", () => {
    const rows = buildAuditRows(
      context([
        {
          table: "shift_instance",
          kind: "insert",
          before: null,
          after: { id: "si-1", siteId: "s1", businessDate: "2026-10-03" },
          actor: JOB,
        },
      ]),
      "tx",
    );
    expect(rows[0]).toMatchObject({
      actorType: "service",
      source: "system",
      reason: "",
      entityCode: "2026-10-03",
    });
  });

  it("ignores tables that aren't audited and rows created then removed in one save", () => {
    const rows = buildAuditRows(
      context([
        { table: "audit_log", kind: "insert", before: null, after: { id: "x" } },
        { table: "equipment_flow", kind: "insert", before: null, after: { id: "f1" } },
        { table: "equipment_flow", kind: "delete", before: { id: "f1" }, after: null },
      ]),
      "tx",
    );
    expect(rows).toEqual([]);
  });

  it("lets a draft edit through without a reason, but not a release", () => {
    const ctx = context([
      {
        table: "routing",
        kind: "update",
        before: { id: "rt", status: "draft", enforceSequence: false },
        after: { id: "rt", status: "draft", enforceSequence: true },
      },
    ]);
    ctx.draftEdit = true;
    expect(buildAuditRows(ctx, "tx")[0]).toMatchObject({ action: "update", reasonOptional: true });
    ctx.actions.set("ROUTING", "release");
    expect(buildAuditRows(ctx, "tx")[0].reasonOptional).toBeUndefined();
  });

  it("needs a reason on every row of a release, not only the released entity's (AUD-001 rule 5)", () => {
    const ctx = context([
      {
        table: "operation",
        kind: "update",
        before: { id: "op1", stepId: "s1", routingId: "rt", cycleTimeValue: 20 },
        after: { id: "op1", stepId: "s1", routingId: "rt", cycleTimeValue: 18 },
      },
    ]);
    ctx.draftEdit = true;
    ctx.actions.set("ROUTING", "release");
    const [row] = buildAuditRows(ctx, "tx");
    expect(row.entityType).toBe("OPERATION");
    expect(row.reasonOptional).toBeUndefined();
  });
});
