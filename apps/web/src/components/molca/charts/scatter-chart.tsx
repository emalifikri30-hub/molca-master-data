import * as React from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { linearRegression, niceDomain } from "./spc-stats";
import { cn } from "@/lib/utils";

export type ScatterPoint = { id: string; x: number; y: number; label?: string };

export type RegressionScatterProps = {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  xDecimals?: number;
  yDecimals?: number;
  /** Least-squares line across the x range */
  regression?: boolean;
  /** Shaded operating window / spec region */
  region?: { x1?: number; x2?: number; y1?: number; y2?: number; label?: string };
  /** Quadrant split lines, e.g. at the means or at targets */
  quadrants?: { x?: number; y?: number };
  /** Points above this y (a limit on a "bad" metric) are drawn red */
  yLimit?: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number;
  className?: string;
};

type Row = ScatterPoint & { bad: boolean };

/**
 * Scatter with optional regression line, operating window and quadrants.
 * Points are grey context, the selected point is blue, points beyond `yLimit` are red.
 */
export function RegressionScatter({
  points,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  xDecimals = 0,
  yDecimals = 1,
  regression = true,
  region,
  quadrants,
  yLimit,
  selectedId,
  onSelect,
  height = 300,
  className,
}: RegressionScatterProps) {
  const fit = React.useMemo(() => linearRegression(points), [points]);
  const rows: Row[] = points.map((p) => ({ ...p, bad: yLimit != null && p.y > yLimit }));
  const xs = points.map((p) => p.x);
  const ys = [...points.map((p) => p.y), yLimit, region?.y1, region?.y2].filter(
    (v): v is number => v != null,
  );
  const pad = (a: number[]) => (Math.max(...a) - Math.min(...a)) * 0.06 || 1;
  const xt = niceDomain(Math.min(...xs) - pad(xs), Math.max(...xs) + pad(xs), 6);
  const yt = niceDomain(Math.min(0, Math.min(...ys)), Math.max(...ys) + pad(ys), 5);
  const xDom: [number, number] = [xt[0], xt[xt.length - 1]];
  const yDom: [number, number] = [yt[0], yt[yt.length - 1]];
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const fx = (v: number) => v.toFixed(xDecimals);
  const fy = (v: number) => v.toFixed(yDecimals);
  const config = { y: { label: yLabel, color: "var(--chart-1)" } } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ScatterChart margin={{ top: 12, right: 12, left: 0, bottom: 18 }}>
        <CartesianGrid strokeDasharray="4 4" />
        <XAxis
          type="number"
          dataKey="x"
          domain={xDom}
          ticks={xt}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={fx}
          label={{
            value: `${xLabel}${xUnit ? ` (${xUnit})` : ""}`,
            position: "insideBottom",
            offset: -12,
            fontSize: 12,
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={yDom}
          ticks={yt}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={fy}
          label={{
            value: `${yLabel}${yUnit ? ` (${yUnit})` : ""}`,
            angle: -90,
            position: "insideLeft",
            offset: 12,
            fontSize: 12,
            fill: "var(--muted-foreground)",
            style: { textAnchor: "middle" },
          }}
        />
        {region && (
          <ReferenceArea
            x1={region.x1 ?? xDom[0]}
            x2={region.x2 ?? xDom[1]}
            y1={region.y1 ?? yDom[0]}
            y2={region.y2 ?? yDom[1]}
            fill="var(--chart-1)"
            fillOpacity={0.07}
            stroke="var(--chart-1)"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
            label={
              region.label
                ? {
                    value: region.label,
                    position: "insideTopLeft",
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                  }
                : undefined
            }
          />
        )}
        {quadrants?.x != null && (
          <ReferenceLine
            x={quadrants.x}
            stroke="var(--muted-foreground)"
            strokeDasharray="1 3"
            strokeWidth={1.5}
          />
        )}
        {quadrants?.y != null && (
          <ReferenceLine
            y={quadrants.y}
            stroke="var(--muted-foreground)"
            strokeDasharray="1 3"
            strokeWidth={1.5}
          />
        )}
        {yLimit != null && (
          <ReferenceLine
            y={yLimit}
            stroke="var(--danger)"
            strokeOpacity={0.85}
            strokeDasharray="5 4"
            label={{
              value: `Limit ${fy(yLimit)}`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
        )}
        {regression && (
          <ReferenceLine
            segment={[
              { x: xmin, y: fit.predict(xmin) },
              { x: xmax, y: fit.predict(xmax) },
            ]}
            stroke="var(--foreground)"
            strokeOpacity={0.75}
            strokeWidth={1.5}
            ifOverflow="hidden"
          />
        )}
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as Row | undefined);
            if (!r) return null;
            const resid = r.y - fit.predict(r.x);
            return (
              <div className="min-w-44 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 font-medium">{r.label ?? r.id}</div>
                <Line label={xLabel} value={fx(r.x)} unit={xUnit} />
                <Line label={yLabel} value={fy(r.y)} unit={yUnit} />
                {regression && (
                  <Line
                    label="Residual"
                    value={`${resid >= 0 ? "+" : ""}${fy(resid)}`}
                    unit={yUnit}
                  />
                )}
                {r.bad && <div className="mt-1 font-medium text-danger">Above limit</div>}
              </div>
            );
          }}
        />
        <Scatter
          data={rows}
          isAnimationActive={false}
          onClick={
            onSelect
              ? (d: unknown) => {
                  const id = (d as { payload?: Row })?.payload?.id ?? (d as Row)?.id;
                  if (id) onSelect(id === selectedId ? null : id);
                }
              : undefined
          }
          shape={(props: unknown) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: Row };
            const sel = payload.id === selectedId;
            return (
              <g style={onSelect ? { cursor: "pointer" } : undefined}>
                {sel && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={sel ? 5.5 : 4.5}
                  fill={
                    sel
                      ? "var(--chart-1)"
                      : payload.bad
                        ? "var(--danger)"
                        : "var(--muted-foreground)"
                  }
                  fillOpacity={sel || payload.bad ? 1 : 0.45}
                  stroke="var(--card)"
                  strokeWidth={1.25}
                />
              </g>
            );
          }}
        />
      </ScatterChart>
    </ChartContainer>
  );
}

function Line({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-65">{label}</span>
      <span className="font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
      </span>
    </div>
  );
}

/** Plain-language strength of a Pearson r (|r| ≥ 0.7 strong, ≥ 0.4 moderate, ≥ 0.2 weak). */
export const correlationStrength = (r: number) => {
  const a = Math.abs(r);
  const s = a >= 0.7 ? "Strong" : a >= 0.4 ? "Moderate" : a >= 0.2 ? "Weak" : "No";
  return `${s} ${a >= 0.2 ? (r < 0 ? "negative" : "positive") : ""} correlation`
    .replace(/\s+/g, " ")
    .trim();
};

export { linearRegression };
