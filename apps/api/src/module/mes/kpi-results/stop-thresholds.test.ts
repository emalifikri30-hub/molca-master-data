import { describe, expect, it } from "vite-plus/test";

import {
  bucketStall,
  checkStopThresholdSave,
  DEFAULT_STOP_THRESHOLDS,
  INVALID_STOP_THRESHOLDS_MESSAGE,
  resolveStopThresholds,
  thresholdValues,
} from "./stop-thresholds.js";

import type { StopThresholdValue } from "./stop-thresholds.js";

const lineC = { workUnitId: "wu-s03", workCenterId: "wc-line-c", siteId: "site-jkt1" };

describe("PRD-003 KPI-006 stall buckets (global defaults 60 s / 300 s)", () => {
  it("AC-7 (small stop): a 90 s stall is a small_stop", () => {
    expect(bucketStall(90, DEFAULT_STOP_THRESHOLDS)).toBe("small_stop");
  });

  it("AC-8 (real downtime): an 18-minute stall is real downtime", () => {
    expect(bucketStall(18 * 60, DEFAULT_STOP_THRESHOLDS)).toBe("downtime");
  });

  it("AC-10 (below minimum stop): a 40 s stall creates no event", () => {
    expect(bucketStall(40, DEFAULT_STOP_THRESHOLDS)).toBe("none");
  });

  it("edge case: exactly at either threshold is a small_stop", () => {
    expect(bucketStall(60, DEFAULT_STOP_THRESHOLDS)).toBe("small_stop");
    expect(bucketStall(300, DEFAULT_STOP_THRESHOLDS)).toBe("small_stop");
    expect(bucketStall(301, DEFAULT_STOP_THRESHOLDS)).toBe("downtime");
  });

  it("with nothing set at any level, the global defaults apply, from 'default'", () => {
    expect(resolveStopThresholds([], lineC, "2026-10-01")).toEqual({
      minStopSeconds: { value: 60, from: "default" },
      smallStopMaxSeconds: { value: 300, from: "default" },
    });
  });
});

describe("PRD-003 KPI-006 AC-11 (work unit override)", () => {
  it("work center sets small_stop_max 600, work unit overrides only min_stop 30 → 45 s and 400 s are both small stops", () => {
    const values: Array<StopThresholdValue> = [
      {
        key: "small_stop_max_seconds",
        level: "work_center",
        scopeId: "wc-line-c",
        value: 600,
        validFrom: "2026-01-01",
      },
      {
        key: "min_stop_seconds",
        level: "work_unit",
        scopeId: "wu-s03",
        value: 30,
        validFrom: "2026-01-01",
      },
    ];
    const resolved = resolveStopThresholds(values, lineC, "2026-10-01");
    expect(resolved).toEqual({
      minStopSeconds: { value: 30, from: "work_unit" },
      smallStopMaxSeconds: { value: 600, from: "work_center" },
    });
    expect(bucketStall(45, thresholdValues(resolved))).toBe("small_stop");
    expect(bucketStall(400, thresholdValues(resolved))).toBe("small_stop");
  });

  it("a site value applies where the work unit and work center set none", () => {
    const values: Array<StopThresholdValue> = [
      {
        key: "min_stop_seconds",
        level: "site",
        scopeId: "site-jkt1",
        value: 90,
        validFrom: "2026-01-01",
      },
    ];
    expect(resolveStopThresholds(values, lineC, "2026-10-01").minStopSeconds).toEqual({
      value: 90,
      from: "site",
    });
  });
});

describe("PRD-003 KPI-006 AC-12 (effective-dated)", () => {
  it("a change to 240 s from 2026-10-02 leaves the 2026-10-01 shift on 300 s", () => {
    const values: Array<StopThresholdValue> = [
      {
        key: "small_stop_max_seconds",
        level: "work_center",
        scopeId: "wc-line-c",
        value: 300,
        validFrom: "2026-01-01",
      },
      {
        key: "small_stop_max_seconds",
        level: "work_center",
        scopeId: "wc-line-c",
        value: 240,
        validFrom: "2026-10-02",
      },
    ];
    expect(resolveStopThresholds(values, lineC, "2026-10-01").smallStopMaxSeconds.value).toBe(300);
    expect(resolveStopThresholds(values, lineC, "2026-10-02").smallStopMaxSeconds.value).toBe(240);
    expect(resolveStopThresholds(values, lineC, "2026-10-15").smallStopMaxSeconds.value).toBe(240);
  });
});

describe("PRD-003 CFG-001 stop threshold save check", () => {
  const workCenterScope = { workCenterId: "wc-line-c", siteId: "site-jkt1" };

  it("accepts a pair with 0 < min < small-stop limit", () => {
    expect(
      checkStopThresholdSave(
        [],
        {
          key: "small_stop_max_seconds",
          level: "work_center",
          scopeId: "wc-line-c",
          value: 120,
          validFrom: "2026-10-02",
        },
        workCenterScope,
      ),
    ).toEqual({ ok: true });
  });

  it("refuses a small-stop limit at or below the inherited minimum stop, with the CFG-001 text", () => {
    const result = checkStopThresholdSave(
      [],
      {
        key: "small_stop_max_seconds",
        level: "work_center",
        scopeId: "wc-line-c",
        value: 60,
        validFrom: "2026-10-02",
      },
      workCenterScope,
    );
    expect(result).toEqual({
      ok: false,
      code: "invalid_pair",
      message: "Minimum stop must be more than 0 and less than the small-stop limit.",
    });
    expect(INVALID_STOP_THRESHOLDS_MESSAGE).toBe(
      "Minimum stop must be more than 0 and less than the small-stop limit.",
    );
  });

  it("refuses a minimum stop of 0", () => {
    expect(
      checkStopThresholdSave(
        [],
        {
          key: "min_stop_seconds",
          level: "work_unit",
          scopeId: "wu-s03",
          value: 0,
          validFrom: "2026-10-02",
        },
        lineC,
      ).ok,
    ).toBe(false);
  });

  it("refuses a value that is not whole seconds", () => {
    expect(
      checkStopThresholdSave(
        [],
        {
          key: "min_stop_seconds",
          level: "work_unit",
          scopeId: "wu-s03",
          value: 30.5,
          validFrom: "2026-10-02",
        },
        lineC,
      ),
    ).toEqual({ ok: false, code: "not_whole_seconds" });
  });
});
