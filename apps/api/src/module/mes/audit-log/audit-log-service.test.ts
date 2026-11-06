import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { AuditLogService } from "./audit-log-service.js";
import { AuditLogStore } from "./audit-log-store.js";

import type { CreateAuditLog } from "./audit-log.js";

const rina = {
  actorType: "user" as const,
  actorSubjectId: "rina@molca.id",
  actorDisplayName: "Rina",
};
const base = {
  entityCode: "X",
  previousVersionEntityId: null,
  effectiveFrom: null,
  effectiveTo: null,
  changes: [],
  importBatchId: null,
  siteId: null,
};

describe("AuditLogService", () => {
  let service: AuditLogService;
  beforeEach(() => {
    service = new AuditLogService({ auditLogStore: new AuditLogStore() });
  });

  it("writes one row for an effective-dated edit (AUD-001 AC-1)", async () => {
    const row = await service.record({
      ...base,
      ...rina,
      action: "update",
      entityType: "OPERATION",
      entityId: "op-78",
      previousVersionEntityId: "op-77",
      effectiveFrom: "2026-10-01",
      effectiveTo: "2026-09-30",
      changes: [{ field: "cycleTimeValue", before: 20, after: 18 }],
      reason: "New fixture",
    });
    expect(row).toMatchObject({ domainCode: "FND", moduleCode: "WMS", source: "ui" });
  });

  it("refuses an edit without a reason and writes nothing (AC-9)", async () => {
    const input: CreateAuditLog = {
      ...base,
      ...rina,
      action: "update",
      entityType: "DOWNTIME_REASON",
      entityId: "1",
    };
    await expect(service.record(input)).rejects.toThrow(HTTPException);
    expect(await service.list({})).toHaveLength(0);
  });

  it("refuses a release or upload without a reason (AC-12, AC-13)", async () => {
    for (const action of ["release", "upload"] as const) {
      const input = {
        ...base,
        ...rina,
        action,
        entityType: "WORK_ORDER",
        entityId: "wo-1",
        domainCode: "PROD",
        moduleCode: "PLN",
      };
      await expect(service.record(input)).rejects.toThrow(HTTPException);
    }
    expect(await service.list({})).toHaveLength(0);
  });

  it("keeps another domain's own codes (AC-11)", async () => {
    const row = await service.record({
      ...base,
      ...rina,
      action: "release",
      entityType: "WORK_ORDER",
      entityId: "wo-1",
      reason: "material arrived",
      domainCode: "PROD",
      moduleCode: "PLN",
    });
    expect(await service.list({ domainCode: "PROD", moduleCode: "PLN" })).toEqual([row]);
  });

  it("masks the credentials in connection settings (AC-8)", async () => {
    const row = await service.record({
      ...base,
      ...rina,
      action: "create",
      entityType: "DATA_SOURCE",
      entityId: "ds",
      changes: [{ field: "connectionConfig", before: undefined, after: { password: "x" } }],
    });
    expect(row.changes[0].after).toEqual({ password: "••••••" });
  });

  it("logs an endpoint change in clear, credentials still masked (AC-8, PO 2026-10-02)", async () => {
    const row = await service.record({
      ...base,
      ...rina,
      action: "update",
      reason: "Gateway moved",
      entityType: "DATA_SOURCE",
      entityId: "ds",
      changes: [
        {
          field: "connectionConfig",
          before: { endpoint: "opc.tcp://10.0.0.5:4840", password: "old" },
          after: { endpoint: "opc.tcp://10.0.0.9:4840", password: "new" },
        },
      ],
    });
    expect(row.changes[0].before).toEqual({
      endpoint: "opc.tcp://10.0.0.5:4840",
      password: "••••••",
    });
    expect(row.changes[0].after).toEqual({
      endpoint: "opc.tcp://10.0.0.9:4840",
      password: "••••••",
    });
  });

  it("joins every version into one history (AUD-002 AC-2)", async () => {
    const edit = { ...base, ...rina, entityType: "PRODUCT_CYCLE_TIME", reason: "r" };
    await service.record({ ...edit, action: "create", entityId: "v1" });
    await service.record({
      ...edit,
      action: "update",
      entityId: "v2",
      previousVersionEntityId: "v1",
    });
    await service.record({
      ...edit,
      action: "update",
      entityId: "v3",
      previousVersionEntityId: "v2",
    });
    expect((await service.history("PRODUCT_CYCLE_TIME", "v3")).map((r) => r.entityId)).toEqual([
      "v3",
      "v2",
      "v1",
    ]);
  });

  it("refuses a search longer than 366 days (AUD-003)", async () => {
    await expect(service.list({ from: "2025-01-01", to: "2026-10-03" })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("records a download with the file's row count and the token's actor (AUD-004)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await service.record({
      ...base,
      ...rina,
      action: "create",
      entityType: "SITE",
      entityId: "s1",
    });
    await service.record({ ...base, ...rina, action: "create", entityType: "BOM", entityId: "b1" });
    const rows = await service.download(
      { from: today, to: today, modules: ["SIT"] },
      "audit-log.csv",
      { subjectId: "sub-9", displayName: "Budi" },
    );
    expect(rows.map((r) => r.entityId)).toEqual(["s1"]);
    const downloads = await service.list({ from: today, to: today, action: "download" });
    expect(downloads).toEqual([
      expect.objectContaining({
        entityType: "AUDIT_LOG",
        moduleCode: "AUD",
        actorSubjectId: "sub-9",
        downloadRowCount: 1,
      }),
    ]);
  });
});
