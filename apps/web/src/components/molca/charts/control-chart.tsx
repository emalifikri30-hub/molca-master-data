import * as React from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { mean, decimalsFor, niceTicks } from "./spc-stats";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Constants & limit helpers                                           */
/* ------------------------------------------------------------------ */

/** SPC constants by subgroup size n (AIAG SPC manual, Appendix E). */
export const SPC_CONSTANTS: Record<number, { A2: number; D3: number; D4: number; d2: number }> = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
  6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.97 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 },
};

export type ControlLimits = {
  cl: number;
  ucl: number;
  lcl: number;
  /** 1σ of the plotted statistic */ sigma: number;
};
export type SpcPoint = {
  label: string;
  value: number;
  /** per-point limits (p-chart with varying n) */ ucl?: number;
  lcl?: number;
  note?: string;
};

/** Generic Shewhart limits: CL ± k·σ (LCL floored at `floor`, e.g. 0 for counts). */
export function controlLimits(
  center: number,
  sigma: number,
  { k = 3, floor }: { k?: number; floor?: number } = {},
): ControlLimits {
  const lcl = center - k * sigma;
  return {
    cl: center,
    ucl: center + k * sigma,
    lcl: floor != null ? Math.max(floor, lcl) : lcl,
    sigma,
  };
}

/**
 * X̄-R chart for rational subgroups (n = 2…10).
 * X̄ chart: CL = X̿, UCL/LCL = X̿ ± A2·R̄.  R chart: CL = R̄, UCL = D4·R̄, LCL = D3·R̄.
 * `baseline` = number of leading subgroups used to compute the limits (Phase I); the rest are monitored against them.
 * `exclude` = Phase I subgroups with a known assignable cause, left out of the limit calculation.
 */
export function xbarR(
  subgroups: number[][],
  {
    baseline = subgroups.length,
    exclude = [],
    labels,
  }: {
    baseline?: number;
    /** Phase I subgroups removed for an assignable cause */ exclude?: number[];
    labels?: string[];
  } = {},
) {
  const n = subgroups[0]?.length ?? 5;
  const c = SPC_CONSTANTS[n];
  if (!c) throw new Error(`xbarR: subgroup size ${n} not supported (2–10)`);
  const means = subgroups.map((g) => mean(g));
  const ranges = subgroups.map((g) => Math.max(...g) - Math.min(...g));
  const keep = (_: number, i: number) => i < baseline && !exclude.includes(i);
  const xbb = mean(means.filter(keep));
  const rbar = mean(ranges.filter(keep));
  const lab = (i: number) => labels?.[i] ?? String(i + 1);
  return {
    n,
    rbar,
    /** within-subgroup σ estimate R̄/d2 */
    sigmaWithin: rbar / c.d2,
    xbar: {
      points: means.map((value, i): SpcPoint => ({ label: lab(i), value })),
      limits: { cl: xbb, ucl: xbb + c.A2 * rbar, lcl: xbb - c.A2 * rbar, sigma: (c.A2 * rbar) / 3 },
    },
    range: {
      points: ranges.map((value, i): SpcPoint => ({ label: lab(i), value })),
      limits: { cl: rbar, ucl: c.D4 * rbar, lcl: c.D3 * rbar, sigma: ((c.D4 - 1) * rbar) / 3 },
    },
  };
}

/** I-MR chart for individual readings. I: X̄ ± 2.66·MR̄.  MR: CL = MR̄, UCL = 3.267·MR̄. */
export function iMR(
  values: number[],
  { baseline = values.length, labels }: { baseline?: number; labels?: string[] } = {},
) {
  const mrs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const xbar = mean(values.slice(0, baseline));
  const mrbar = mean(mrs.slice(0, Math.max(1, baseline - 1)));
  const lab = (i: number) => labels?.[i] ?? String(i + 1);
  return {
    mrbar,
    sigmaWithin: mrbar / 1.128,
    individuals: {
      points: values.map((value, i): SpcPoint => ({ label: lab(i), value })),
      limits: {
        cl: xbar,
        ucl: xbar + 2.66 * mrbar,
        lcl: xbar - 2.66 * mrbar,
        sigma: mrbar / 1.128,
      },
    },
    movingRange: {
      points: mrs.map((value, i): SpcPoint => ({ label: lab(i + 1), value })),
      limits: { cl: mrbar, ucl: 3.267 * mrbar, lcl: 0, sigma: (2.267 * mrbar) / 3 },
    },
  };
}

