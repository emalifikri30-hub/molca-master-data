"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceMax } from "./highlight-bar-chart";
import { cn } from "@/lib/utils";

export type ReliabilityPeriod = {
  period: string;
  /** Operating (run) time in hours — excludes planned downtime and idle */
  operatingHours: number;
  /** Number of breakdowns (unplanned stops above the breakdown threshold) */
  failures: number;
  /** Total repair time in minutes (from breakdown to restart) */
  repairMinutes: number;
};

/** MTBF = operating time ÷ number of failures (hours). */
export const mtbf = (operatingHours: number, failures: number) =>
  failures > 0 ? operatingHours / failures : operatingHours;
/** MTTR = total repair time ÷ number of repairs (minutes). */
export const mttr = (repairMinutes: number, failures: number) =>
  failures > 0 ? repairMinutes / failures : 0;
/** Inherent availability Ai = MTBF ÷ (MTBF + MTTR), both in hours. */
export const inherentAvailability = (mtbfHours: number, mttrMinutes: number) =>
  mtbfHours / (mtbfHours + mttrMinutes / 60);

type Row = ReliabilityPeriod & { mtbf: number; mttr: number };
const toRows = (data: ReliabilityPeriod[]): Row[] =>
  data.map((d) => ({
    ...d,
    mtbf: mtbf(d.operatingHours, d.failures),
    mttr: mttr(d.repairMinutes, d.failures),
  }));
const f1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

function Tip({ r }: { r: Row }) {
  return (
    <div className="min-w-44 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      <div className="mb-1 font-medium">{r.period}</div>
      {[
        ["MTBF", `${f1(r.mtbf)} h`],
        ["MTTR", `${f1(r.mttr)} min`],
        ["Failures", String(r.failures)],
        ["Operating time", `${f1(r.operatingHours)} h`],
        ["Availability (Ai)", `${f1(inherentAvailability(r.mtbf, r.mttr) * 100)}%`],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="opacity-65">{k}</span>
          <span className="font-semibold tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

export type MtbfMttrTrendProps = {
  data: ReliabilityPeriod[];
  /** MTBF target in hours (higher is better) */
  mtbfTarget?: number;
  /** MTTR target in minutes (lower is better) */
  mttrTarget?: number;
  /**
   * "linked" (default): two stacked charts sharing the x-axis and tooltip — MTBF bars on top, MTTR line below.
   * "dual": one chart, MTBF bars on the left axis and MTTR line on the right axis.
   */
  variant?: "linked" | "dual";
  /** Highlight the last period in blue (default true) */
  highlightLast?: boolean;
  height?: number;
  className?: string;
};

/** MTBF / MTTR trend. MTBF should go up, MTTR should go down — both computed from raw operating time, failures and repair time. */
export function MtbfMttrTrend({
  data,
  mtbfTarget,
  mttrTarget,
  variant = "linked",
  highlightLast = true,
  height = 300,
  className,
}: MtbfMttrTrendProps) {
  const rows = React.useMemo(() => toRows(data), [data]);
  const id = React.useId();
  const bMax = niceMax(Math.max(...rows.map((r) => r.mtbf), mtbfTarget ?? 0));
  const rMax = niceMax(Math.max(...rows.map((r) => r.mttr), mttrTarget ?? 0));
  const config = {
    mtbf: { label: "MTBF", color: "var(--chart-1)" },
    mttr: { label: "MTTR", color: "var(--foreground)" },
  } satisfies ChartConfig;
  const fill = (i: number) =>
    highlightLast && i === rows.length - 1 ? "var(--chart-1)" : "var(--chart-base)";
  const tooltip = (
    <ChartTooltip
      cursor={{ fill: "var(--muted)", radius: 8 }}
      content={({ active, payload }) =>
        active && payload?.[0] ? <Tip r={payload[0].payload as Row} /> : null
      }
    />
  );
  const targetLabel = (v: string) => ({
    value: v,
    position: "insideTopLeft" as const,
    fontSize: 11,
    fill: "var(--muted-foreground)",
  });
  const lineDot = {
    r: 3,
    fill: "var(--background)",
    stroke: "var(--foreground)",
    strokeWidth: 1.5,
  };

  if (variant === "dual")
    return (
      <ChartContainer
        config={config}
        className={cn("aspect-auto w-full", className)}
        style={{ height }}
      >
        <ComposedChart
          data={rows}
          margin={{ top: 16, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis
            yAxisId="b"
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, bMax]}
            ticks={[0, bMax / 4, bMax / 2, (bMax * 3) / 4, bMax]}
            tickFormatter={(v) => `${v} h`}
          />
          <YAxis
            yAxisId="r"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, rMax]}
            ticks={[0, rMax / 4, rMax / 2, (rMax * 3) / 4, rMax]}
            tickFormatter={(v) => `${v} min`}
          />
          {tooltip}
          {mtbfTarget != null && (
            <ReferenceLine
              yAxisId="b"
              y={mtbfTarget}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={targetLabel(`MTBF target ${mtbfTarget} h`)}
            />
          )}
          <Bar
            yAxisId="b"
            dataKey="mtbf"
            name="MTBF"
            radius={[5, 5, 2, 2]}
            maxBarSize={56}
            isAnimationActive={false}
          >
            {rows.map((r, i) => (
              <Cell key={r.period} fill={fill(i)} />
            ))}
          </Bar>
          <Line
            yAxisId="r"
            dataKey="mttr"
            name="MTTR"
            stroke="var(--foreground)"
            strokeWidth={1.75}
            dot={lineDot}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    );

  const top = Math.round(height * 0.56);
  const bottom = height - top;
  return (
    <div className={cn("grid w-full gap-1", className)}>
      <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">MTBF · h</span>
        <span>higher is better</span>
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: top }}>
        <BarChart
          data={rows}
          syncId={id}
          margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="period" hide />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, bMax]}
            ticks={[0, bMax / 4, bMax / 2, (bMax * 3) / 4, bMax]}
          />
          {tooltip}
          {mtbfTarget != null && (
            <ReferenceLine
              y={mtbfTarget}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={targetLabel(`Target ≥ ${mtbfTarget} h`)}
            />
          )}
          <Bar
            dataKey="mtbf"
            name="MTBF"
            radius={[5, 5, 2, 2]}
            maxBarSize={56}
            isAnimationActive={false}
          >
            {rows.map((r, i) => (
              <Cell key={r.period} fill={fill(i)} />
            ))}
            <LabelList
              dataKey="mtbf"
              position="top"
              offset={6}
              formatter={(v) => f1(Number(v))}
              className="fill-foreground text-[11px] font-medium tabular-nums"
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex items-baseline justify-between text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">MTTR · min</span>
        <span>lower is better</span>
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: bottom }}>
        <LineChart data={rows} syncId={id} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={10} scale="band" />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, rMax]}
            ticks={[0, rMax / 2, rMax]}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={({ active, payload }) =>
              active && payload?.[0] ? <Tip r={payload[0].payload as Row} /> : null
            }
          />
          {mttrTarget != null && (
            <ReferenceLine
              y={mttrTarget}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={targetLabel(`Target ≤ ${mttrTarget} min`)}
            />
          )}
          <Line
            dataKey="mttr"
            name="MTTR"
            stroke="var(--foreground)"
            strokeWidth={1.75}
            dot={lineDot}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="mttr"
              position="top"
              offset={8}
              formatter={(v) => f1(Number(v))}
              className="fill-foreground text-[11px] font-medium tabular-nums"
            />
          </Line>
        </LineChart>
      </ChartContainer>
    </div>
  );
}

