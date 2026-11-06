"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type RadarAxis = {
  /** Axis label, e.g. "Sort (Seiri)" */
  axis: string;
  actual: number;
  target?: number;
  /** Previous audit / period, drawn as a grey polygon */
  previous?: number;
};

export type RadarScoreChartProps = {
  data: RadarAxis[];
  /** Scale maximum (5 for a 0–5 audit, 100 for %) */
  max: number;
  /** Scale minimum; use e.g. 50 for OEE factors so the differences are visible */
  min?: number;
  unit?: string;
  /** Number of grid rings */
  rings?: number;
  labels?: { actual?: string; target?: string; previous?: string };
  valueFormatter?: (v: number) => string;
  height?: number;
  className?: string;
};

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Radar / spider chart for balanced scores: 5S audit by S, OEE availability / performance / quality, lean maturity.
 * Actual = blue filled polygon, target = dashed outline, previous = grey polygon. 3–8 axes on one scale.
 */
export function RadarScoreChart({
  data,
  max,
  min = 0,
  unit,
  rings = 5,
  labels,
  valueFormatter = fmt,
  height = 300,
  className,
}: RadarScoreChartProps) {
  const hasTarget = data.some((d) => d.target != null);
  const hasPrev = data.some((d) => d.previous != null);
  const l = { actual: "Actual", target: "Target", previous: "Previous", ...labels };
  const config = {
    actual: { label: l.actual, color: "var(--chart-1)" },
    target: { label: l.target, color: "var(--foreground)" },
    previous: { label: l.previous, color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("mx-auto aspect-auto w-full", className)}
      style={{ height }}
    >
      <RadarChart data={data} outerRadius="76%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid gridType="polygon" stroke="var(--input)" strokeOpacity={0.9} />
        <PolarRadiusAxis
          domain={[min, max]}
          tickCount={rings + 1}
          angle={90}
          tick={false}
          axisLine={false}
        />
        <PolarAngleAxis
          dataKey="axis"
          tick={(p: {
            x?: number | string;
            y?: number | string;
            textAnchor?: string;
            payload?: { value?: string; index?: number };
          }) => {
            const d = data[p.payload?.index ?? 0];
            return (
              <g>
                <text
                  x={Number(p.x)}
                  y={Number(p.y)}
                  textAnchor={p.textAnchor as "start" | "middle" | "end"}
                  className="fill-muted-foreground"
                  fontSize={11.5}
                >
                  {p.payload?.value}
                </text>
                <text
                  x={Number(p.x)}
                  y={Number(p.y) + 14}
                  textAnchor={p.textAnchor as "start" | "middle" | "end"}
                  className="fill-foreground"
                  fontSize={12}
                  fontWeight={600}
                >
                  {d ? valueFormatter(d.actual) : ""}
                  {unit && d ? unit : ""}
                </text>
              </g>
            );
          }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            const row = active && (payload?.[0]?.payload as RadarAxis | undefined);
            if (!row) return null;
            const gap = row.target != null ? row.actual - row.target : null;
            return (
              <div className="min-w-40 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 text-[11.5px] opacity-65">{row.axis}</div>
                <div className="grid gap-1">
                  {[
                    { k: l.actual, v: row.actual, c: "var(--chart-1)" },
                    ...(row.target != null
                      ? [{ k: l.target, v: row.target, c: "var(--background)" }]
                      : []),
                    ...(row.previous != null
                      ? [{ k: l.previous, v: row.previous, c: "var(--chart-base)" }]
                      : []),
                  ].map((r) => (
                    <div key={r.k} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-[3px]" style={{ background: r.c }} />
                      <span className="opacity-65">{r.k}</span>
                      <span className="ml-auto pl-3 font-semibold tabular-nums">
                        {valueFormatter(r.v)}
                        {unit}
                      </span>
                    </div>
                  ))}
                </div>
                {gap != null && (
                  <div className="mt-1.5 border-t border-background/15 pt-1.5 opacity-80">
                    {gap >= 0 ? "On target" : `Gap ${valueFormatter(gap)}${unit ?? ""}`}
                  </div>
                )}
              </div>
            );
          }}
        />
        {hasPrev && (
          <Radar
            dataKey="previous"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            fill="var(--chart-base)"
            fillOpacity={0.55}
            isAnimationActive={false}
          />
        )}
        <Radar
          dataKey="actual"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="var(--chart-1)"
          fillOpacity={0.18}
          dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
        {hasTarget && (
          <Radar
            dataKey="target"
            stroke="var(--foreground)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
            isAnimationActive={false}
          />
        )}
      </RadarChart>
    </ChartContainer>
  );
}
