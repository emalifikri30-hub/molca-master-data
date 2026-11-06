"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/** R(t) = exp(−(t/η)^β) */
export const weibullReliability = (t: number, beta: number, eta: number) =>
  Math.exp(-Math.pow(t / eta, beta));
/** B-life: time by which p (0–1) of the population has failed. B10 = η · (−ln 0.9)^(1/β) */
export const bLife = (p: number, beta: number, eta: number) =>
  eta * Math.pow(-Math.log(1 - p), 1 / beta);
/** Instantaneous failure rate h(t) = (β/η)(t/η)^(β−1) */
export const weibullHazard = (t: number, beta: number, eta: number) =>
  (beta / eta) * Math.pow(t / eta, beta - 1);

export type WeibullFit = {
  beta: number;
  eta: number;
  /** Coefficient of determination of the probability-plot fit */
  r2: number;
  points: { t: number; rank: number; F: number; x: number; y: number }[];
};

/**
 * Median-rank regression (complete failure data). F(i) by Bernard's approximation (i − 0.3) / (n + 0.4);
 * linearise x = ln t, y = ln(−ln(1 − F)); regress x on y (RRX): x = a + b·y → β = 1/b, η = e^a.
 */
export function weibullFit(times: number[]): WeibullFit {
  const t = [...times].filter((v) => v > 0).sort((a, b) => a - b);
  const n = t.length;
  const points = t.map((v, i) => {
    const F = (i + 1 - 0.3) / (n + 0.4);
    return { t: v, rank: i + 1, F, x: Math.log(v), y: Math.log(-Math.log(1 - F)) };
  });
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  let sxy = 0;
  let syy = 0;
  let sxx = 0;
  points.forEach((p) => {
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
    sxx += (p.x - mx) ** 2;
  });
  const b = sxy / syy;
  const a = mx - b * my;
  return { beta: 1 / b, eta: Math.exp(a), r2: (sxy * sxy) / (sxx * syy), points };
}

const yOf = (F: number) => Math.log(-Math.log(1 - F));
const f0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const f2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export type WeibullPlotProps = {
  times: number[];
  unit?: string;
  /** Mark the B-life on the fit line (default 0.1 → B10) */
  bPercent?: number;
  /** Time-axis ticks (log scale). Default: 1-2-5 steps that cover every failure and the B-life */
  timeTicks?: number[];
  height?: number;
  className?: string;
};

/** 1-2-5 ticks from the step at or below `lo` to the step at or above `hi`. */
function autoTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (
    let d = Math.floor(Math.log10(Math.max(lo, 1e-3)));
    d <= Math.ceil(Math.log10(Math.max(hi, 1e-3)));
    d++
  )
    for (const m of [1, 2, 5]) out.push(m * 10 ** d);
  const first = out.findLastIndex((v) => v <= lo);
  const last = out.findIndex((v) => v >= hi);
  return out.slice(Math.max(0, first), last < 0 ? out.length : last + 1);
}

