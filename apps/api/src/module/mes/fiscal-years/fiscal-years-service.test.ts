import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { resolveBusinessDate } from "./fiscal-quarters.js";
import { FiscalYearsService } from "./fiscal-years-service.js";
import { FiscalYearsStore } from "./fiscal-years-store.js";
import { SitesStore } from "../sites/sites-store.js";

import type { TShiftsService } from "../shifts/shifts-service.js";
import type { ShiftInstance } from "../shifts/shifts.js";

const inFuture = "2099-01-01";

async function refusalOf(fn: () => unknown): Promise<Record<string, unknown>> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return JSON.parse(err.message.slice("REFUSAL:".length));
    throw err;
  }
  throw new Error("expected a refusal");
}

function shifts(closedDecember: boolean): TShiftsService {
  const instances: Array<ShiftInstance> = closedDecember
    ? Array.from({ length: 31 }, (_, i) => ({
        id: `si-${i}`,
        siteShiftId: "ss-1",
        siteId: "site-1",
        enterpriseShiftId: "es-1",
        businessDate: `2026-12-${String(i + 1).padStart(2, "0")}`,
        startDatetime: "",
        endDatetime: "",
        status: "closed",
      }))
    : [];
  return { listInstances: () => instances } as unknown as TShiftsService;
}

const shorter = {
  enterpriseId: "ent-1",
  label: "FY2026",
  calendarBasis: "monthly" as const,
  startMonth: 1,
  endMonth: 11,
  startDate: "2026-01-01",
  endDate: "2026-11-30",
};

describe("FiscalYearsService", () => {
  let service: FiscalYearsService;
  beforeEach(() => {
    service = new FiscalYearsService({
      fiscalYearsStore: new FiscalYearsStore(),
      shiftsService: shifts(false),
      sitesStore: new SitesStore(),
    });
  });

  it("ends the old version and opens a new one (FYR-002 AC-1)", async () => {
    const next = await service.amend("fy-1", { ...shorter, effectiveDate: inFuture });
    expect((await service.versions()).find((f) => f.id === "fy-1")?.validTo).toBe(inFuture);
    expect(next).toMatchObject({
      validFrom: inFuture,
      previousVersionId: "fy-1",
      lineageId: "fy-1",
    });
  });

  it("closes a version that starts after the effective date at its own validFrom", async () => {
    const future = await service.declare({
      ...shorter,
      enterpriseId: "ent-1",
      label: "FY2100",
      startDate: "2100-01-01",
      endDate: "2100-11-30",
    });
    const next = await service.amend(future.id, {
      ...shorter,
      enterpriseId: "ent-1",
      label: "FY2100",
      startDate: "2100-01-01",
      endDate: "2100-11-30",
      effectiveDate: inFuture,
    });
    const closed = (await service.versions()).find((f) => f.id === future.id);
    expect(closed?.validFrom).toBe("2100-01-01");
    expect(closed?.validTo).toBe("2100-01-01");
    expect(next).toMatchObject({ validFrom: inFuture, previousVersionId: future.id });
  });

  it("refuses when closed periods would move (AC-2)", async () => {
    service = new FiscalYearsService({
      fiscalYearsStore: new FiscalYearsStore(),
      shiftsService: shifts(true),
      sitesStore: new SitesStore(),
    });
    expect(
      await refusalOf(() => service.amend("fy-1", { ...shorter, effectiveDate: inFuture })),
    ).toEqual({
      code: "amend",
      refusal: {
        kind: "closed_period",
        count: 31,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      },
    });
  });

  it("refuses a past effective date (AC-3)", async () => {
    expect(
      await refusalOf(() => service.amend("fy-1", { ...shorter, effectiveDate: "2000-01-01" })),
    ).toMatchObject({
      refusal: { kind: "past_date" },
    });
  });

  it("refuses a gap before the next declared year (AC-4)", async () => {
    await service.declare({
      ...shorter,
      enterpriseId: "ent-1",
      label: "FY2027",
      endMonth: 12,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    expect(
      await refusalOf(() => service.amend("fy-1", { ...shorter, effectiveDate: inFuture })),
    ).toMatchObject({
      refusal: { kind: "gap", startDate: "2026-12-01", endDate: "2026-12-31" },
    });
  });

  it("treats a mode change as a new declaration (AC-5)", async () => {
    const weekly = {
      enterpriseId: "ent-1",
      label: "FY2026",
      calendarBasis: "weekly_iso" as const,
      periodPattern: "4-5-4" as const,
      startDate: "2026-01-05",
      endDate: "2027-01-03",
      effectiveDate: inFuture,
    };
    expect(await refusalOf(() => service.amend("fy-1", weekly))).toMatchObject({
      refusal: { kind: "mode_change" },
    });
  });

  it("refuses overlapping and duplicate years (FYR-001 AC-7, rule 5)", async () => {
    expect(await refusalOf(() => service.declare({ ...shorter, label: "X" }))).toMatchObject({
      code: "overlap",
    });
    expect(
      await refusalOf(() =>
        service.declare({
          ...shorter,
          enterpriseId: "ent-1",
          label: "FY2026",
          startDate: "2030-01-01",
          endDate: "2030-11-30",
        }),
      ),
    ).toMatchObject({ code: "label_taken" });
  });

  it("resolves with the version in effect on the date (FYR-003 AC-1, AC-8)", async () => {
    await service.amend("fy-1", { ...shorter, effectiveDate: inFuture });
    expect(await service.resolve("2026-08-14")).toMatchObject({
      kind: "declared",
      label: "FY2026",
      quarter: 3,
    });
    expect(resolveBusinessDate("2025-11-02", await service.versions())).toEqual({
      kind: "not_declared",
    });
  });

  it("checks labels and overlaps within one enterprise only (UX-SIT-6)", async () => {
    // FY2026 of ent-1 covers 2026; another enterprise may declare its own FY2026.
    const other = await service.declare({
      enterpriseId: "ent-2",
      label: "FY2026",
      calendarBasis: "monthly",
      startMonth: 1,
      endMonth: 12,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(other.enterpriseId).toBe("ent-2");
    expect((await service.current("ent-1")).map((fy) => fy.id)).toEqual(["fy-1"]);
    expect((await service.current("ent-2")).map((fy) => fy.id)).toEqual([other.id]);
  });
});
