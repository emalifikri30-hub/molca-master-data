import { describe, expect, it } from "vite-plus/test";

import { breaksInForceAt, stopMinutesByCategory } from "./break-minutes.js";

import type { PlanningShiftBreakRow } from "@molca/contract-client";

// The spec's example data: shift 1 runs 06:00–14:00 WIB (23:00–07:00 UTC the
// day before), the lunch break 11:30–12:00 site time.
const TZ = "Asia/Jakarta";
const SHIFT = "shift-1";
const INSTANCE_START = "2026-10-20T23:00:00.000Z"; // 21 Oct 06:00 WIB
const LOCAL_DATE = "2026-10-21";

const row = (over: Partial<PlanningShiftBreakRow> = {}): PlanningShiftBreakRow => ({
  id: "brk",
  siteId: "site",
  enterpriseShiftId: SHIFT,
  workUnitId: null,
  startTime: "11:30",
  endTime: "12:00",
  label: "Lunch",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null,
  ...over,
});

/** A stop expressed in site-local time of the example day. */
const stop = (from: string, to: string) => ({
  from: `${LOCAL_DATE}T${from}:00.000+07:00`,
  to: `${LOCAL_DATE}T${to}:00.000+07:00`,
});

describe("K-28: stop minutes inside a break are planned", () => {
  it("the spec example: a stop 11:30–12:10 with lunch 11:30–12:00 → 30 planned, 10 unplanned", () => {
    const s = stop("11:30", "12:10");
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [row()],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 30, unplannedMinutes: 10 });
  });

  it("running through the break is runtime — nothing planned", () => {
    const s = stop("11:00", "11:30"); // stops right before lunch, none inside
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [row()],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 0, unplannedMinutes: 30 });
  });

  it("a stop that starts inside the break and runs past it splits at the break's end", () => {
    const s = stop("11:45", "12:30");
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [row()],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 15, unplannedMinutes: 30 });
  });

  it("a stop that starts before the break keeps its own minutes outside", () => {
    const s = stop("11:15", "11:45");
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [row()],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 15, unplannedMinutes: 15 });
  });

  it("a small stop inside a break counts as planned too", () => {
    const s = stop("11:35", "11:45");
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [row()],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 10, unplannedMinutes: 0 });
  });

  it("a work unit's own rows replace the site default as a whole (never mixed)", () => {
    const own = row({ id: "own", workUnitId: "S03", startTime: "12:00", endTime: "12:30" });
    const s = stop("11:30", "12:10");
    const r = stopMinutesByCategory(
      s.from,
      s.to,
      [row(), own],
      { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
      "S03",
      TZ,
      "unplanned",
    );
    // S03's lunch starts at 12:00, so the whole stop is its own category.
    expect(r).toEqual({ plannedMinutes: 10, unplannedMinutes: 30 });
  });

  it("a shift instance keeps the break hours that were in force at its start (PLN-Q35)", () => {
    const edited = row({
      id: "new",
      startTime: "12:15",
      endTime: "12:45",
      effectiveFrom: "2026-10-21T10:00:00.000Z", // after this instance started
    });
    const old = row({ id: "old", effectiveTo: "2026-10-21T10:00:00.000Z" });
    const s = stop("11:30", "12:10");
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [edited, old],
        { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 30, unplannedMinutes: 10 });
  });

  it("a break after midnight in a midnight-crossing shift is found on the next day", () => {
    const night = row({ enterpriseShiftId: "shift-3", startTime: "02:00", endTime: "02:30" });
    // Shift 3 starts 23:00 WIB on the 20th; its 02:00 break falls on the 21st.
    const s = { from: "2026-10-21T02:05:00+07:00", to: "2026-10-21T02:20:00+07:00" };
    expect(
      stopMinutesByCategory(
        s.from,
        s.to,
        [night],
        { startDatetime: "2026-10-20T16:00:00.000Z", enterpriseShiftId: "shift-3" },
        null,
        TZ,
        "unplanned",
      ),
    ).toEqual({ plannedMinutes: 15, unplannedMinutes: 0 });
  });
});

it("a planned stop outside any break keeps its own planned category (F-07.1)", () => {
  const s = stop("10:00", "10:30"); // no break near it
  expect(
    stopMinutesByCategory(
      s.from,
      s.to,
      [row()],
      { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
      null,
      TZ,
      "planned",
    ),
  ).toEqual({ plannedMinutes: 30, unplannedMinutes: 0 });
  // An unplanned stop in the same spot stays unplanned (the default).
  expect(
    stopMinutesByCategory(
      s.from,
      s.to,
      [row()],
      { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
      null,
      TZ,
      "unplanned",
    ),
  ).toEqual({ plannedMinutes: 0, unplannedMinutes: 30 });
});

it("a planned stop straddling the break: inside planned, outside keeps planned", () => {
  const s = stop("11:15", "11:45");
  expect(
    stopMinutesByCategory(
      s.from,
      s.to,
      [row()],
      { startDatetime: INSTANCE_START, enterpriseShiftId: SHIFT },
      null,
      TZ,
      "planned",
    ),
  ).toEqual({ plannedMinutes: 30, unplannedMinutes: 0 });
});

describe("breaksInForceAt", () => {
  it("own rows win; none → the site default; rows of another shift never", () => {
    const def = row();
    const own = row({ id: "own", workUnitId: "S03" });
    expect(breaksInForceAt([def, own], INSTANCE_START, SHIFT, "S03").map((r) => r.id)).toEqual([
      "own",
    ]);
    expect(breaksInForceAt([def, own], INSTANCE_START, SHIFT, "S04").map((r) => r.id)).toEqual([
      "brk",
    ]);
    // A row whose version closed before the instance is not in force.
    const closed = row({ id: "old", effectiveTo: "2026-06-01T00:00:00.000Z" });
    expect(breaksInForceAt([closed], INSTANCE_START, SHIFT, null)).toEqual([]);
  });
});