/** p-chart (proportion defective) with varying sample size: p̄ ± 3·√(p̄(1−p̄)/nᵢ). Values in %. */
export function pChart(
  defectives: number[],
  sizes: number[],
  { labels }: { labels?: string[] } = {},
) {
  const pbar = defectives.reduce((s, d) => s + d, 0) / sizes.reduce((s, n) => s + n, 0);
  const points: SpcPoint[] = defectives.map((d, i) => {
    const s = Math.sqrt((pbar * (1 - pbar)) / sizes[i]);
    return {
      label: labels?.[i] ?? String(i + 1),
      value: (d / sizes[i]) * 100,
      ucl: (pbar + 3 * s) * 100,
      lcl: Math.max(0, pbar - 3 * s) * 100,
    };
  });
  const nbar = mean(sizes);
  const sbar = Math.sqrt((pbar * (1 - pbar)) / nbar) * 100;
  return { pbar, points, limits: controlLimits(pbar * 100, sbar, { floor: 0 }) };
}

/** c-chart (defects per constant inspection unit): c̄ ± 3·√c̄, LCL floored at 0. */
export function cChart(counts: number[], { labels }: { labels?: string[] } = {}) {
  const cbar = mean(counts);
  return {
    cbar,
    points: counts.map((value, i): SpcPoint => ({ label: labels?.[i] ?? String(i + 1), value })),
    limits: controlLimits(cbar, Math.sqrt(cbar), { floor: 0 }),
  };
}

/* ------------------------------------------------------------------ */
/* Nelson / Western Electric rules                                     */
/* ------------------------------------------------------------------ */

export type NelsonRule = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const NELSON_RULES: Record<NelsonRule, { short: string; description: string }> = {
  1: {
    short: "Beyond 3σ",
    description: "1 point beyond a control limit (> 3σ from the center line)",
  },
  2: {
    short: "9 on one side",
    description: "9 points in a row on the same side of the center line",
  },
  3: { short: "6 trending", description: "6 points in a row steadily increasing or decreasing" },
  4: { short: "14 alternating", description: "14 points in a row alternating up and down" },
  5: { short: "2 of 3 beyond 2σ", description: "2 out of 3 points beyond 2σ on the same side" },
  6: { short: "4 of 5 beyond 1σ", description: "4 out of 5 points beyond 1σ on the same side" },
  7: { short: "15 within 1σ", description: "15 points in a row within 1σ (stratification)" },
  8: { short: "8 outside 1σ", description: "8 points in a row beyond 1σ on either side (mixture)" },
};

/** Western Electric rules = Nelson 1, 2 (WE uses 8 in a row — we use Nelson's 9), 5, 6. */
export const WESTERN_ELECTRIC: NelsonRule[] = [1, 2, 5, 6];
export const DEFAULT_RULES: NelsonRule[] = [1, 2, 3, 5, 6];

export type RuleViolation = { index: number; rules: NelsonRule[] };

/**
 * Evaluate Nelson rules. `sigma` may be a number or one σ per point (varying limits — p-chart).
 * The point that COMPLETES a pattern is flagged (Minitab convention). Returns one entry per flagged point.
 */
export function nelsonRules(
  values: readonly number[],
  center: number,
  sigma: number | readonly number[],
  rules: readonly NelsonRule[] = DEFAULT_RULES,
): RuleViolation[] {
  const z = values.map((v, i) => {
    const s = typeof sigma === "number" ? sigma : sigma[i];
    return s > 0 ? (v - center) / s : 0;
  });
  const hits = new Map<number, Set<NelsonRule>>();
  const flag = (i: number, r: NelsonRule) => {
    if (!hits.has(i)) hits.set(i, new Set());
    hits.get(i)!.add(r);
  };
  const on = new Set(rules);
  const win = (i: number, len: number) => (i + 1 >= len ? z.slice(i + 1 - len, i + 1) : null);

  for (let i = 0; i < z.length; i++) {
    if (on.has(1) && Math.abs(z[i]) > 3) flag(i, 1);
    const w9 = win(i, 9);
    if (on.has(2) && w9 && (w9.every((v) => v > 0) || w9.every((v) => v < 0))) flag(i, 2);
    if (on.has(3) && i >= 5) {
      const s = values.slice(i - 5, i + 1);
      const inc = s.every((v, k) => k === 0 || v > s[k - 1]);
      const dec = s.every((v, k) => k === 0 || v < s[k - 1]);
      if (inc || dec) flag(i, 3);
    }
    if (on.has(4) && i >= 13) {
      const s = values.slice(i - 13, i + 1);
      let alt = true;
      for (let k = 2; k < s.length && alt; k++)
        alt = Math.sign(s[k] - s[k - 1]) === -Math.sign(s[k - 1] - s[k - 2]) && s[k] !== s[k - 1];
      if (alt) flag(i, 4);
    }
    const w3 = win(i, 3);
    if (
      on.has(5) &&
      w3 &&
      (w3.filter((v) => v > 2).length >= 2 || w3.filter((v) => v < -2).length >= 2) &&
      Math.abs(z[i]) > 2
    )
      flag(i, 5);
    const w5 = win(i, 5);
    if (
      on.has(6) &&
      w5 &&
      (w5.filter((v) => v > 1).length >= 4 || w5.filter((v) => v < -1).length >= 4) &&
      Math.abs(z[i]) > 1
    )
      flag(i, 6);
    const w15 = win(i, 15);
    if (on.has(7) && w15 && w15.every((v) => Math.abs(v) < 1)) flag(i, 7);
    const w8 = win(i, 8);
    if (on.has(8) && w8 && w8.every((v) => Math.abs(v) > 1)) flag(i, 8);
  }
  return [...hits.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, s]) => ({ index, rules: [...s].sort() as NelsonRule[] }));
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type ControlChartProps = {
  points: SpcPoint[];
  limits: ControlLimits;
  /** Nelson rules to evaluate. Pass [] to only draw limits. Default [1, 2, 3, 5, 6]. */
  rules?: readonly NelsonRule[];
  /** Shade ±1σ / ±2σ zones (constant limits only) */
  zones?: boolean;
  /** Specification / target line (e.g. 25.0 kg) — drawn dotted, never confused with control limits */
  target?: number;
  unit?: string;
  decimals?: number;
  height?: number;
  /** Short label of the statistic, used in the tooltip ("X̄", "R", "p", "c") */
  statistic?: string;
  /** What one point is called in the tooltip ("Subgroup", "Batch", "Day") */
  pointName?: string;
  /** Show UCL / CL / LCL values at the right edge */
  showLimitLabels?: boolean;
  /** Highlighted point (selection from a table) */
  activeIndex?: number;
  onPointClick?: (index: number) => void;
  className?: string;
};

