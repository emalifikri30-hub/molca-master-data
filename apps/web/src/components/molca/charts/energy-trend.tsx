"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { TipBody } from "./hover-tip";
import { ChartLegendList, DeltaBadge, KpiValue } from "./kpi-chart-card";
import { linearRegression, niceDomain } from "./spc-stats";
import { Sparkline } from "@/components/molca/kpi-card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Energy baseline model (ISO 50001 / ISO 50006)                       */
/* ------------------------------------------------------------------ */

/**
 * Energy baseline (EnB) as a linear model on one relevant variable (driver):
 *   expected energy = intercept + slope × driver
 * intercept = fixed / base load (kWh per period), slope = variable load (kWh per driver unit).
 */
export type EnergyBaseline = {
  intercept: number;
  slope: number;
  /** Coefficient of determination of the fit on the baseline period */
  r2?: number;
  /** CV(RMSE) in % — model uncertainty (ASHRAE Guideline 14) */
  cvrmse?: number;
  /** Number of baseline periods used in the fit */
  n?: number;
  /** Baseline period, e.g. "Jan–Dec 2025" */
  period?: string;
  /** Relevant variable, e.g. "Production" */
  driver?: string;
  /** Unit of the relevant variable, e.g. "t" */
  driverUnit?: string;
};

/** Fit an EnB by ordinary least squares on baseline-period data (energy vs driver). */
export function fitEnergyBaseline(
  points: readonly { driver: number; energy: number }[],
  meta?: Pick<EnergyBaseline, "period" | "driver" | "driverUnit">,
): EnergyBaseline & { r2: number; cvrmse: number; n: number } {
  const reg = linearRegression(points.map((p) => ({ x: p.driver, y: p.energy })));
  const n = points.length;
  const sse = points.reduce((s, p) => s + (p.energy - reg.predict(p.driver)) ** 2, 0);
  const meanY = n ? points.reduce((s, p) => s + p.energy, 0) / n : 0;
  const rmse = Math.sqrt(sse / Math.max(1, n - 2));
  return {
    ...meta,
    intercept: reg.intercept,
    slope: reg.slope,
    r2: reg.r2,
    cvrmse: meanY ? (rmse / meanY) * 100 : 0,
    n,
  };
}

/** Expected (baseline-adjusted) energy for a driver value. */
export const expectedEnergy = (
  baseline: Pick<EnergyBaseline, "intercept" | "slope">,
  driver: number,
) => baseline.intercept + baseline.slope * driver;

/** One reporting period: actual metered energy plus the driver (or a precomputed expected value). */
export type EnergyReading = {
  label: string;
  actual: number;
  driver?: number;
  expected?: number;
  note?: string;
};
export type EnergyRow = EnergyReading & {
  expected: number;
  /** actual − expected (> 0 = overconsumption) */ diff: number;
  /** running Σ(actual − expected) */ cusum: number;
};

/** Expected energy, difference and CUSUM per period. */
export function energyRows(
  data: readonly EnergyReading[],
  baseline?: Pick<EnergyBaseline, "intercept" | "slope">,
): EnergyRow[] {
  let c = 0;
  return data.map((d) => {
    const expected =
      d.expected ?? (baseline && d.driver != null ? expectedEnergy(baseline, d.driver) : d.actual);
    const diff = d.actual - expected;
    c += diff;
    return { ...d, expected, diff, cusum: c };
  });
}

/** Totals over the reporting period. `savings` > 0 means less energy than the baseline predicts. */
export function energySummary(rows: readonly EnergyRow[]) {
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const driver = rows.reduce((s, r) => s + (r.driver ?? 0), 0);
  return {
    actual,
    expected,
    driver,
    savings: expected - actual,
    savingsPct: expected ? ((expected - actual) / expected) * 100 : 0,
    /** EnPI ratio actual / expected (< 1 = better than baseline) */ index: expected
      ? actual / expected
      : 1,
  };
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const r1 = (v: number) => Math.round(v * 10) / 10;
const fmtDefault = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
const OVER = "var(--sys-red)";
const SAVE = "var(--sys-green)";

function tickIndices(n: number, maxTicks: number) {
  const step = Math.max(1, Math.ceil(n / maxTicks));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  return out;
}

/**
 * Split a series at its zero crossings so "above" and "below" range areas meet exactly where the lines cross.
 * Returns rows on a numeric x (index), with interpolated rows flagged `src: -1`.
 */
function splitAtCrossings<T extends { x: number; a: number; b: number }>(rows: T[]) {
  const out: (T & { src: number })[] = [];
  rows.forEach((r, i) => {
    out.push({ ...r, src: i });
    const n = rows[i + 1];
    if (!n) return;
    const d0 = r.a - r.b;
    const d1 = n.a - n.b;
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      const v = r.b + (n.b - r.b) * t;
      out.push({ ...r, x: Math.round((i + t) * 1000) / 1000, a: v, b: v, src: -1 });
    }
  });
  return out;
}

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-40 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EnergyTrendChart                                                    */
/* ------------------------------------------------------------------ */

