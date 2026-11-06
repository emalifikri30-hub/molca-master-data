"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceMax } from "./highlight-bar-chart";
import { cn } from "@/lib/utils";

export type HourSlot = {
  /** Hour label, e.g. "06–07" */
  hour: string;
  /** Planned output for the full hour (already net of breaks) */
  plan: number;
  /** Actual output. Leave undefined for hours that have not started. */
  actual?: number;
  /** Reason code for a miss, e.g. "R12 · Jam at case erector" */
  reason?: string;
  /** Planned break or other note shown in the board, e.g. "Break 30 min" */
  note?: string;
};

export type HourRow = HourSlot & {
  index: number;
  /** Plan up to now: the full plan for past hours, pro-rated for the current hour, 0 for future hours */
  planToNow: number;
  gap: number | null;
  cumPlan: number;
  cumPlanToNow: number;
  cumActual: number | null;
  cumGap: number | null;
  state: "met" | "missed" | "current" | "future";
};

/**
 * Compute cumulative plan / actual and gaps. The current hour's plan is pro-rated by `progress`
 * (0–1, minutes elapsed / 60) so the gap is fair while the hour is still running.
 */
export function hourByHourRows(slots: HourSlot[], current?: number, progress = 1): HourRow[] {
  let cumPlan = 0;
  let cumPlanToNow = 0;
  let cumActual = 0;
  return slots.map((s, index) => {
    const isCurrent = index === current;
    const isFuture = current != null ? index > current : s.actual == null;
    const planToNow = isFuture ? 0 : isCurrent ? Math.round(s.plan * progress) : s.plan;
    cumPlan += s.plan;
    cumPlanToNow += planToNow;
    const hasActual = !isFuture && s.actual != null;
    if (hasActual) cumActual += s.actual!;
    const gap = hasActual ? s.actual! - planToNow : null;
    return {
      ...s,
      index,
      planToNow,
      gap,
      cumPlan,
      cumPlanToNow,
      cumActual: hasActual ? cumActual : null,
      cumGap: hasActual ? cumActual - cumPlanToNow : null,
      state: isFuture
        ? "future"
        : isCurrent
          ? "current"
          : gap != null && gap < 0
            ? "missed"
            : "met",
    };
  });
}

/** Shift totals: plan for the whole shift, plan to now, actual, gap and attainment %. */
export function hourByHourTotals(rows: HourRow[]) {
  const last = [...rows].reverse().find((r) => r.cumActual != null);
  const plan = rows.at(-1)?.cumPlan ?? 0;
  const planToNow = last?.cumPlanToNow ?? 0;
  const actual = last?.cumActual ?? 0;
  return {
    plan,
    planToNow,
    actual,
    gap: actual - planToNow,
    attainment: planToNow ? (actual / planToNow) * 100 : 0,
    missedHours: rows.filter((r) => r.state === "missed").length,
  };
}

const fmt = (v: number) => v.toLocaleString("en-US");
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : "0");

const barColor = (r: HourRow) =>
  r.state === "current"
    ? "var(--chart-1)"
    : r.state === "missed"
      ? "var(--st-unplanned)"
      : "var(--st-run)";

export type HourByHourChartProps = {
  slots: HourSlot[];
  /** Index of the hour in progress */
  current?: number;
  /** Fraction of the current hour elapsed (0–1) */
  progress?: number;
  unit?: string;
  /** Show the cumulative plan / actual lines on the right axis */
  cumulative?: boolean;
  height?: number;
  className?: string;
};

/**
 * Hour-by-hour production chart: plan (grey) vs actual per hour — green when the hour met plan,
 * red when it missed, blue for the hour in progress — with cumulative plan (dashed) and actual (solid) on the right axis.
 */
