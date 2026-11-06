// K-28 (closed 2026-10-28): a machine stop's minutes that fall inside a break
// count as PLANNED downtime; the minutes outside keep the stop's own category
// (unplanned until a reason is set). ASSET_STATE_LOG is never split or
// rewritten — the split happens only here, in the calculation
// (01-planning § Product rule — a break is a plan, not downtime, P-06).
//
// Source of the break rules: dx-production-planning
// `apps/api/src/module/mes/breaktime/breaktime-rules.ts` (resolve + sort).
// Keep the copies in step.
//
// TheAvailability walk itself (PBT = POT − planned downtime, APT = PBT −
// unplanned) stays F-07 / F-07.1 and lives in the machine-state branch of
// `kpi-results-rules.resultsFor`, which still waits on ASSET_STATE_LOG (B5).
// This module is that branch's input: break hours in, minutes by category out.

import type { PlanningShiftBreakRow } from "@molca/contract-client";

/** The break hours one shift instance uses (PLN-008 §4): the rows valid at that instance's start — the work unit's own rows for the shift if it has any, else the site default rows. An override replaces the default as a whole. */
export function breaksInForceAt(
  rows: PlanningShiftBreakRow[],
  instanceStartIso: string,
  enterpriseShiftId: string,
  workUnitId: string | null,
): PlanningShiftBreakRow[] {
  const inForce = rows.filter(
    (r) =>
      r.effectiveFrom <= instanceStartIso &&
      (r.effectiveTo === null || instanceStartIso < r.effectiveTo),
  );
  const own = inForce.filter(
    (r) =>
      r.enterpriseShiftId === enterpriseShiftId &&
      workUnitId !== null &&
      r.workUnitId === workUnitId,
  );
  if (own.length > 0) return own;
  return inForce.filter((r) => r.enterpriseShiftId === enterpriseShiftId && r.workUnitId === null);
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The UTC offset (minutes) of `timezone` at that instant, from Intl's own tz data. */
function offsetMinutes(at: Date, timezone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** A site-local wall clock (minutes over the instance's local date) as a UTC instant. Two passes settle the offset across DST changes. */
function wallClockToUtc(localDate: string, minutes: number, timezone: string): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const naive = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, minutes);
  const first = offsetMinutes(new Date(naive), timezone);
  const second = offsetMinutes(new Date(naive - first * 60_000), timezone);
  return new Date(naive - second * 60_000);
}

/** One break window as a UTC interval on the instance's local date; a break after midnight runs into the next day. */
function breakInterval(
  row: PlanningShiftBreakRow,
  localDate: string,
  timezone: string,
): { from: number; to: number } {
  const start = minutesOf(row.startTime);
  const end = minutesOf(row.endTime);
  const from = wallClockToUtc(localDate, start, timezone).getTime();
  const to =
    end <= start
      ? wallClockToUtc(nextDay(localDate), end, timezone).getTime()
      : wallClockToUtc(localDate, end, timezone).getTime();
  return { from, to };
}

function nextDay(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The minutes of one machine stop ([stopStart, stopEnd)) by category for one
 * shift instance: minutes inside a break in force at the instance's start are
 * planned (K-28), and the minutes OUTSIDE keep the stop's own category —
 * \`outsideCategory\` is the reason's classification ("planned" for planned
 * maintenance / reserved outage, "unplanned" until a reason is set), so a
 * planned stop outside any break stays planned (F-07.1; review fix). The stop
 * row itself is read-only — nothing here rewrites the log.
 */
export function stopMinutesByCategory(
  stopStartIso: string,
  stopEndIso: string,
  rows: PlanningShiftBreakRow[],
  instance: { startDatetime: string; enterpriseShiftId: string },
  workUnitId: string | null,
  timezone: string,
  /**
   * The stop's own category for its minutes outside any break. REQUIRED (round-2
   * review): a caller that forgets it must not silently get the old all-unplanned
   * behaviour.
   */
  outsideCategory: "planned" | "unplanned",
): { plannedMinutes: number; unplannedMinutes: number } {
  const stopFrom = Date.parse(stopStartIso);
  const stopTo = Date.parse(stopEndIso);
  const total = Math.max(0, stopTo - stopFrom);
  const breaks = breaksInForceAt(
    rows,
    instance.startDatetime,
    instance.enterpriseShiftId,
    workUnitId,
  );
  // The break windows sit on the shift instance's local business date.
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instance.startDatetime));
  const startMs = Date.parse(instance.startDatetime);
  let planned = 0;
  for (const row of breaks) {
    let { from, to } = breakInterval(row, localDate, timezone);
    // A break that falls before the shift's start belongs to the next day —
    // an early-hours break of a midnight-crossing shift (PLN-008 rule 6).
    if (to <= startMs) ({ from, to } = breakInterval(row, nextDay(localDate), timezone));
    planned += Math.max(0, Math.min(stopTo, to) - Math.max(stopFrom, from));
  }
  planned = Math.min(planned, total);
  const outside = total - planned;
  // K-28 only moves the inside-break minutes to planned; the outside minutes
  // keep the stop's own category, whatever it is.
  if (outsideCategory === "planned") {
    return { plannedMinutes: (planned + outside) / 60_000, unplannedMinutes: 0 };
  }
  return { plannedMinutes: planned / 60_000, unplannedMinutes: outside / 60_000 };
}
