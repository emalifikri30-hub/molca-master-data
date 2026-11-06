"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceMax } from "./highlight-bar-chart";
import { cn } from "@/lib/utils";
import { CategoryTick } from "./svg-chart";

export type ParetoItem = { label: string; value: number };

export type ParetoChartProps = {
  items: ParetoItem[];
  unit?: string;
  /** Cumulative share that separates the "vital few" (blue) from the rest (grey). Default 80. */
  threshold?: number;
  /**
   * What the bars measure. "loss" (default: downtime, scrap, defects) emphasizes the vital few in red;
   * "neutral" (e.g. ideas by category, requests by type) uses the blue highlight.
   */
  tone?: "loss" | "neutral";
  /** Group the smallest items into "Other" once there are more than this many categories */
  maxBars?: number;
  height?: number;
  tickFormatter?: (v: number) => string;
  className?: string;
};

type Row = ParetoItem & { cum: number; share: number; vital: boolean };

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Sort descending, optionally fold the tail into "Other", and add cumulative %. */
export function paretoRows(items: ParetoItem[], threshold = 80, maxBars = 10): Row[] {
  let sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length > maxBars) {
    const head = sorted.slice(0, maxBars - 1);
    const rest = sorted.slice(maxBars - 1).reduce((s, i) => s + i.value, 0);
    sorted = [...head, { label: "Other", value: rest }];
  }
  const total = sorted.reduce((s, i) => s + i.value, 0) || 1;
  let run = 0;
  let reached = false;
  return sorted.map((i) => {
    const before = run;
    run += i.value;
    const cum = (run / total) * 100;
    // an item is "vital" while the cumulative share before it is still under the threshold
    const vital = !reached && (before / total) * 100 < threshold && i.label !== "Other";
    if (cum >= threshold) reached = true;
    return { ...i, cum, share: (i.value / total) * 100, vital };
  });
}

/**
 * Pareto: categories sorted descending (bars) with the cumulative share (line, right axis) and an 80% reference.
 * The "vital few" that make up the first ~80% are emphasized (red for losses, blue for neutral measures); the "trivial many" are grey.
 */
export function ParetoChart({
  items,
  unit,
  threshold = 80,
  maxBars = 10,
  tone = "loss",
  height = 300,
  tickFormatter,
  className,
}: ParetoChartProps) {
  const emphasis = tone === "loss" ? "var(--sys-red)" : "var(--chart-1)";
  const rows = React.useMemo(
    () => paretoRows(items, threshold, maxBars),
    [items, threshold, maxBars],
  );
  const max = Math.max(...rows.map((r) => r.value));
  const config = {
    value: { label: "Value", color: "var(--chart-1)" },
    cum: { label: "Cumulative", color: "var(--foreground)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ComposedChart
        data={rows}
        margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
        barCategoryGap="16%"
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          interval={0}
          height={44}
          tick={<CategoryTick />}
        />
        <YAxis
          yAxisId="v"
          tickLine={false}
          axisLine={false}
          width={44}
          tickCount={5}
          domain={[0, niceMax(max)]}
          tickFormatter={tickFormatter}
        />
        <YAxis
          yAxisId="p"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ReferenceLine
          yAxisId="p"
          y={threshold}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: `${threshold}%`,
            position: "insideTopRight",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as Row | undefined);
            if (!r) return null;
            return (
              <div className="min-w-40 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 font-medium">{r.label}</div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">Value</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(r.value)}
                    {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">Share</span>
                  <span className="font-semibold tabular-nums">{fmt(r.share)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="opacity-65">Cumulative</span>
                  <span className="font-semibold tabular-nums">{fmt(r.cum)}%</span>
                </div>
              </div>
            );
          }}
        />
        <Bar
          yAxisId="v"
          dataKey="value"
          name="Value"
          radius={[5, 5, 2, 2]}
          isAnimationActive={false}
        >
          {rows.map((r) => (
            <Cell key={r.label} fill={r.vital ? emphasis : "var(--chart-base)"} />
          ))}
        </Bar>
        <Line
          yAxisId="p"
          dataKey="cum"
          name="Cumulative"
          type="monotone"
          stroke="var(--foreground)"
          strokeWidth={1.75}
          dot={{ r: 3, fill: "var(--background)", stroke: "var(--foreground)", strokeWidth: 1.5 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
