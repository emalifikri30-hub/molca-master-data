// PRD-003 US-FND-SHF-002 — real shifts (SHIFT_INSTANCE, F-02 §9.3) worked out
// from a site's shift hours. Pure functions; the generator run lives in
// mock-store.ts. `production-domain` owns the real generator; this prototype
// stands in for it, creating one real shift per declared site shift on every
// date in the range (SHF-002, #100). Every date is a production date.

/** Minutes the site's timezone is ahead of UTC at `utcMs`. */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Local `date` + `time` in `timeZone` → UTC ISO timestamp (rule 2: saved in UTC). */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let utc = guess - offsetMinutes(guess, timeZone) * 60_000;
  // Second pass settles a guess that fell across a DST change.
  const again = offsetMinutes(utc, timeZone);
  utc = guess - again * 60_000;
  return new Date(utc).toISOString();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every ISO date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): Array<string> {
  const out: Array<string> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * §4: starts on the business date at the start time; ends on that date at the
 * end time, or the next day when the shift crosses midnight. Business date =
 * the date the shift starts.
 */
export function instanceWindow(
  businessDate: string,
  startTime: string,
  endTime: string,
  timeZone: string,
): { startDatetime: string; endDatetime: string } {
  const endDate = endTime < startTime ? addDays(businessDate, 1) : businessDate;
  return {
    startDatetime: zonedToUtc(businessDate, startTime, timeZone),
    endDatetime: zonedToUtc(endDate, endTime, timeZone),
  };
}
