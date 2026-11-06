import { describe, expect, it } from "vite-plus/test";

import { throughputPerProduct } from "./kpi-engine.js";
import { resultsFor, routingEndStep, stepCycleSeconds } from "./kpi-results-rules.js";

import type { KpiMetric, PlanningOperation } from "./kpi-results.js";

const head = {
  aggregationLevel: "work_unit" as const,
  aggregationMethod: "sum_of_terms" as const,
  scopeId: "wu",
  scopeCode: "WU",
  shiftInstanceId: "s",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-01",
  isProvisional: true,
  computedAt: "2026-10-01T08:00:00.000Z",
};

const row = (over: Partial<PlanningOperation>): PlanningOperation => ({
  id: "r",
  workOrderId: "wo",
  stepNumber: 10,
  workUnitId: "wu",
  shiftInstanceId: "s",
  goodQty: 0,
  scrapQty: 0,
  reworkQty: 0,
  actualStart: null,
  actualEnd: null,
  ...over,
});

const pick = (results: ReturnType<typeof resultsFor>, metric: KpiMetric) =>
  results.filter((r) => r.metric === metric);

describe("KPI_RESULT per work unit and shift", () => {
  const now = new Date("2026-10-01T08:00:00.000Z");
  const rows = [
    row({
      goodQty: 950,
      scrapQty: 50,
      actualStart: "2026-10-01T00:00:00.000Z",
      actualEnd: "2026-10-01T08:00:00.000Z",
    }),
  ];
  const results = resultsFor(head, "shift", rows, now);

  it("PRF-001 AC-4: 1,000 units, 950 good, 50 scrap → Quality 95%, Scrap 5%, Rework 0%", () => {
    expect(pick(results, "quality")[0]).toMatchObject({ value: 95, status: "computed" });
    expect(pick(results, "scrap_ratio")[0]).toMatchObject({ value: 5, status: "computed" });
    expect(pick(results, "rework_ratio")[0]).toMatchObject({ value: 0, status: "computed" });
  });

  it("PRF-001 AC-5: machine-state KPIs are no_data, blocked by B5", () => {
    for (const m of ["availability", "oee", "performance", "production_process_ratio"] as const) {
      expect(pick(results, m)[0]).toMatchObject({
        status: "no_data",
        blockedBy: "B5",
        value: null,
      });
    }
  });

  it("KPI-011: throughput = PQ ÷ AOET (1,000 over 480 min)", () => {
    expect(pick(results, "throughput_rate")[0]).toMatchObject({ value: 2.1, unit: "units/min" });
  });

  it("no output is no_data, never 0%", () => {
    const empty = resultsFor(head, "shift", [], now);
    expect(pick(empty, "quality")[0]).toMatchObject({ status: "no_data", value: null });
  });
});

describe("KPI-013 empty state", () => {
  it("a planned, not-started order reads no data", () => {
    const scope = { ...head, aggregationLevel: "work_order" as const };
    const rows = [row({ stepNumber: 10 }), row({ stepNumber: 20 })];
    expect(
      pick(resultsFor(scope, "work_order", rows, new Date()), "fall_off_ratio")[0].status,
    ).toBe("no_data");
  });
});

describe("scope bindings (03-performance, Where each KPI exists)", () => {
  const rows = [row({ goodQty: 90, scrapQty: 10 })];

  it("PRD-003 KPI-009 rule 5 (PO, 2026-10-22): at site, Scrap and Rework ratio are a Molca roll-up in time", () => {
    const site = resultsFor(
      { ...head, aggregationLevel: "site" },
      "site",
      rows,
      new Date(),
      () => ({
        workUnitCode: "WU",
        uomId: "pcs",
        cycleTimeSeconds: 20,
        batchSize: 1,
      }),
    );
    expect(pick(site, "scrap_ratio")[0]).toMatchObject({
      status: "computed",
      scope: "molca_rollup",
    });
    expect(pick(site, "rework_ratio")[0]).toMatchObject({
      status: "computed",
      scope: "molca_rollup",
    });
    expect(pick(site, "quality")[0].status).toBe("computed");
  });

  it("PRF-002 AC-4: at Job Order, Quality is not calculated; Scrap, Rework, Fall-off are", () => {
    const wo = resultsFor(
      { ...head, aggregationLevel: "work_order" },
      "work_order",
      rows,
      new Date(),
    );
    expect(pick(wo, "quality")[0].status).toBe("not_at_level");
    expect(pick(wo, "scrap_ratio")[0].status).toBe("computed");
    expect(pick(wo, "fall_off_ratio")[0].status).toBe("computed");
  });

  it("Fall-off exists only per Job Order (KPI-013 AC-4)", () => {
    const shift = resultsFor(head, "shift", rows, new Date());
    expect(pick(shift, "fall_off_ratio")[0].status).toBe("not_at_level");
  });
});

