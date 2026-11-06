import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltipPanel } from "./chart-tooltip";
import { mean, niceDomain } from "./spc-stats";
import { cn } from "@/lib/utils";

export type DoeRun = Record<string, number>;
export type DoeFactor = {
  key: string;
  name: string;
  unit?: string;
  /** display order of levels, default sorted ascending */ levels?: number[];
};

const levelsOf = (runs: readonly DoeRun[], f: DoeFactor) =>
  f.levels ?? [...new Set(runs.map((r) => r[f.key]))].sort((a, b) => a - b);
const fmtLevel = (v: number, f: DoeFactor) => `${v}${f.unit ? ` ${f.unit}` : ""}`;

/** Mean response at each level of each factor, plus main effect (last level − first level). */
export function mainEffects(
  runs: readonly DoeRun[],
  factors: readonly DoeFactor[],
  response: string,
) {
  const grand = mean(runs.map((r) => r[response]));
  return {
    grand,
    factors: factors.map((f) => {
      const levels = levelsOf(runs, f).map((lv) => ({
        level: lv,
        label: fmtLevel(lv, f),
        mean: mean(runs.filter((r) => r[f.key] === lv).map((r) => r[response])),
      }));
      return { ...f, levels, effect: levels[levels.length - 1].mean - levels[0].mean };
    }),
  };
}

/**
 * Two-factor interaction for 2-level factors: AB = ½[(ȳ₊₊ − ȳ₋₊) − (ȳ₊₋ − ȳ₋₋)] (first index = A).
 * Also returns the cell means for the interaction plot (works for any number of levels).
 */
export function interactionEffect(
  runs: readonly DoeRun[],
  a: DoeFactor,
  b: DoeFactor,
  response: string,
) {
  const la = levelsOf(runs, a);
  const lb = levelsOf(runs, b);
  const cell = (x: number, y: number) =>
    mean(runs.filter((r) => r[a.key] === x && r[b.key] === y).map((r) => r[response]));
  const cells = la.map((x) => ({
    a: x,
    label: fmtLevel(x, a),
    ...Object.fromEntries(lb.map((y) => [fmtLevel(y, b), cell(x, y)])),
  }));
  const lo = (v: number[]) => v[0];
  const hi = (v: number[]) => v[v.length - 1];
  const effect =
    (cell(hi(la), hi(lb)) - cell(lo(la), hi(lb)) - (cell(hi(la), lo(lb)) - cell(lo(la), lo(lb)))) /
    2;
  return { effect, cells, traceLevels: lb.map((y) => fmtLevel(y, b)) };
}

/** All effects of a 2-level design sorted by |effect| — mains and 2-way interactions. */
export function doeEffects(
  runs: readonly DoeRun[],
  factors: readonly DoeFactor[],
  response: string,
) {
  const me = mainEffects(runs, factors, response).factors.map((f) => ({
    term: f.name,
    effect: f.effect,
  }));
  const ints: { term: string; effect: number }[] = [];
  for (let i = 0; i < factors.length; i++)
    for (let j = i + 1; j < factors.length; j++)
      ints.push({
        term: `${factors[i].name} × ${factors[j].name}`,
        effect: interactionEffect(runs, factors[i], factors[j], response).effect,
      });
  return [...me, ...ints].sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
}

export type MainEffectsPlotProps = {
  runs: readonly DoeRun[];
  factors: DoeFactor[];
  response: string;
  responseLabel?: string;
  unit?: string;
  decimals?: number;
  /** Factor drawn in blue (default: the largest |effect|) */
  highlight?: string | null;
  height?: number;
  className?: string;
};

/**
 * Main effects plot: one small panel per factor on a SHARED y-axis, mean response per level,
 * grand mean dashed. The steeper the line, the bigger the effect.
 */
