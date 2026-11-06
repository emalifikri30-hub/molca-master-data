import { describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { SitesStore } from "../sites/sites-store.js";
import { ShiftsService } from "./shifts-service.js";
import { ShiftsStore } from "./shifts-store.js";

function service() {
  return new ShiftsService({
    shiftsStore: new ShiftsStore(),
    sitesStore: new SitesStore(),
  });
}

describe("shift generation (PRD-003 SHF-002)", () => {
  it("refuses a site with no declared shift hours (rule 8, AC-8)", async () => {
    let err: unknown;
    try {
      await service().generate("site-without-hours", "2026-10-05", "2026-10-06");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(422);
    expect((err as HTTPException).message).toBe(
      'REFUSAL:{"code":"no_shift_hours","siteId":"site-without-hours"}',
    );
  });

  it("creates each new shift open, even on a past date (AC-1)", async () => {
    const svc = service();
    const r = await svc.generate("site-1", "2026-09-01", "2026-09-01");
    expect(r.created).toBe(2);
    const created = (await svc.listInstances("site-1")).filter(
      (i) => i.businessDate === "2026-09-01",
    );
    expect(created.map((i) => i.status)).toEqual(["open", "open"]);
  });

  it("keeps one shift per site shift and date after the hours change (rule 6)", async () => {
    const svc = service();
    await svc.generate("site-1", "2026-12-01", "2026-12-01");
    await svc.declareSite({
      siteId: "site-1",
      enterpriseShiftId: "es-1",
      startTime: "06:00",
      endTime: "14:00",
    });
    const again = await svc.generate("site-1", "2026-12-01", "2026-12-01");
    expect(again).toMatchObject({ created: 0, duplicates: 2 });
    const shift1 = (await svc.listInstances("site-1")).filter(
      (i) => i.enterpriseShiftId === "es-1" && i.businessDate === "2026-12-01",
    );
    expect(shift1).toHaveLength(1);
  });

  it("lets two shifts touch at the boundary (SHF-001 AC-10)", async () => {
    const svc = service();
    // Seed: Shift 1 07:00–15:00, Shift 2 15:00–23:00 at site-1.
    const row = await svc.declareSite({
      siteId: "site-1",
      enterpriseShiftId: "es-3",
      startTime: "23:00",
      endTime: "07:00",
    });
    expect(row.endTime).toBe("07:00");
  });

  it("refuses the same start and end time (SHF-001 AC-11)", async () => {
    const svc = service();
    const err = await svc
      .declareSite({
        siteId: "site-1",
        enterpriseShiftId: "es-3",
        startTime: "08:00",
        endTime: "08:00",
      })
      .catch((e: unknown) => e as Error);
    expect(String((err as Error).message)).toContain('"code":"same_time"');
  });

  it("refuses hours that overlap the end of Shift 3 (SHF-001 AC-3)", async () => {
    const svc = service();
    await svc.declareSite({
      siteId: "site-1",
      enterpriseShiftId: "es-3",
      startTime: "23:00",
      endTime: "07:00",
    });
    const err = await svc
      .declareSite({
        siteId: "site-1",
        enterpriseShiftId: "es-1",
        startTime: "06:30",
        endTime: "15:00",
      })
      .catch((e: unknown) => e as Error);
    expect(String((err as Error).message)).toContain('"code":"overlap"');
  });
});

describe("enterprise shifts per enterprise (UX-SIT-6, PO 2026-10-19)", () => {
  it("lists only the asked enterprise's shifts", async () => {
    const svc = service();
    await svc.createEnterprise("ent-2", "Night");
    expect((await svc.listEnterprise("ent-2")).map((s) => s.label)).toEqual(["Night"]);
    expect((await svc.listEnterprise("ent-1")).map((s) => s.label)).toEqual([
      "Shift 1",
      "Shift 2",
      "Shift 3",
    ]);
  });

  it("refuses hours at a site for another enterprise's shift", async () => {
    const svc = service();
    const other = await svc.createEnterprise("ent-2", "Night");
    const err = await svc
      .declareSite({
        enterpriseShiftId: other.id,
        siteId: "site-1",
        startTime: "23:00",
        endTime: "07:00",
      })
      .catch((e: unknown) => e);
    expect((err as HTTPException).status).toBe(422);
    expect((err as HTTPException).message).toContain("other_enterprise");
  });
});