describe("KPI-013 Fall-off ratio", () => {
  const scope = { ...head, aggregationLevel: "work_order" as const };

  it("AC-1 + AC-5: step 1 ran two shifts (500 + 480), step 30 has 860 good → 12.2%", () => {
    const rows = [
      row({ stepNumber: 10, goodQty: 490, scrapQty: 10 }),
      row({ stepNumber: 10, goodQty: 470, reworkQty: 10 }),
      row({ stepNumber: 20, goodQty: 900 }),
      row({ stepNumber: 30, goodQty: 860 }),
    ];
    const step30 = pick(resultsFor(scope, "work_order", rows, new Date()), "fall_off_ratio").find(
      (r) => r.stepNumber === 30,
    );
    expect(step30).toMatchObject({ value: 12.2, inputs: { pqFirstOp: 980, gqCurrentOp: 860 } });
  });

  it("AC-2: no row for the first step → no data", () => {
    expect(
      pick(resultsFor(scope, "work_order", [], new Date()), "fall_off_ratio")[0],
    ).toMatchObject({
      status: "no_data",
    });
  });

  it("AC-3: step 1 started but produced 0 → cannot compute", () => {
    const rows = [
      row({ stepNumber: 10, actualStart: "2026-10-01T00:00:00.000Z" }),
      row({ stepNumber: 20 }),
    ];
    expect(
      pick(resultsFor(scope, "work_order", rows, new Date()), "fall_off_ratio")[0].status,
    ).toBe("cannot_compute");
  });
});

describe("KPI-010 Rework ratio when rework is not tracked", () => {
  const now = new Date("2026-10-01T08:00:00.000Z");

  it("KPI-010: a row without rework tracking is no_data naming the reason, not 0%", () => {
    const results = resultsFor(
      head,
      "shift",
      [
        row({
          goodQty: 950,
          scrapQty: 50,
          reworkQty: null,
          actualStart: "2026-10-01T00:00:00.000Z",
          actualEnd: "2026-10-01T08:00:00.000Z",
        }),
      ],
      now,
    );
    expect(pick(results, "rework_ratio")[0]).toMatchObject({
      value: null,
      status: "no_data",
      reason: "rework_not_tracked",
    });
  });

  it("KPI-010: no_data for rework stays distinct from a PQ that cannot be computed", () => {
    const results = resultsFor(head, "shift", [row({ goodQty: 100, reworkQty: null })], now);
    expect(pick(results, "rework_ratio")[0].reason).toBe("rework_not_tracked");
    expect(pick(results, "scrap_ratio")[0].reason).not.toBe("rework_not_tracked");
  });

  it("KPI-010: a tracked rework of zero is still computed 0%", () => {
    const results = resultsFor(head, "shift", [row({ goodQty: 100, reworkQty: 0 })], now);
    expect(pick(results, "rework_ratio")[0]).toMatchObject({ value: 0, status: "computed" });
  });
});