export type EnergyTrendChartProps = {
  /** Reporting periods (hours, days, months) in order */
  data: EnergyReading[];
  /** EnB model; used when a reading has `driver` but no `expected` */
  baseline?: EnergyBaseline;
  /** Energy unit. Default "kWh" */
  unit?: string;
  /** Tolerance band around the expected line, ± % (e.g. 5). Off by default. */
  band?: number;
  /** Improvement target vs the baseline in % (e.g. 3 → dotted line at expected × 0.97) */
  target?: number;
  /** Shade overconsumption (red) and savings (green) between actual and expected. Default true. */
  showAreas?: boolean;
  /** Driver name and unit in the tooltip (defaults from `baseline`) */
  driverLabel?: string;
  driverUnit?: string;
  /** Index of a period to emphasize (current hour / selected day) */
  highlight?: number;
  height?: number;
  /** Max x-axis labels. Default 7 */
  maxTicks?: number;
  tickFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  /** Screen-reader summary. Default: totals and % vs baseline. */
  summary?: string;
  className?: string;
};

/**
 * ISO 50001 energy performance trend: actual consumption (blue) against the baseline-adjusted expected energy
 * (dashed), with overconsumption shaded red and savings shaded green, an optional ±band and target line.
 */
export function EnergyTrendChart({
  data,
  baseline,
  unit = "kWh",
  band,
  target,
  showAreas = true,
  driverLabel,
  driverUnit,
  highlight,
  height = 260,
  maxTicks = 7,
  tickFormatter,
  valueFormatter = fmtDefault,
  summary,
  className,
}: EnergyTrendChartProps) {
  const rows = React.useMemo(() => energyRows(data, baseline), [data, baseline]);
  const dLabel = driverLabel ?? baseline?.driver ?? "Driver";
  const dUnit = driverUnit ?? baseline?.driverUnit ?? "";

  const chartRows = React.useMemo(() => {
    const base = rows.map((r, i) => ({ x: i, a: r.actual, b: r.expected }));
    return splitAtCrossings(base).map((p) => {
      const lo = Math.min(p.a, p.b);
      const hi = Math.max(p.a, p.b);
      return {
        x: p.x,
        src: p.src,
        actual: r1(p.a),
        expected: r1(p.b),
        band: band ? [r1(p.b * (1 - band / 100)), r1(p.b * (1 + band / 100))] : undefined,
        target: target ? r1(p.b * (1 - target / 100)) : undefined,
        over: [r1(p.b), r1(hi)],
        save: [r1(lo), r1(p.b)],
      };
    });
  }, [rows, band, target]);

  const vals = rows.flatMap((r) => [
    r.actual,
    r.expected * (1 + (band ?? 0) / 100),
    r.expected * (1 - Math.max(band ?? 0, target ?? 0) / 100),
  ]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  const ticks = niceDomain(Math.max(0, lo - pad), hi + pad, 4);
  const xTicks = tickIndices(rows.length, maxTicks);
  const s = energySummary(rows);
  const auto = `Actual ${valueFormatter(s.actual)} ${unit} vs expected ${valueFormatter(s.expected)} ${unit} (${s.savingsPct >= 0 ? "−" : "+"}${Math.abs(r1(s.savingsPct))}% vs baseline).`;

  const config = {
    actual: { label: "Actual", color: "var(--chart-1)" },
    expected: { label: "Expected (EnB)", color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

  return (
    <div role="img" aria-label={summary ?? auto} className={cn("w-full", className)}>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, Math.max(1, rows.length - 1)]}
            ticks={xTicks}
            tickFormatter={(v: number) => rows[Math.round(v)]?.label ?? ""}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            padding={{ left: 6, right: 6 }}
            allowDecimals={false}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickMargin={6}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={tickFormatter}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeOpacity: 0.35,
              strokeDasharray: "3 3",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as { x: number; src: number } | undefined;
              if (!p) return null;
              const r = rows[p.src >= 0 ? p.src : Math.round(p.x)];
              if (!r) return null;
              const pct = r.expected ? (r.diff / r.expected) * 100 : 0;
              return (
                <TooltipShell>
                  <TipBody
                    title={r.label}
                    rows={[
                      {
                        label: "Actual",
                        value: `${valueFormatter(r.actual)} ${unit}`,
                        color: "var(--chart-1)",
                      },
                      {
                        label: "Expected (EnB)",
                        value: `${valueFormatter(r1(r.expected))} ${unit}`,
                        color: "var(--muted-foreground)",
                      },
                      ...(r.driver != null
                        ? [
                            {
                              label: dLabel,
                              value: `${r.driver.toLocaleString("en-US")} ${dUnit}`.trim(),
                            },
                          ]
                        : []),
                      {
                        label: r.diff > 0 ? "Overconsumption" : "Savings",
                        value: `${valueFormatter(Math.abs(r1(r.diff)))} ${unit} · ${Math.abs(r1(pct))}%`,
                        color: r.diff > 0 ? OVER : SAVE,
                      },
                    ]}
                    note={r.note}
                  />
                </TooltipShell>
              );
            }}
          />
          {band ? (
            <Area
              dataKey="band"
              type="linear"
              stroke="none"
              fill="var(--muted-foreground)"
              fillOpacity={0.1}
              isAnimationActive={false}
              activeDot={false}
            />
          ) : null}
          {showAreas && (
            <Area
              dataKey="over"
              type="linear"
              stroke="none"
              fill={OVER}
              fillOpacity={0.3}
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          {showAreas && (
            <Area
              dataKey="save"
              type="linear"
              stroke="none"
              fill={SAVE}
              fillOpacity={0.28}
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          {highlight != null && rows[highlight] && (
            <ReferenceLine
              x={highlight}
              stroke="var(--chart-1)"
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          )}
          {target ? (
            <Line
              dataKey="target"
              type="linear"
              stroke="var(--foreground)"
              strokeOpacity={0.55}
              strokeDasharray="1 4"
              strokeLinecap="round"
              strokeWidth={1.75}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null}
          <Line
            dataKey="expected"
            type="linear"
            stroke="var(--muted-foreground)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="actual"
            type="linear"
            stroke="var(--chart-1)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: { src: number } }) =>
              p.payload &&
              p.payload.src >= 0 &&
              (p.payload.src === highlight || rows.length <= 12) ? (
                <circle
                  key={p.index}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.payload.src === highlight ? 4.5 : 2.75}
                  fill="var(--chart-1)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 4.5, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

/** Legend matching EnergyTrendChart. */
export function EnergyTrendLegend({
  band,
  target,
  className,
}: {
  band?: number;
  target?: number;
  className?: string;
}) {
  return (
    <ChartLegendList
      className={className}
      items={[
        { label: "Actual", color: "var(--chart-1)" },
        { label: "Expected (EnB)", color: "var(--muted-foreground)", dashed: true },
        ...(band
          ? [
              {
                label: `±${band}% band`,
                color: "color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
              },
            ]
          : []),
        ...(target
          ? [{ label: `Target −${target}%`, color: "var(--foreground)", dashed: true }]
          : []),
        { label: "Overconsumption", color: OVER },
        { label: "Savings", color: SAVE },
      ]}
    />
  );
}

/** One-line model statement for the card footer: "EnB = 18,200 kWh + 152 kWh/t × production · R² 0.91". */
export function EnergyBaselineNote({
  baseline,
  unit = "kWh",
  className,
}: {
  baseline: EnergyBaseline;
  unit?: string;
  className?: string;
}) {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 3 : 0 });
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums", className)}
    >
      <span>
        EnB = {n(baseline.intercept)} {unit} + {n(baseline.slope)} {unit}/
        {baseline.driverUnit ?? "unit"} × {(baseline.driver ?? "driver").toLowerCase()}
      </span>
      {baseline.r2 != null && <span>· R² {baseline.r2.toFixed(2)}</span>}
      {baseline.cvrmse != null && <span>· CV(RMSE) {baseline.cvrmse.toFixed(1)}%</span>}
      {baseline.period && <span>· baseline {baseline.period}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CusumChart                                                          */
/* ------------------------------------------------------------------ */

export type CusumEvent = {
  /** index of the period where the event took effect */ index: number;
  label: string;
};

export type CusumChartProps = {
  data: EnergyReading[];
  baseline?: EnergyBaseline;
  unit?: string;
  /** Energy conservation measures / changes, drawn as vertical markers */
  events?: CusumEvent[];
  height?: number;
  maxTicks?: number;
  tickFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  summary?: string;
  className?: string;
};

/**
 * CUSUM of (actual − expected) — the standard M&V view (ISO 50015 / IPMVP).
 * A rising line = overconsumption accumulating (red), a falling line = savings accumulating (green).
 * A change of slope marks when performance changed; annotate it with `events`.
 */
export function CusumChart({
  data,
  baseline,
  unit = "kWh",
  events,
  height = 220,
  maxTicks = 7,
  tickFormatter,
  valueFormatter = fmtDefault,
  summary,
  className,
}: CusumChartProps) {
  const rows = React.useMemo(() => energyRows(data, baseline), [data, baseline]);
  const chartRows = React.useMemo(() => {
    const base = rows.map((r, i) => ({ x: i, a: r.cusum, b: 0 }));
    return splitAtCrossings(base).map((p) => ({
      x: p.x,
      src: p.src,
      cusum: r1(p.a),
      pos: [0, r1(Math.max(0, p.a))],
      neg: [r1(Math.min(0, p.a)), 0],
    }));
  }, [rows]);
  const vals = rows.map((r) => r.cusum);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const ticks = niceDomain(lo < 0 ? lo - pad : 0, hi > 0 ? hi + pad : 0, 4);
  const xTicks = tickIndices(rows.length, maxTicks);
  const end = rows[rows.length - 1]?.cusum ?? 0;
  const auto = `CUSUM ends at ${end > 0 ? "+" : "−"}${valueFormatter(Math.abs(r1(end)))} ${unit}: ${end > 0 ? "cumulative overconsumption" : "cumulative savings"} against the baseline.`;
  const config = { cusum: { label: "CUSUM", color: "var(--chart-1)" } } satisfies ChartConfig;

  return (
    <div role="img" aria-label={summary ?? auto} className={cn("w-full", className)}>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <ComposedChart data={chartRows} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, Math.max(1, rows.length - 1)]}
            ticks={xTicks}
            tickFormatter={(v: number) => rows[Math.round(v)]?.label ?? ""}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            padding={{ left: 6, right: 6 }}
            allowDecimals={false}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickMargin={6}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={tickFormatter}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeOpacity: 0.35,
              strokeDasharray: "3 3",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as { x: number; src: number } | undefined;
              if (!p) return null;
              const r = rows[p.src >= 0 ? p.src : Math.round(p.x)];
              if (!r) return null;
              return (
                <TooltipShell>
                  <TipBody
                    title={r.label}
                    rows={[
                      {
                        label: "CUSUM",
                        value: `${r.cusum > 0 ? "+" : r.cusum < 0 ? "−" : ""}${valueFormatter(Math.abs(r1(r.cusum)))} ${unit}`,
                        color: "var(--chart-1)",
                      },
                      {
                        label: "This period",
                        value: `${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${valueFormatter(Math.abs(r1(r.diff)))} ${unit}`,
                        color: r.diff > 0 ? OVER : SAVE,
                      },
                    ]}
                    note={events?.find((e) => e.index === rows.indexOf(r))?.label ?? r.note}
                  />
                </TooltipShell>
              );
            }}
          />
          <Area
            dataKey="pos"
            type="linear"
            stroke="none"
            fill={OVER}
            fillOpacity={0.16}
            isAnimationActive={false}
            activeDot={false}
          />
          <Area
            dataKey="neg"
            type="linear"
            stroke="none"
            fill={SAVE}
            fillOpacity={0.16}
            isAnimationActive={false}
            activeDot={false}
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
          {events?.map((e) => (
            <ReferenceLine
              key={e.index}
              x={e.index}
              stroke="var(--foreground)"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
              label={{
                value: e.label,
                position: "insideTopLeft",
                fontSize: 11,
                fill: "var(--muted-foreground)",
                offset: 6,
                dy: -16,
              }}
            />
          ))}
          <Line
            dataKey="cusum"
            type="linear"
            stroke="var(--chart-1)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4.5, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EnpiCard                                                            */
/* ------------------------------------------------------------------ */

export type EnpiCardProps = {
  /** EnPI name, e.g. "Specific energy · Plant FI-2" */
  title: React.ReactNode;
  /** Scope / period, e.g. "October 2026 · electricity" */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Current EnPI value (reporting period) */
  value: number;
  /** EnPI value of the energy baseline (EnB) — or the normalized expected value */
  baseline: number;
  /** e.g. "kWh/t" */
  unit: string;
  /** Label of the baseline, e.g. "EnB 2025" */
  baselineLabel?: string;
  /** Lower is better for energy intensity (default). Use "up" for e.g. t/MWh. */
  goodWhen?: "up" | "down";
  decimals?: number;
  /** Optional target value (e.g. baseline × 0.97) */
  target?: number;
  /** Recent EnPI values for a sparkline, oldest first */
  trend?: number[];
  trendLabel?: string;
  /** Footer, e.g. normalized savings or the formula */
  footer?: React.ReactNode;
  className?: string;
};

/** EnPI tile: current value with unit, delta vs baseline (green = better), baseline/target comparison bars and a sparkline. */
export function EnpiCard({
  title,
  description,
  icon,
  value,
  baseline,
  unit,
  baselineLabel = "Baseline",
  goodWhen = "down",
  decimals = 1,
  target,
  trend,
  trendLabel,
  footer,
  className,
}: EnpiCardProps) {
  const delta = baseline ? ((value - baseline) / baseline) * 100 : 0;
  const max = Math.max(value, baseline, target ?? 0) * 1.08 || 1;
  const fmt = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const better = goodWhen === "down" ? value <= baseline : value >= baseline;
  const bars = [
    { label: baselineLabel, v: baseline, color: "var(--chart-base)" },
    { label: "Actual", v: value, color: "var(--chart-1)" },
  ];
  return (
    <div
      className={cn(
        "@container w-full rounded-2xl border bg-card p-5 text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
        {icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border bg-subtle text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <span className="min-w-0 truncate">{title}</span>
      </div>
      {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-4 grid gap-4 @[26rem]:grid-cols-[auto_1fr] @[26rem]:items-end @[26rem]:gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <KpiValue value={fmt(value)} unit={unit} />
            <DeltaBadge value={Math.round(delta * 10) / 10} goodWhen={goodWhen} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {better ? "Better" : "Worse"} than{" "}
            {baselineLabel.toLowerCase().startsWith("enb")
              ? baselineLabel
              : `the ${baselineLabel.toLowerCase()}`}{" "}
            ({fmt(baseline)} {unit})
          </p>
        </div>
        <div className="grid gap-1.5">
          {bars.map((b) => (
            <div
              key={b.label}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[12px]"
            >
              <span className="truncate text-muted-foreground">{b.label}</span>
              <span className="relative h-2 rounded-full bg-foreground/10">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.round((b.v / max) * 1000) / 10}%`, background: b.color }}
                />
                {target != null && (
                  <span
                    className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/70"
                    style={{ left: `${Math.round((target / max) * 1000) / 10}%` }}
                    aria-hidden
                  />
                )}
              </span>
              <span className="w-12 text-right font-medium tabular-nums">{fmt(b.v)}</span>
            </div>
          ))}
          {target != null && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="h-2.5 w-0.5 rounded-full bg-foreground/70" aria-hidden /> Target{" "}
              {fmt(target)} {unit}
            </div>
          )}
        </div>
      </div>
      {trend && trend.length > 1 && (
        <div className="mt-4 flex items-end justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">{trendLabel ?? "Trend"}</span>
          <Sparkline data={trend} target={target ?? baseline} width={140} height={32} />
        </div>
      )}
      {footer && (
        <div className="mt-4 border-t pt-3 text-[12.5px] text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}
