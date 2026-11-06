import { describe, expect, it } from "vite-plus/test";

import { productionProcessRatioRollup, throughputPerProduct } from "./kpi-engine.js";

import type { ThroughputOperation } from "./kpi-engine.js";

describe("PRD-003 KPI-012 rule 6: production process ratio rolls up as ΣAPT / ΣAOET", () => {
  const lines = [
    { aptMinutes: 378, aoetMinutes: 400 },
    { aptMinutes: 180, aoetMinutes: 200 },
  ];

  it("AC-7 (area scope): lines A (378 / 400) and B (180 / 200) → 93.0%, not the 92.25% average of the ratios", () => {
    expect(productionProcessRatioRollup(lines)).toEqual({ kind: "value", value: 93 });
  });

  it("AC-6 (site scope): the same two lines at Plant (site) scope → 93.0%", () => {
    expect(productionProcessRatioRollup(lines)).toMatchObject({ kind: "value", value: 93 });
  });

  it("no lines is no data, never 0%", () => {
    expect(productionProcessRatioRollup([])).toEqual({ kind: "no_data", reason: "aoet" });
  });
});

const op = (over: Partial<ThroughputOperation>): ThroughputOperation => ({
  productId: "p",
  stepNumber: 1,
  uomId: "pcs",
  pq: 0,
  start: "2026-10-22T06:00:00.000Z",
  end: "2026-10-22T14:00:00.000Z",
  ...over,
});

describe("KPI-011 rule 7–9: throughput above the work unit, one row per product", () => {
  it("AC-6: Baked biscuit (last step Cooling, 40,000 pcs, 8 h) and Biscuit X pack (last step Packer, 1,000 packs, 8 h) → two rows, no total", () => {
    const rows = [
      op({ productId: "baked", stepNumber: 1, pq: 41000, uomId: "pcs" }),
      op({ productId: "baked", stepNumber: 2, pq: 40500, uomId: "pcs" }),
      op({ productId: "baked", stepNumber: 3, pq: 40000, uomId: "pcs" }),
      op({ productId: "packX", stepNumber: 4, pq: 1000, uomId: "packs" }),
    ];
    const lastStep: Record<string, number> = { baked: 3, packX: 4 };
    const out = throughputPerProduct(rows, (p) => lastStep[p]);
    expect(out).toEqual([
      { productId: "baked", unit: "pcs", pq: 40000, aoetHours: 8, rate: 5000 },
      { productId: "packX", unit: "packs", pq: 1000, aoetHours: 8, rate: 125 },
    ]);
  });

  it("AC-7: Mold 41,000, Oven 40,500, Cooling 40,000 in the same shift → only Cooling's 40,000 is used", () => {
    const rows = [
      op({ stepNumber: 1, pq: 41000 }),
      op({ stepNumber: 2, pq: 40500 }),
      op({ stepNumber: 3, pq: 40000 }),
    ];
    expect(throughputPerProduct(rows, () => 3)).toEqual([
      { productId: "p", unit: "pcs", pq: 40000, aoetHours: 8, rate: 5000 },
    ]);
  });

  it("AC-8: two Packer stations 08:00–12:00 and 10:00–14:00 together 3,000 packs → AOET 6 h → 500 packs/h", () => {
    const rows = [
      op({
        uomId: "packs",
        pq: 1500,
        start: "2026-10-22T08:00:00.000Z",
        end: "2026-10-22T12:00:00.000Z",
      }),
      op({
        uomId: "packs",
        pq: 1500,
        start: "2026-10-22T10:00:00.000Z",
        end: "2026-10-22T14:00:00.000Z",
      }),
    ];
    expect(throughputPerProduct(rows, () => 1)).toEqual([
      { productId: "p", unit: "packs", pq: 3000, aoetHours: 6, rate: 500 },
    ]);
  });

  it("a zero AOET is an anomaly (rate null), not an infinite rate", () => {
    const t = "2026-10-22T08:00:00.000Z";
    expect(throughputPerProduct([op({ start: t, end: t })], () => 1)[0]).toMatchObject({
      rate: null,
      aoetHours: 0,
    });
  });
});