export type MachineReliability = {
  machine: string;
  line?: string;
  operatingHours: number;
  failures: number;
  repairMinutes: number;
};

export type ReliabilityRankingProps = {
  machines: MachineReliability[];
  mtbfTarget?: number;
  mttrTarget?: number;
  /** Show at most this many machines (worst first) */
  limit?: number;
  className?: string;
};

/** Per-machine ranking, worst MTBF first. This ranks a loss (breakdowns), so the worst machine is full red, other below-target machines a lighter red, the rest grey. */
export function ReliabilityRanking({
  machines,
  mtbfTarget,
  mttrTarget,
  limit = 8,
  className,
}: ReliabilityRankingProps) {
  const rows = React.useMemo(
    () =>
      machines
        .map((m) => {
          const b = mtbf(m.operatingHours, m.failures);
          const r = mttr(m.repairMinutes, m.failures);
          return { ...m, mtbf: b, mttr: r, ai: inherentAvailability(b, r) };
        })
        .sort((a, b) => a.mtbf - b.mtbf)
        .slice(0, limit),
    [machines, limit],
  );
  const max = niceMax(Math.max(...rows.map((r) => r.mtbf), mtbfTarget ?? 0));
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[520px] table-fixed text-[13px]">
        <caption className="sr-only">Machines ranked by MTBF, lowest first</caption>
        <thead className="text-[12px] text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 text-left font-medium">
              Machine
            </th>
            <th scope="col" className="w-[34%] py-2 pr-3 text-left font-medium">
              MTBF
            </th>
            <th scope="col" className="w-20 py-2 pr-3 text-right font-medium">
              MTTR
            </th>
            <th scope="col" className="w-16 py-2 pr-3 text-right font-medium">
              Failures
            </th>
            <th
              scope="col"
              className="w-14 py-2 text-right font-medium"
              title="Inherent availability"
            >
              Ai
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const badB = mtbfTarget != null && r.mtbf < mtbfTarget;
            const badR = mttrTarget != null && r.mttr > mttrTarget;
            return (
              <tr key={r.machine} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="max-w-0 py-1.5 pr-3 text-left font-normal"
                  title={r.line ? `${r.machine} · ${r.line}` : r.machine}
                >
                  <div className="truncate">
                    <span className="font-medium">{r.machine}</span>
                    {r.line && <span className="text-muted-foreground"> · {r.line}</span>}
                  </div>
                </th>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative h-2 flex-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.mtbf / max) * 100}%`,
                          background:
                            i === 0
                              ? "var(--sys-red)"
                              : badB
                                ? "color-mix(in srgb, var(--sys-red) 45%, var(--card))"
                                : "var(--chart-base)",
                        }}
                      />
                      {mtbfTarget != null && (
                        <div
                          className="absolute -inset-y-1 w-px bg-muted-foreground"
                          style={{ left: `${(mtbfTarget / max) * 100}%` }}
                          aria-hidden
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right font-medium whitespace-nowrap tabular-nums",
                        badB && "text-danger",
                      )}
                    >
                      {f1(r.mtbf)} h
                    </span>
                  </div>
                </td>
                <td
                  className={cn(
                    "py-1.5 pr-3 text-right whitespace-nowrap tabular-nums",
                    badR && "font-medium text-danger",
                  )}
                >
                  {f1(r.mttr)} min
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.failures}</td>
                <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                  {f1(r.ai * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