describe("PRD-003 KPI-009 rule 5 / KPI-010 rule 6: area and site roll-up in time", () => {
  const area = { ...head, aggregationLevel: "area" as const };
  const now = new Date("2026-10-01T08:00:00.000Z");
  // Line A: 50 scrap, 20 rework, 930 good → PQ 1,000 at 20 s per unit.
  // Line B: 20 scrap, 5 rework, 475 good → PQ 500 at 40 s per unit.
  const rows = [
    row({ workUnitId: "A", goodQty: 930, scrapQty: 50, reworkQty: 20 }),
    row({ workUnitId: "B", goodQty: 475, scrapQty: 20, reworkQty: 5 }),
  ];
  const cycles = (cycleA: number | null, cycleB: number | null) => (op: PlanningOperation) => {
    const ct = op.workUnitId === "A" ? cycleA : cycleB;
    return { workUnitCode: op.workUnitId ?? "", uomId: "pcs", cycleTimeSeconds: ct, batchSize: 1 };
  };

  it("KPI-009 AC-5: Σ scrap time / Σ produced time = 1,800 / 40,000 = 4.5% (not an average of ratios)", () => {
    const [scrap] = pick(resultsFor(area, "area", rows, now, cycles(20, 40)), "scrap_ratio");
    expect(scrap).toMatchObject({ status: "computed", value: 4.5, scope: "molca_rollup" });
    expect(scrap.inputs).toMatchObject({ rejectSeconds: 1800, producedSeconds: 40000 });
    expect(scrap.leftOut).toEqual({ count: 0, workUnits: [] });
  });

  it("KPI-009 AC-5: the breakdown lists each work unit's scrap in its own unit, not converted", () => {
    const [scrap] = pick(resultsFor(area, "area", rows, now, cycles(20, 40)), "scrap_ratio");
    expect(scrap.breakdown).toEqual([
      { workUnitId: "A", workUnitCode: "A", uomId: "pcs", rejectQty: 50, producedQty: 1000 },
      { workUnitId: "B", workUnitCode: "B", uomId: "pcs", rejectQty: 20, producedQty: 500 },
    ]);
  });

  it("KPI-010 AC-5: Σ rework time / Σ produced time = 600 / 40,000 = 1.5%", () => {
    const [rework] = pick(resultsFor(area, "area", rows, now, cycles(20, 40)), "rework_ratio");
    expect(rework).toMatchObject({ status: "computed", value: 1.5, scope: "molca_rollup" });
  });

  it("KPI-009 AC-7: a work unit with no cycle time is left out, named and counted", () => {
    const [scrap] = pick(resultsFor(area, "area", rows, now, cycles(20, null)), "scrap_ratio");
    expect(scrap).toMatchObject({ status: "computed", value: 5 });
    expect(scrap.leftOut).toEqual({ count: 1, workUnits: [{ id: "B", code: "B" }] });
    expect(scrap.breakdown?.map((b) => b.workUnitId)).toEqual(["A"]);
  });

  it("KPI-010 AC-7: the same left-out rule applies to rework", () => {
    const [rework] = pick(resultsFor(area, "area", rows, now, cycles(20, null)), "rework_ratio");
    expect(rework).toMatchObject({ status: "computed", value: 2, leftOut: { count: 1 } });
  });

  it("every work unit left out → no data naming the cycle time, never 0%", () => {
    const [scrap] = pick(resultsFor(area, "area", rows, now, cycles(null, null)), "scrap_ratio");
    expect(scrap).toMatchObject({ status: "no_data", value: null, reason: "cycle_time_missing" });
    expect(scrap.leftOut?.count).toBe(2);
  });

  it("throughput above the work unit is not a summed total: no data, per_product_key_tbd", () => {
    const [tp] = pick(resultsFor(area, "area", rows, now), "throughput_rate");
    expect(tp).toMatchObject({ status: "no_data", value: null, reason: "per_product_key_tbd" });
  });
});

describe("work-center level: a line added up from its work units, like area", () => {
  const line = {
    ...head,
    aggregationLevel: "work_center" as const,
    scopeId: "wc",
    scopeCode: "L3",
  };
  const now = new Date("2026-10-01T08:00:00.000Z");
  const rows = [
    row({ workUnitId: "A", goodQty: 930, scrapQty: 50, reworkQty: 20 }),
    row({ workUnitId: "B", goodQty: 475, scrapQty: 20, reworkQty: 5 }),
  ];
  const cycles = (op: PlanningOperation) => ({
    workUnitCode: op.workUnitId ?? "",
    uomId: "pcs",
    cycleTimeSeconds: op.workUnitId === "A" ? 20 : 40,
    batchSize: 1,
  });
  const results = resultsFor(line, "work_center", rows, now, cycles);

  it("OEE · A · P are adopted at the line and wait on machine state (B5), not 'not at level'", () => {
    for (const m of ["oee", "availability", "performance"] as const) {
      expect(pick(results, m)[0]).toMatchObject({
        status: "no_data",
        blockedBy: "B5",
        value: null,
      });
    }
  });

  it("Quality is computed for the line", () => {
    expect(pick(results, "quality")[0]).toMatchObject({
      status: "computed",
      aggregationLevel: "work_center",
    });
  });

  it("scrap ratio rolls up in time, the same Σ scrap time / Σ produced time as area (4.5 %)", () => {
    expect(pick(results, "scrap_ratio")[0]).toMatchObject({
      status: "computed",
      value: 4.5,
      scope: "molca_rollup",
    });
  });

  it("MTTR stays a work-unit KPI: not calculated at the line", () => {
    expect(pick(results, "mttr")[0]).toMatchObject({ status: "not_at_level" });
  });
});