export function MainEffectsPlot({
  runs,
  factors,
  response,
  responseLabel = "Mean",
  unit,
  decimals = 1,
  highlight,
  height = 220,
  className,
}: MainEffectsPlotProps) {
  const me = React.useMemo(() => mainEffects(runs, factors, response), [runs, factors, response]);
  const all = me.factors.flatMap((f) => f.levels.map((l) => l.mean));
  const ticks = niceDomain(Math.min(...all), Math.max(...all), 4);
  const top =
    highlight === undefined
      ? [...me.factors].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0]?.key
      : highlight;
  return (
    <div
      className={cn("grid gap-0", className)}
      style={{ gridTemplateColumns: `repeat(${factors.length}, minmax(0, 1fr))` }}
    >
      {me.factors.map((f, i) => {
        const sel = f.key === top;
        const color = sel ? "var(--chart-1)" : "var(--foreground)";
        const config = { mean: { label: responseLabel, color } } satisfies ChartConfig;
        return (
          <div key={f.key} className={cn("min-w-0", i > 0 && "border-l border-dashed")}>
            <div className="flex items-baseline justify-between gap-2 px-2 pb-1 text-[12.5px]">
              <span className={cn("truncate font-medium", sel && "text-highlight")}>{f.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {f.effect >= 0 ? "+" : "−"}
                {Math.abs(f.effect).toFixed(decimals)}
                {unit && ` ${unit}`}
              </span>
            </div>
            <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
              <LineChart
                data={f.levels}
                margin={{ top: 8, right: 14, left: i === 0 ? 0 : 6, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11.5}
                  padding={{ left: 18, right: 18 }}
                />
                <YAxis
                  hide={i > 0}
                  tickLine={false}
                  axisLine={false}
                  width={i === 0 ? 40 : 0}
                  domain={[ticks[0], ticks[ticks.length - 1]]}
                  ticks={ticks}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <ReferenceLine
                  y={me.grand}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={
                    <ChartTooltipPanel
                      unit={unit}
                      hideIndicator
                      valueFormatter={(v) => v.toFixed(decimals + 1)}
                    />
                  }
                />
                <Line
                  dataKey="mean"
                  name={responseLabel}
                  stroke={color}
                  strokeWidth={sel ? 2.25 : 1.5}
                  dot={{ r: 4, fill: "var(--card)", stroke: color, strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
        );
      })}
    </div>
  );
}

export type InteractionPlotProps = {
  runs: readonly DoeRun[];
  /** factor on the x-axis */
  x: DoeFactor;
  /** factor drawn as separate lines */
  trace: DoeFactor;
  response: string;
  unit?: string;
  decimals?: number;
  height?: number;
  className?: string;
};

/**
 * Interaction plot: mean response vs factor X, one line per level of the trace factor.
 * Parallel lines = no interaction; non-parallel or crossing = the effect of X depends on the trace factor.
 * Low level grey, high level blue (intermediate levels in categorical colors).
 */
export function InteractionPlot({
  runs,
  x,
  trace,
  response,
  unit,
  decimals = 1,
  height = 260,
  className,
}: InteractionPlotProps) {
  const ie = React.useMemo(
    () => interactionEffect(runs, x, trace, response),
    [runs, x, trace, response],
  );
  const vals = ie.cells.flatMap((c) =>
    ie.traceLevels.map((t) => (c as unknown as Record<string, number>)[t]),
  );
  const ticks = niceDomain(Math.min(...vals), Math.max(...vals), 4);
  const colors = ie.traceLevels.map((_, i) =>
    i === ie.traceLevels.length - 1
      ? "var(--chart-1)"
      : i === 0
        ? "var(--muted-foreground)"
        : ["var(--chart-4)", "var(--chart-3)", "var(--chart-5)"][(i - 1) % 3],
  );
  const config = Object.fromEntries(
    ie.traceLevels.map((t, i) => [t, { label: `${trace.name} ${t}`, color: colors[i] }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <LineChart data={ie.cells} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
          padding={{ left: 32, right: 32 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
          tickFormatter={(v: number) => v.toFixed(0)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipPanel
              unit={unit}
              labelFormatter={(l) => `${x.name} ${l}`}
              valueFormatter={(v) => v.toFixed(decimals + 1)}
            />
          }
        />
        {ie.traceLevels.map((t, i) => (
          <Line
            key={t}
            dataKey={t}
            name={`${trace.name} ${t}`}
            stroke={colors[i]}
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--card)", stroke: colors[i], strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