export function HourByHourChart({
  slots,
  current,
  progress = 1,
  unit = "pcs",
  cumulative = true,
  height = 300,
  className,
}: HourByHourChartProps) {
  const rows = React.useMemo(
    () => hourByHourRows(slots, current, progress),
    [slots, current, progress],
  );
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.plan, r.actual ?? 0))));
  const cumMax = niceMax(rows.at(-1)?.cumPlan ?? 1);
  const config = {
    plan: { label: "Plan", color: "var(--chart-base)" },
    actual: { label: "Actual", color: "var(--st-run)" },
    cumPlan: { label: "Cum. plan", color: "var(--muted-foreground)" },
    cumActual: { label: "Cum. actual", color: "var(--foreground)" },
  } satisfies ChartConfig;
  const cur = current != null ? rows[current] : undefined;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <ComposedChart
        data={rows}
        margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
        barGap={3}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        {cur && (
          <ReferenceArea
            yAxisId="h"
            x1={cur.hour}
            x2={cur.hour}
            fill="var(--highlight-soft)"
            fillOpacity={1}
            strokeOpacity={0}
            ifOverflow="extendDomain"
            label={{ value: "Now", position: "insideTop", fontSize: 11, fill: "var(--highlight)" }}
          />
        )}
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          interval={0}
          fontSize={11.5}
        />
        <YAxis
          yAxisId="h"
          tickLine={false}
          axisLine={false}
          width={40}
          tickCount={5}
          domain={[0, max]}
        />
        {cumulative && (
          <YAxis
            yAxisId="c"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={44}
            tickCount={5}
            domain={[0, cumMax]}
          />
        )}
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as HourRow | undefined);
            if (!r) return null;
            return (
              <div className="min-w-44 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 font-medium">
                  {r.hour}
                  {r.state === "current" && <span className="ml-1.5 opacity-65">in progress</span>}
                </div>
                <TipRow
                  label={r.state === "current" ? "Plan to now" : "Plan"}
                  value={`${fmt(r.state === "future" ? r.plan : r.planToNow)} ${unit}`}
                />
                {r.actual != null && r.state !== "future" && (
                  <TipRow label="Actual" value={`${fmt(r.actual)} ${unit}`} />
                )}
                {r.gap != null && <TipRow label="Gap" value={signed(r.gap)} />}
                {r.cumGap != null && <TipRow label="Cum. gap" value={signed(r.cumGap)} />}
                {r.reason && (
                  <div className="mt-1.5 border-t border-background/15 pt-1.5 opacity-80">
                    {r.reason}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar
          yAxisId="h"
          dataKey="plan"
          name="Plan"
          fill="var(--chart-base)"
          radius={[4, 4, 2, 2]}
          isAnimationActive={false}
        />
        <Bar
          yAxisId="h"
          dataKey={(r: HourRow) => (r.state === "future" ? null : r.actual)}
          name="Actual"
          radius={[4, 4, 2, 2]}
          isAnimationActive={false}
        >
          {rows.map((r) => (
            <Cell key={r.hour} fill={barColor(r)} />
          ))}
        </Bar>
        {cumulative && (
          <Line
            yAxisId="c"
            dataKey="cumPlan"
            name="Cum. plan"
            type="linear"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {cumulative && (
          <Line
            yAxisId="c"
            dataKey="cumActual"
            name="Cum. actual"
            type="linear"
            stroke="var(--foreground)"
            strokeWidth={1.75}
            dot={{ r: 3, fill: "var(--background)", stroke: "var(--foreground)", strokeWidth: 1.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-65">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export type HourByHourBoardProps = {
  slots: HourSlot[];
  current?: number;
  progress?: number;
  unit?: string;
  /** Hide the cumulative columns on narrow screens */
  compact?: boolean;
  className?: string;
};

/**
 * The classic TPS hour-by-hour board as a table: hour, plan, actual, gap, cumulative plan / actual / gap
 * and the reason for every missed hour. The current hour is highlighted; shift totals in the footer.
 */
export function HourByHourBoard({
  slots,
  current,
  progress = 1,
  unit = "pcs",
  compact = false,
  className,
}: HourByHourBoardProps) {
  const rows = React.useMemo(
    () => hourByHourRows(slots, current, progress),
    [slots, current, progress],
  );
  const t = hourByHourTotals(rows);
  const th = "px-3 py-2 text-right font-medium";
  const td = "px-3 py-2.5 text-right tabular-nums";
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border", className)}>
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <caption className="sr-only">Hour-by-hour production, plan versus actual in {unit}</caption>
        <thead className="bg-subtle text-[12px] text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Hour
            </th>
            <th scope="col" className={th}>
              Plan
            </th>
            <th scope="col" className={th}>
              Actual
            </th>
            <th scope="col" className={th}>
              Gap
            </th>
            {!compact && (
              <th scope="col" className={cn(th, "border-l")}>
                Cum. plan
              </th>
            )}
            {!compact && (
              <th scope="col" className={th}>
                Cum. actual
              </th>
            )}
            <th scope="col" className={cn(th, compact && "border-l")}>
              Cum. gap
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Reason / comment
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.hour}
              aria-current={r.state === "current" ? "time" : undefined}
              className={cn(
                "border-b last:border-b-0",
                r.state === "current" && "bg-highlight-soft",
                r.state === "future" && "text-muted-foreground",
              )}
            >
              <th scope="row" className="px-3 py-2.5 text-left font-medium tabular-nums">
                <span className="inline-flex items-center gap-2">
                  {r.state === "current" && (
                    <span className="size-1.5 rounded-full bg-highlight" aria-hidden />
                  )}
                  {r.hour}
                </span>
              </th>
              <td className={td}>
                {r.state === "current" ? (
                  <span>
                    {fmt(r.planToNow)}
                    <span className="text-muted-foreground"> / {fmt(r.plan)}</span>
                  </span>
                ) : (
                  fmt(r.plan)
                )}
              </td>
              <td className={cn(td, "font-medium")}>
                {r.state === "future" || r.actual == null ? "—" : fmt(r.actual)}
              </td>
              <td className={td}>
                <Gap v={r.gap} />
              </td>
              {!compact && (
                <td className={cn(td, "border-l")}>
                  {fmt(r.state === "future" ? r.cumPlan : r.cumPlanToNow)}
                </td>
              )}
              {!compact && <td className={td}>{r.cumActual == null ? "—" : fmt(r.cumActual)}</td>}
              <td className={cn(td, compact && "border-l")}>
                <Gap v={r.cumGap} />
              </td>
              <td className="px-3 py-2.5 text-[12.5px]">
                {r.reason ? (
                  <span
                    className={cn(
                      r.state === "missed" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.reason}
                  </span>
                ) : r.state === "current" ? (
                  <span className="text-highlight">
                    In progress · {Math.round(progress * 60)} min
                  </span>
                ) : (
                  <span className="text-muted-foreground">{r.note ?? ""}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 bg-subtle font-semibold">
          <tr>
            <th scope="row" className="px-3 py-2.5 text-left">
              Shift
            </th>
            <td className={td}>
              {fmt(t.planToNow)}
              <span className="font-normal text-muted-foreground"> / {fmt(t.plan)}</span>
            </td>
            <td className={td}>{fmt(t.actual)}</td>
            <td className={td}>
              <Gap v={t.gap} />
            </td>
            {!compact && <td className={cn(td, "border-l")} />}
            {!compact && <td className={td} />}
            <td className={cn(td, compact && "border-l")}>{t.attainment.toFixed(1)}%</td>
            <td className="px-3 py-2.5 text-[12.5px] font-normal text-muted-foreground">
              {t.missedHours} {t.missedHours === 1 ? "hour" : "hours"} below plan
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Gap({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "font-medium",
        v < 0 ? "text-danger" : v > 0 ? "text-success" : "text-muted-foreground",
      )}
    >
      {signed(v)}
    </span>
  );
}
