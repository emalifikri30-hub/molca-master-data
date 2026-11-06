"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltipPanel } from "./chart-tooltip";
import { cn } from "@/lib/utils";
import { axisWidth, CategoryTick } from "./svg-chart";

export type HighlightBarChartProps<T extends Record<string, unknown>> = {
  data: T[];
  /** Category key (x axis) */
  xKey: keyof T & string;
  /** Value key (bar height) */
  yKey: keyof T & string;
  /** Index of the highlighted bar. Uncontrolled default: the last bar. */
  highlight?: number;
  defaultHighlight?: number;
  /** Click a bar to move the highlight */
  onHighlightChange?: (index: number) => void;
  /** Series name in the tooltip */
  name?: string;
  unit?: string;
  /** Y axis tick formatter, e.g. v => `${v / 1000}K` */
  tickFormatter?: (v: number) => string;
  height?: number;
  /** Show the soft column behind the highlighted bar */
  showColumn?: boolean;
  className?: string;
};

/** Round a max value up so 4 even ticks land on 1 / 2 / 2.5 / 5 × 10ⁿ steps. */
export function niceMax(max: number, ticks = 4) {
  if (!(max > 0)) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  return step * ticks;
}

/**
 * Bar chart with grey context bars and ONE blue highlight (var(--chart-1)).
 * Dashed horizontal grid, rounded tops, dark tooltip. Click a bar to move the highlight.
 */
export function HighlightBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  highlight,
  defaultHighlight,
  onHighlightChange,
  name = "Value",
  unit,
  tickFormatter,
  height = 240,
  showColumn = true,
  className,
}: HighlightBarChartProps<T>) {
  const [inner, setInner] = React.useState(defaultHighlight ?? data.length - 1);
  const hi = highlight ?? inner;
  const config = { [yKey]: { label: name, color: "var(--chart-1)" } } satisfies ChartConfig;
  const top = niceMax(Math.max(0, ...data.map((d) => Number(d[yKey]) || 0)));
  const yTicks = [0, 1, 2, 3, 4].map((k) => +((top / 4) * k).toFixed(6));
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <BarChart
        data={data as Record<string, unknown>[]}
        margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey={xKey as string}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          interval={0}
          height={44}
          tick={<CategoryTick />}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={axisWidth(yTicks, tickFormatter)}
          tickMargin={6}
          tickFormatter={tickFormatter}
          ticks={yTicks}
          domain={[0, yTicks[yTicks.length - 1]]}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipPanel unit={unit} hideIndicator />} />
        <Bar
          dataKey={yKey as string}
          name={name}
          radius={[6, 6, 2, 2]}
          className="cursor-pointer"
          background={(p: {
            index?: number;
            x?: number | string;
            y?: number | string;
            width?: number | string;
            height?: number | string;
          }) =>
            showColumn && p.index === hi ? (
              <rect
                x={Number(p.x) - 6}
                y={Number(p.y)}
                width={Number(p.width) + 12}
                height={Number(p.height)}
                rx={8}
                fill="var(--chart-1)"
                fillOpacity={0.09}
              />
            ) : (
              <g />
            )
          }
          onClick={(_, i) => {
            setInner(i);
            onHighlightChange?.(i);
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={i === hi ? "var(--chart-1)" : "var(--chart-base)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