type Row = SpcPoint & { i: number; cl: number; uclV: number; lclV: number; rules: NelsonRule[] };

/**
 * Shewhart control chart. Points in blue, center line solid, UCL/LCL dashed, optional σ zones.
 * Points that trigger a Nelson / Western Electric rule turn red; the tooltip names the rule.
 */
export function ControlChart({
  points,
  limits,
  rules = DEFAULT_RULES,
  zones = false,
  target,
  unit,
  decimals,
  height = 260,
  statistic = "Value",
  pointName = "Subgroup",
  showLimitLabels = true,
  activeIndex,
  onPointClick,
  className,
}: ControlChartProps) {
  const variable = points.some((p) => p.ucl != null);
  const rows: Row[] = React.useMemo(() => {
    const sig = points.map((p) => (p.ucl != null ? (p.ucl - limits.cl) / 3 : limits.sigma));
    const v = nelsonRules(
      points.map((p) => p.value),
      limits.cl,
      sig,
      rules,
    );
    const byIdx = new Map(v.map((x) => [x.index, x.rules]));
    return points.map((p, i) => ({
      ...p,
      i,
      cl: limits.cl,
      uclV: p.ucl ?? limits.ucl,
      lclV: p.lcl ?? limits.lcl,
      rules: byIdx.get(i) ?? [],
    }));
  }, [points, limits, rules]);

  const lo = Math.min(...rows.map((r) => Math.min(r.value, r.lclV)), target ?? Infinity);
  const hi = Math.max(...rows.map((r) => Math.max(r.value, r.uclV)), target ?? -Infinity);
  const pad = (hi - lo) * 0.08 || 1;
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const dec = decimals ?? decimalsFor(ticks[1] - ticks[0] || (hi - lo) / 5);
  const f = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const s = limits.sigma;
  const config = { value: { label: statistic, color: "var(--chart-1)" } } satisfies ChartConfig;
  const step = Math.max(1, Math.ceil(rows.length / 14));

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ComposedChart
        data={rows}
        margin={{ top: 10, right: showLimitLabels ? 64 : 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={step - 1}
          fontSize={11.5}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          domain={[lo - pad, hi + pad]}
          ticks={ticks}
          tickFormatter={(v: number) => f(v)}
        />
        {zones && !variable && (
          <>
            <ReferenceArea
              y1={limits.cl + 2 * s}
              y2={limits.ucl}
              fill="var(--muted-foreground)"
              fillOpacity={0.09}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
            <ReferenceArea
              y1={limits.cl + s}
              y2={limits.cl + 2 * s}
              fill="var(--muted-foreground)"
              fillOpacity={0.045}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
            <ReferenceArea
              y1={limits.cl - 2 * s}
              y2={limits.cl - s}
              fill="var(--muted-foreground)"
              fillOpacity={0.045}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
            <ReferenceArea
              y1={Math.max(limits.lcl, lo - pad)}
              y2={limits.cl - 2 * s}
              fill="var(--muted-foreground)"
              fillOpacity={0.09}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
          </>
        )}
        {target != null && (
          <ReferenceLine
            y={target}
            stroke="var(--muted-foreground)"
            strokeDasharray="1 3"
            strokeWidth={1.5}
          />
        )}
        <ReferenceLine
          y={limits.cl}
          stroke="var(--foreground)"
          strokeOpacity={0.7}
          label={
            showLimitLabels
              ? {
                  value: `CL ${f(limits.cl)}`,
                  position: "right",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }
              : undefined
          }
        />
        {variable ? (
          <>
            <Line
              dataKey="uclV"
              type="step"
              stroke="var(--danger)"
              strokeOpacity={0.75}
              strokeDasharray="5 4"
              strokeWidth={1.25}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="lclV"
              type="step"
              stroke="var(--danger)"
              strokeOpacity={0.75}
              strokeDasharray="5 4"
              strokeWidth={1.25}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </>
        ) : (
          <>
            <ReferenceLine
              y={limits.ucl}
              stroke="var(--danger)"
              strokeOpacity={0.75}
              strokeDasharray="5 4"
              label={
                showLimitLabels
                  ? {
                      value: `UCL ${f(limits.ucl)}`,
                      position: "right",
                      fontSize: 11,
                      fill: "var(--muted-foreground)",
                    }
                  : undefined
              }
            />
            {limits.lcl > lo - pad && (
              <ReferenceLine
                y={limits.lcl}
                stroke="var(--danger)"
                strokeOpacity={0.75}
                strokeDasharray="5 4"
                label={
                  showLimitLabels
                    ? {
                        value: `LCL ${f(limits.lcl)}`,
                        position: "right",
                        fontSize: 11,
                        fill: "var(--muted-foreground)",
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as Row | undefined);
            if (!r) return null;
            return (
              <div className="min-w-44 max-w-64 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 opacity-65">
                  {pointName} {r.label}
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">{statistic}</span>
                  <span className="font-semibold tabular-nums">
                    {f(r.value)}
                    {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">UCL / LCL</span>
                  <span className="tabular-nums">
                    {f(r.uclV)} / {f(r.lclV)}
                  </span>
                </div>
                {r.note && <div className="mt-1 opacity-80">{r.note}</div>}
                {r.rules.length > 0 && (
                  <div className="mt-1.5 grid gap-0.5 border-t border-background/15 pt-1.5">
                    {r.rules.map((k) => (
                      <div key={k} className="flex gap-1.5">
                        <span className="font-semibold text-danger">Rule {k}</span>
                        <span className="opacity-80">{NELSON_RULES[k].short}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Line
          dataKey="value"
          type="linear"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          isAnimationActive={false}
          activeDot={{ r: 5 }}
          dot={(props: { cx?: number; cy?: number; index?: number }) => {
            const { cx, cy, index = 0 } = props;
            if (cx == null || cy == null) return <g key={index} />;
            const r = rows[index];
            const bad = r.rules.length > 0;
            const sel = activeIndex === index;
            return (
              <g
                key={index}
                onClick={onPointClick ? () => onPointClick(index) : undefined}
                style={onPointClick ? { cursor: "pointer" } : undefined}
              >
                {sel && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={bad ? 4.5 : 3}
                  fill={bad ? "var(--danger)" : "var(--card)"}
                  stroke={bad ? "var(--card)" : "var(--chart-1)"}
                  strokeWidth={bad ? 1.5 : 1.5}
                />
              </g>
            );
          }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

/** Compact list of out-of-control points: "Subgroup 9 · Rule 1 — 1 point beyond a control limit". */
export function RuleViolationList({
  points,
  limits,
  rules = DEFAULT_RULES,
  pointName = "Subgroup",
  empty = "In control — no rule violations.",
  className,
}: {
  points: SpcPoint[];
  limits: ControlLimits;
  rules?: readonly NelsonRule[];
  pointName?: string;
  empty?: string;
  className?: string;
}) {
  const v = React.useMemo(() => {
    const sig = points.map((p) => (p.ucl != null ? (p.ucl - limits.cl) / 3 : limits.sigma));
    return nelsonRules(
      points.map((p) => p.value),
      limits.cl,
      sig,
      rules,
    );
  }, [points, limits, rules]);
  if (!v.length)
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 text-[12.5px] text-muted-foreground",
          className,
        )}
      >
        <span className="size-2 rounded-full bg-success" />
        {empty}
      </p>
    );
  return (
    <ul className={cn("grid gap-1 text-[12.5px]", className)}>
      {v.map((x) => (
        <li key={x.index} className="flex flex-wrap items-baseline gap-x-2">
          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
            <span className="size-2 rounded-full bg-danger" />
            {pointName} {points[x.index].label}
          </span>
          <span className="text-muted-foreground">
            {x.rules.map((k) => `Rule ${k} — ${NELSON_RULES[k].description}`).join("; ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
