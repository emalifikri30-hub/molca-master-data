import { describe, expect, it } from "vite-plus/test";

import { dateRange, instanceWindow, zonedToUtc } from "./shift-instances.js";

describe("shift instances (PRD-003 SHF-002)", () => {
  it("saves a site's local start as UTC", () => {
    expect(zonedToUtc("2026-08-07", "07:00", "Asia/Jakarta")).toBe("2026-08-07T00:00:00.000Z");
  });

  it("ends a midnight-crossing shift on the next day at 07:00 (AC-3, boundary form)", () => {
    expect(instanceWindow("2026-08-07", "23:00", "07:00", "Asia/Jakarta")).toEqual({
      startDatetime: "2026-08-07T16:00:00.000Z",
      endDatetime: "2026-08-08T00:00:00.000Z",
    });
  });

  it("ends Shift 1 at the exclusive 15:00 boundary — POT 480 min (SHF-002 example)", () => {
    const w = instanceWindow("2026-08-07", "07:00", "15:00", "Asia/Jakarta");
    expect(w.endDatetime).toBe("2026-08-07T08:00:00.000Z");
    expect((Date.parse(w.endDatetime) - Date.parse(w.startDatetime)) / 60_000).toBe(480);
  });

  it("lists every date in a range", () => {
    expect(dateRange("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });
});
