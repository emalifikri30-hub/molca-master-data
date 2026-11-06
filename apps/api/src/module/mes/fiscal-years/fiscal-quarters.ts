// Pure fiscal-quarter maths from PRD-003 03-yearly-quarterly-declaration.md
// (US-FND-FYR-001 §4 and US-FND-FYR-003 §4). Nothing here is stored — the
// quarter is always worked out at read time from the declaration (FYR-003
// rule 4). All dates are ISO `YYYY-MM-DD` strings, computed in UTC so no
// timezone offset can move a day.

import type { PERIOD_PATTERN_VALUES } from "../../../shared/database/schema/value-lists.js";
type PeriodPattern = (typeof PERIOD_PATTERN_VALUES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_PER_QUARTER = 13;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** ISO weeks start on Monday (FYR-001 AC-8). */
export function isMonday(date: string): boolean {
  return new Date(toUtc(date)).getUTCDay() === 1;
}

/** Monthly mode: `quarter(month) = floor(((month − start_month + 12) mod 12) / 3) + 1`. */
export function monthlyQuarter(month: number, startMonth: number): number {
  return Math.floor(((month - startMonth + 12) % 12) / 3) + 1;
}

/** Weekly mode: `week_index(date) = floor((date − start_date) / 7 days)`. */
export function weekIndex(date: string, startDate: string): number {
  return Math.floor(daysBetween(startDate, date) / 7);
}

/** Weekly mode: `quarter = min(4, floor(week_index / 13) + 1)` — a 53rd week stays in Q4. */
export function weeklyQuarter(date: string, startDate: string): number {
  return Math.min(4, Math.floor(weekIndex(date, startDate) / WEEKS_PER_QUARTER) + 1);
}

/** The year's length in weeks (the form must show 53 when it is 53). */
export function weekCount(startDate: string, endDate: string): number {
  return Math.ceil((daysBetween(startDate, endDate) + 1) / 7);
}

/** Weeks per period inside a 13-week quarter, per `period_pattern`. */
export function patternWeeks(pattern: PeriodPattern): [number, number, number] {
  const [a, b, c] = pattern.split("-").map(Number);
  return [a, b, c];
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface QuarterRange extends DateRange {
  quarter: 1 | 2 | 3 | 4;
}

export interface PeriodRange extends DateRange {
  weeks: number;
}

type QuarterInput =
  | { calendarBasis: "monthly"; startMonth: number; startDate: string; endDate: string }
  | { calendarBasis: "weekly_iso"; startDate: string; endDate: string };

function lastDayOfMonth(year: number, month: number): string {
  return fromUtc(Date.UTC(year, month, 0));
}

/**
 * Q1–Q4 date ranges of one fiscal year.
 * - Monthly: each quarter is three calendar months counted from the start
 *   month; the last quarter is cut at the year's end date.
 * - Weekly: each quarter is 13 weeks from the start date, whatever the
 *   pattern; Q4 runs to the end date, so a 53rd week falls in Q4.
 * A quarter that would start after the end date is left out.
 */
export function quarterRanges(fy: QuarterInput): Array<QuarterRange> {
  const out: Array<QuarterRange> = [];
  for (let q = 1 as QuarterRange["quarter"]; q <= 4; q = (q + 1) as QuarterRange["quarter"]) {
    let startDate: string;
    let endDate: string;
    if (fy.calendarBasis === "monthly") {
      const [y, m] = fy.startDate.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 1 + (q - 1) * 3, 1));
      startDate = fromUtc(first.getTime());
      endDate = lastDayOfMonth(first.getUTCFullYear(), first.getUTCMonth() + 3);
    } else {
      startDate = addDays(fy.startDate, (q - 1) * WEEKS_PER_QUARTER * 7);
      endDate = addDays(fy.startDate, q * WEEKS_PER_QUARTER * 7 - 1);
    }
    if (startDate > fy.endDate) break;
    if (q === 4 || endDate > fy.endDate) endDate = fy.endDate;
    out.push({ quarter: q, startDate, endDate });
  }
  return out;
}

/**
 * Weekly mode: the three periods inside the 13 weeks that start at
 * `quarterStart`, split per `period_pattern` (4-5-4 → 4, 5, 4 weeks, …).
 */
export function periodRanges(quarterStart: string, pattern: PeriodPattern): Array<PeriodRange> {
  let cursor = quarterStart;
  return patternWeeks(pattern).map((weeks) => {
    const startDate = cursor;
    const endDate = addDays(startDate, weeks * 7 - 1);
    cursor = addDays(endDate, 1);
    return { startDate, endDate, weeks };
  });
}

/** FYR-003: what a business date resolves to. */
export type FiscalResolution =
  | { kind: "declared"; label: string; quarter: number; fiscalYearId: string }
  | { kind: "not_declared" }
  | { kind: "anomaly"; labels: Array<string> };

interface ResolvableYear {
  id: string;
  label: string;
  calendarBasis: "monthly" | "weekly_iso";
  startMonth?: number;
  startDate: string;
  endDate: string;
  validFrom: string;
  validTo: string | null;
}

/**
 * FYR-003 §4: the version in effect on `businessDate` (`valid_from ≤ d` and
 * `valid_to` open or `≥ d`) whose range covers it. None → "not declared",
 * never guessed (rule 2). More than one → an anomaly (rule 3), never a pick.
 */
export function resolveBusinessDate(
  businessDate: string,
  years: ReadonlyArray<ResolvableYear>,
): FiscalResolution {
  const matches = years.filter(
    (fy) =>
      fy.validFrom <= businessDate &&
      (fy.validTo === null || fy.validTo > businessDate) &&
      fy.startDate <= businessDate &&
      businessDate <= fy.endDate,
  );
  if (matches.length === 0) return { kind: "not_declared" };
  if (matches.length > 1) return { kind: "anomaly", labels: matches.map((m) => m.label) };
  const fy = matches[0];
  const quarter =
    fy.calendarBasis === "monthly"
      ? monthlyQuarter(Number(businessDate.slice(5, 7)), fy.startMonth ?? 1)
      : weeklyQuarter(businessDate, fy.startDate);
  return { kind: "declared", label: fy.label, quarter, fiscalYearId: fy.id };
}

/** "FY2026 · Q3" (FYR-003 §3). */
export function periodLabel(resolution: FiscalResolution): string | null {
  return resolution.kind === "declared" ? `${resolution.label} · Q${resolution.quarter}` : null;
}