/** Weibull probability plot: failures on log time vs ln(−ln(1−F)), so a Weibull population is a straight line with slope β. */
export function WeibullPlot({
  times,
  unit = "h",
  bPercent = 0.1,
  timeTicks,
  height = 300,
  className,
}: WeibullPlotProps) {
  const fit = React.useMemo(() => weibullFit(times), [times]);
  const probTicks = [0.01, 0.05, 0.1, 0.2, 0.5, 0.632, 0.9, 0.99];
  const b = bLife(bPercent, fit.beta, fit.eta);
  // the axis spans the shortest interval (or the B-life) to the longest, on 1-2-5 steps, so no point sits on the edge
  const ticks =
    timeTicks ?? autoTicks(Math.min(Math.exp(fit.points[0].x), b), Math.exp(fit.points.at(-1)!.x));
  const xs = ticks.map(Math.log);
  const xMin = Math.min(xs[0], fit.points[0].x);
  const xMax = Math.max(xs.at(-1)!, fit.points.at(-1)!.x);
  // fit line: y = β (x − ln η)
  const line = [xMin, xMax].map((x) => ({ x, fit: fit.beta * (x - Math.log(fit.eta)) }));
  const config = {
    y: { label: "Failure", color: "var(--foreground)" },
    fit: { label: "Fit", color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const yDomain = [yOf(0.01), yOf(0.99)];

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ComposedChart margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="4 4" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[xMin, xMax]}
          ticks={xs}
          tickFormatter={(v) => (Math.exp(v) < 1 ? Math.exp(v).toFixed(1) : f0(Math.exp(v)))}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDataOverflow
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={yDomain}
          ticks={probTicks.map(yOf)}
          tickFormatter={(v) => `${f2((1 - Math.exp(-Math.exp(v))) * 100)}%`}
          tickLine={false}
          axisLine={false}
          width={48}
          allowDataOverflow
        />
        <ReferenceLine
          y={yOf(0.632)}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: `η ${f0(fit.eta)} ${unit}`,
            position: "insideTopLeft",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <ReferenceLine
          x={Math.log(b)}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: `B${bPercent * 100} ${f0(b)} ${unit}`,
            position: "insideBottomRight",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = active && (payload?.[0]?.payload as WeibullFit["points"][number] | undefined);
            if (!p || p.t == null) return null;
            return (
              <div className="min-w-40 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 font-medium">Failure #{p.rank}</div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">Time</span>
                  <span className="font-semibold tabular-nums">
                    {f0(p.t)} {unit}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">Median rank F</span>
                  <span className="font-semibold tabular-nums">{f2(p.F * 100)}%</span>
                </div>
              </div>
            );
          }}
        />
        <Line
          data={line}
          dataKey="fit"
          type="linear"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          legendType="none"
          tooltipType="none"
        />
        <Scatter
          data={fit.points}
          dataKey="y"
          fill="var(--foreground)"
          shape={(p: { cx?: number; cy?: number }) => (
            <circle
              cx={p.cx}
              cy={p.cy}
              r={4}
              fill="var(--background)"
              stroke="var(--foreground)"
              strokeWidth={1.75}
            />
          )}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={Math.log(b)}
          y={yOf(bPercent)}
          r={5}
          fill="var(--chart-1)"
          stroke="var(--background)"
          strokeWidth={2}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export type ReliabilityCurveProps = {
  beta: number;
  eta: number;
  unit?: string;
  /** Mark the B-life (default 0.1) */
  bPercent?: number;
  /** Optional mission time, e.g. the PM interval — shows R at that time */
  mission?: number;
  /** x-axis max (default 2.2 η) */
  max?: number;
  height?: number;
  className?: string;
};

/** Reliability curve R(t) = exp(−(t/η)^β) with B-life and an optional mission time / PM interval. */
export function ReliabilityCurve({
  beta,
  eta,
  unit = "h",
  bPercent = 0.1,
  mission,
  max,
  height = 260,
  className,
}: ReliabilityCurveProps) {
  const top = max ?? Math.ceil((eta * 2.2) / 500) * 500;
  const data = React.useMemo(
    () =>
      Array.from({ length: 61 }, (_, i) => {
        const t = (top * i) / 60;
        return { t, R: weibullReliability(t, beta, eta) * 100 };
      }),
    [beta, eta, top],
  );
  const b = bLife(bPercent, beta, eta);
  const gid = `rel-${React.useId().replace(/:/g, "")}`;
  const config = { R: { label: "Reliability", color: "var(--chart-1)" } } satisfies ChartConfig;
  const step = top / 4;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          type="number"
          dataKey="t"
          domain={[0, top]}
          ticks={[0, step, step * 2, step * 3, top]}
          tickFormatter={(v) => f0(v)}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload }) => {
            const p = active && (payload?.[0]?.payload as { t: number; R: number } | undefined);
            if (!p) return null;
            return (
              <div className="min-w-36 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 opacity-65">
                  t = {f0(p.t)} {unit}
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">R(t)</span>
                  <span className="font-semibold tabular-nums">{f2(p.R)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">F(t)</span>
                  <span className="font-semibold tabular-nums">{f2(100 - p.R)}%</span>
                </div>
              </div>
            );
          }}
        />
        <ReferenceLine
          x={b}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: `B${bPercent * 100} ${f0(b)} ${unit}`,
            position: "insideBottomRight",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        {mission != null && (
          <ReferenceLine
            x={mission}
            stroke="var(--foreground)"
            strokeDasharray="2 3"
            label={{
              value: `PM ${f0(mission)} ${unit} · R ${f2(weibullReliability(mission, beta, eta) * 100)}%`,
              position: "insideTopLeft",
              fontSize: 11,
              fill: "var(--foreground)",
            }}
          />
        )}
        <Area
          dataKey="R"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill={`url(#${gid})`}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={b}
          y={(1 - bPercent) * 100}
          r={5}
          fill="var(--chart-1)"
          stroke="var(--background)"
          strokeWidth={2}
        />
        {mission != null && (
          <ReferenceDot
            x={mission}
            y={weibullReliability(mission, beta, eta) * 100}
            r={4}
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth={1.75}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