describe("step cycle time in seconds (WMS-003 timeConversionId, TIME_CONVERSIONS.seconds_per_unit)", () => {
  const units = new Map([
    ["tc-sec", 1],
    ["tc-min", 60],
  ]);

  it("a cycle time of 0.5 in minutes is 30 seconds, and the roll-up uses 30 s", () => {
    const cycleTimeSeconds = stepCycleSeconds(0.5, "tc-min", units);
    expect(cycleTimeSeconds).toBe(30);
    const area = { ...head, aggregationLevel: "area" as const };
    const rows = [row({ workUnitId: "A", goodQty: 950, scrapQty: 50 })];
    const [scrap] = resultsFor(area, "area", rows, new Date(), () => ({
      workUnitCode: "A",
      uomId: "pcs",
      cycleTimeSeconds,
      batchSize: 1,
    })).filter((r) => r.metric === "scrap_ratio");
    // 50 × 30 s = 1,500 s scrap time over 1,000 × 30 s = 30,000 s produced.
    expect(scrap).toMatchObject({ status: "computed", value: 5 });
    expect(scrap.inputs).toMatchObject({ rejectSeconds: 1500, producedSeconds: 30000 });
  });

  it("an unknown time conversion or no value is no cycle time, never a guess", () => {
    expect(stepCycleSeconds(0.5, "tc-unknown", units)).toBeNull();
    expect(stepCycleSeconds(null, "tc-min", units)).toBeNull();
  });
});

describe("PRD-003 KPI-012 rule 6: production process ratio at area waits on APT (B5)", () => {
  it("area is adopted, so it reads no data blocked by B5 rather than not calculated", () => {
    const area = { ...head, aggregationLevel: "area" as const };
    const [ppr] = pick(
      resultsFor(area, "area", [row({ goodQty: 90 })], new Date()),
      "production_process_ratio",
    );
    expect(ppr).toMatchObject({ status: "no_data", blockedBy: "B5", value: null });
  });
});

describe("PRD-003 KPI-011 rule 8: the routing's last step (F-08 §9.2.3)", () => {
  const steps = [
    { stepId: "mold", stepNumber: 10 },
    { stepId: "oven", stepNumber: 20 },
    { stepId: "cool", stepNumber: 30 },
  ];

  it("with no Waits-for rows the end step is the highest step_number", () => {
    expect(routingEndStep(steps, [])).toBe(30);
  });

  it("with Waits-for rows the end step is the one no other step waits for", () => {
    const waits = [
      { stepId: "oven", predecessorStepId: "mold" },
      { stepId: "cool", predecessorStepId: "oven" },
    ];
    expect(routingEndStep(steps, waits)).toBe(30);
  });

  it("two end steps (side-by-side branches) → undefined, never a guessed step", () => {
    const branches = [
      { stepId: "print", stepNumber: 20 },
      { stepId: "pack", stepNumber: 30 },
    ];
    const waits = [
      { stepId: "print", predecessorStepId: "mold" },
      { stepId: "pack", predecessorStepId: "mold" },
    ];
    expect(routingEndStep([steps[0], ...branches], waits)).toBeUndefined();
  });
});

describe("PRD-003 KPI-011 AC-6 / AC-7 above the work unit, last step from the routing", () => {
  const baked = [
    { stepId: "mold", stepNumber: 10 },
    { stepId: "oven", stepNumber: 20 },
    { stepId: "cool", stepNumber: 30 },
  ];
  const lastStep = routingEndStep(baked, []);
  const op = (
    over: Partial<{ productId: string; stepNumber: number; pq: number; uomId: string }>,
  ) => ({
    productId: "baked",
    stepNumber: 10,
    uomId: "pcs",
    pq: 0,
    start: "2026-10-22T00:00:00.000Z",
    end: "2026-10-22T08:00:00.000Z",
    ...over,
  });

  it("AC-7 (last step only): Mold 41,000, Oven 40,500, Cooling 40,000 in one shift → only Cooling's 40,000, 5,000 pcs/h", () => {
    const rows = [
      op({ stepNumber: 10, pq: 41000 }),
      op({ stepNumber: 20, pq: 40500 }),
      op({ stepNumber: 30, pq: 40000 }),
    ];
    expect(throughputPerProduct(rows, () => lastStep)).toEqual([
      { productId: "baked", unit: "pcs", pq: 40000, aoetHours: 8, rate: 5000 },
    ]);
  });

  it("AC-6 (per SKU above the work unit): Baked biscuit (Cooling, 40,000 pcs / 8 h) and Biscuit X pack (Packer, 1,000 packs / 8 h) → two rows, 5,000 and 125, no total", () => {
    const packX = [{ stepId: "packer", stepNumber: 40 }];
    const rows = [
      op({ stepNumber: 30, pq: 40000 }),
      op({ productId: "packX", stepNumber: 40, pq: 1000, uomId: "packs" }),
    ];
    const ends: Record<string, number | undefined> = {
      baked: lastStep,
      packX: routingEndStep(packX, []),
    };
    expect(throughputPerProduct(rows, (p) => ends[p])).toEqual([
      { productId: "baked", unit: "pcs", pq: 40000, aoetHours: 8, rate: 5000 },
      { productId: "packX", unit: "packs", pq: 1000, aoetHours: 8, rate: 125 },
    ]);
  });
});
