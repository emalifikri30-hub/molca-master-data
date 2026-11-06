"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleAlert,
  CircleX,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* ISO 22400-1/-2 KPI description fields                               */
/* ------------------------------------------------------------------ */

export type KpiTrend = "higher" | "lower";
export type KpiTiming = "real-time" | "periodic" | "on-demand";
export type KpiAudience = "operator" | "supervisor" | "management";

/** Target status: meets target · within tolerance · off target. */
export type KpiStatus = "ok" | "warn" | "bad";

/**
 * Status vs target, respecting the trend direction.
 * `tolerance` is the relative band (default 5% of target) that counts as “at risk” instead of “off target”.
 */
export function kpiStatus(
  value: number,
  target: number,
  trend: KpiTrend = "higher",
  tolerance = 0.05,
): KpiStatus {
  const gap = trend === "higher" ? value - target : target - value;
  if (gap >= 0) return "ok";
  return Math.abs(gap) <= Math.abs(target) * tolerance ? "warn" : "bad";
}

export const KPI_STATUS_META: Record<
  KpiStatus,
  { label: string; color: string; Icon: typeof CircleCheck; cls: string }
> = {
  ok: {
    label: "On target",
    color: "var(--sys-green)",
    Icon: CircleCheck,
    cls: "bg-success-soft text-success",
  },
  warn: {
    label: "At risk",
    color: "var(--sys-orange)",
    Icon: CircleAlert,
    cls: "bg-warning-soft text-[color-mix(in_oklab,var(--warning)_75%,black)] dark:text-warning",
  },
  bad: {
    label: "Off target",
    color: "var(--sys-red)",
    Icon: CircleX,
    cls: "bg-danger-soft text-danger",
  },
};

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

/** Tiny trend line (blue) with an optional dashed target line and an end dot. */
export function Sparkline({
  data,
  target,
  width = 120,
  height = 36,
  className,
  domain,
}: {
  data: number[];
  target?: number;
  width?: number;
  height?: number;
  className?: string;
  domain?: [number, number];
}) {
  const gid = React.useId();
  if (data.length < 2) return null;
  const vals = target != null ? [...data, target] : data;
  const lo = domain?.[0] ?? Math.min(...vals);
  const hi = domain?.[1] ?? Math.max(...vals);
  const pad = 3;
  const x = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const y = (v: number) =>
    hi === lo ? height / 2 : pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  const d = data.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L ${x(data.length - 1)} ${height} L ${x(0)} ${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.18} />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      {target != null && (
        <line
          x1={0}
          x2={width}
          y1={y(target)}
          y2={y(target)}
          stroke="var(--muted-foreground)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(data.length - 1)}
        cy={y(data[data.length - 1])}
        r={3}
        fill="var(--chart-1)"
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

export type KpiCardProps = {
  /** KPI name as in ISO 22400-2, e.g. “OEE index” */
  name: string;
  /** Short identifier / symbol, e.g. “OEE”, “A”, “MTBF” */
  isoId?: string;
  value: number;
  unit?: string;
  /** Decimals for the value (default 1) */
  decimals?: number;
  /** Formula as text, e.g. “A × E × QR” */
  formula?: string;
  trend?: KpiTrend;
  timing?: KpiTiming;
  audience?: KpiAudience[];
  target?: number;
  /** Override the computed target status (e.g. use the OEE class badge instead) */
  badge?: React.ReactNode;
  sparkline?: number[];
  /** Label under the sparkline, e.g. “Last 14 days” */
  sparklineLabel?: string;
  /** Scope of the KPI (work unit / line / site) */
  scope?: string;
  /** Show the formula / trend / timing footer (default true). Off on dense dashboards: the formula moves to the tooltip */
  details?: boolean;
  className?: string;
};

const timingMeta: Record<KpiTiming, { label: string; Icon: typeof Clock }> = {
  "real-time": { label: "Real-time", Icon: RefreshCw },
  periodic: { label: "Periodic", Icon: Clock },
  "on-demand": { label: "On demand", Icon: Clock },
};

/** KPI card following the ISO 22400-1 KPI description: name, ID, formula, unit, trend, timing, audience, target. */
export function KpiCard({
  name,
  isoId,
  value,
  unit,
  decimals = 1,
  formula,
  trend = "higher",
  timing = "periodic",
  audience,
  target,
  badge,
  sparkline,
  sparklineLabel,
  scope,
  details = true,
  className,
}: KpiCardProps) {
  const status = target != null ? kpiStatus(value, target, trend) : undefined;
  const meta = status ? KPI_STATUS_META[status] : undefined;
  const T = timingMeta[timing];
  const fmt = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col rounded-2xl border bg-card p-4 text-card-foreground shadow-xs",
        !details && "py-3",
        className,
      )}
      title={details ? undefined : formula}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em]">{name}</div>
          {scope && <div className="truncate text-[12px] text-muted-foreground">{scope}</div>}
        </div>
        {isoId && (
          <span
            className="shrink-0 rounded-md border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            title="ISO 22400-2 KPI"
          >
            {isoId}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex items-end justify-between gap-3",
          details ? "mt-3 mb-3 min-h-[62px]" : "mt-2",
        )}
      >
        <div className="min-w-0">
          <span className="inline-flex items-baseline gap-1 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {fmt(value)}
            {unit && (
              <span className="text-sm font-medium tracking-normal text-muted-foreground">
                {unit}
              </span>
            )}
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {badge ??
              (meta && (
                <span
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
                    meta.cls,
                  )}
                >
                  <meta.Icon className="size-3.5" />
                  {meta.label}
                </span>
              ))}
            {target != null && (
              <span className="text-[12px] text-muted-foreground tabular-nums">
                Target {trend === "higher" ? "≥" : "≤"} {fmt(target)}
                {unit && ` ${unit}`}
              </span>
            )}
          </div>
        </div>
        {sparkline && (
          <div className="flex flex-col items-end gap-0.5">
            <Sparkline data={sparkline} target={target} />
            {sparklineLabel && (
              <span className="text-[11px] text-muted-foreground">{sparklineLabel}</span>
            )}
          </div>
        )}
      </div>

      {details && (formula || trend || timing) && (
        <div className="mt-auto grid gap-1.5 border-t pt-3 text-[12px] text-muted-foreground">
          {formula && (
            <div className="truncate font-mono text-[11.5px] text-foreground" title={formula}>
              {formula}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              {trend === "higher" ? (
                <ArrowUp className="size-3.5" />
              ) : (
                <ArrowDown className="size-3.5" />
              )}
              {trend === "higher" ? "Higher is better" : "Lower is better"}
            </span>
            <span className="inline-flex items-center gap-1">
              <T.Icon className="size-3.5" />
              {T.label}
            </span>
            {audience && <span className="capitalize">{audience.join(" · ")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI catalog (ISO 22400-2)                                           */
/* ------------------------------------------------------------------ */

export type KpiDefinition = {
  name: string;
  id: string;
  formula: string;
  unit: string;
  trend: KpiTrend;
  timing: KpiTiming;
  description: string;
};

/** Main ISO 22400-2 KPIs. Time elements: see the ISO 22400 Time Model (APT, PBT, AUBT, AUST, ADET…). */
export const ISO22400_KPIS: KpiDefinition[] = [
  {
    name: "Worker efficiency",
    id: "WE",
    formula: "APWT / PWT",
    unit: "%",
    trend: "higher",
    timing: "periodic",
    description: "Share of personnel attendance time spent on order work.",
  },
  {
    name: "Allocation ratio",
    id: "AR",
    formula: "ΣAUBT / AOET",
    unit: "%",
    trend: "higher",
    timing: "periodic",
    description: "Busy time of all units involved relative to the order execution time.",
  },
  {
    name: "Throughput rate",
    id: "TR",
    formula: "PQ / AOET",
    unit: "pcs/h",
    trend: "higher",
    timing: "real-time",
    description: "Produced quantity per unit of order execution time.",
  },
  {
    name: "Allocation efficiency",
    id: "AE",
    formula: "AUBT / PBT",
    unit: "%",
    trend: "higher",
    timing: "periodic",
    description: "How much of the planned busy time the unit was actually allocated.",
  },
  {
    name: "Utilization efficiency",
    id: "UE",
    formula: "APT / AUBT",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Productive share of the time the unit was busy.",
  },
  {
    name: "OEE index",
    id: "OEE",
    formula: "A × E × QR",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Overall equipment effectiveness: availability × effectiveness × quality ratio.",
  },
  {
    name: "Net equipment effectiveness index",
    id: "NEE",
    formula: "UE × E × QR",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Like OEE but based on busy time, excluding time without orders.",
  },
  {
    name: "Availability",
    id: "A",
    formula: "APT / PBT",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Production time relative to planned busy time.",
  },
  {
    name: "Effectiveness",
    id: "E",
    formula: "(PRI × PQ) / APT",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Planned vs actual time per unit produced (performance).",
  },
  {
    name: "Quality ratio",
    id: "QR",
    formula: "GQ / PQ",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Good quantity relative to produced quantity.",
  },
  {
    name: "Setup rate",
    id: "SR",
    formula: "AUST / AUPT",
    unit: "%",
    trend: "lower",
    timing: "periodic",
    description: "Share of processing time spent on setup.",
  },
  {
    name: "Technical efficiency",
    id: "TE",
    formula: "APT / (APT + ADET)",
    unit: "%",
    trend: "higher",
    timing: "real-time",
    description: "Production time relative to production plus delay time.",
  },
  {
    name: "Production process ratio",
    id: "PPR",
    formula: "APT / AOET",
    unit: "%",
    trend: "higher",
    timing: "periodic",
    description: "Production time relative to order execution time.",
  },
  {
    name: "Scrap ratio",
    id: "SCR",
    formula: "SQ / PQ",
    unit: "%",
    trend: "lower",
    timing: "periodic",
    description: "Scrapped quantity relative to produced quantity.",
  },
  {
    name: "Rework ratio",
    id: "RWR",
    formula: "RQ / PQ",
    unit: "%",
    trend: "lower",
    timing: "periodic",
    description: "Reworked quantity relative to produced quantity.",
  },
  {
    name: "First pass yield",
    id: "FPY",
    formula: "GP / IP",
    unit: "%",
    trend: "higher",
    timing: "periodic",
    description: "Parts good at first inspection relative to inspected parts.",
  },
  {
    name: "Mean operating time between failures",
    id: "MTBF",
    formula: "ΣTBF / (FE + 1)",
    unit: "h",
    trend: "higher",
    timing: "periodic",
    description:
      "Average operating time between failures (FE failure events split the period into FE + 1 intervals).",
  },
  {
    name: "Mean time to failure",
    id: "MTTF / MTTFF",
    formula: "ΣTTF / FE",
    unit: "h",
    trend: "higher",
    timing: "periodic",
    description:
      "Average operating time until (first) failure — for items that are not restored, or from start-up to first failure.",
  },
  {
    name: "Mean time to restoration",
    id: "MTTR",
    formula: "ΣTTR / FE",
    unit: "min",
    trend: "lower",
    timing: "periodic",
    description: "Average time to restore the unit after a failure.",
  },
  {
    name: "Corrective maintenance ratio",
    id: "CMR",
    formula: "CMT / (CMT + PMT)",
    unit: "%",
    trend: "lower",
    timing: "periodic",
    description: "Corrective maintenance time relative to total maintenance time.",
  },
];

export const KPI_SYMBOLS: [string, string][] = [
  ["APT", "Actual production time"],
  ["PBT", "Planned busy time"],
  ["AUBT", "Actual unit busy time"],
  ["AUPT", "Actual unit processing time"],
  ["AUST", "Actual unit setup time"],
  ["ADET", "Actual unit delay time"],
  ["AOET", "Actual order execution time"],
  ["PRI", "Planned runtime per item"],
  ["PQ", "Produced quantity"],
  ["GQ", "Good quantity"],
  ["SQ", "Scrap quantity"],
  ["RQ", "Rework quantity"],
  ["GP · IP", "Good parts (first pass) · inspected parts"],
  ["APWT · PWT", "Actual personnel work time · personnel attendance time"],
  ["TBF · TTF · TTR", "Time between failures · time to failure · time to restoration"],
  ["FE", "Failure events"],
  ["CMT · PMT", "Corrective · preventive maintenance time"],
];

/** Searchable table of ISO 22400-2 KPI definitions. */
export function KpiCatalog({
  items = ISO22400_KPIS,
  className,
}: {
  items?: KpiDefinition[];
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const rows = items.filter((k) =>
    `${k.name} ${k.id} ${k.formula}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className={cn("w-full overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="text-[14px] font-semibold">ISO 22400-2 KPI catalog</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter KPIs…"
          aria-label="Filter KPIs"
          className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-subtle text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">KPI</th>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Formula</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium">Trend</th>
              <th className="px-3 py-2 font-medium">Timing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.id} className="border-t align-top">
                <td className="px-4 py-2">
                  <div className="font-medium">{k.name}</div>
                  <div className="text-[12px] text-muted-foreground">{k.description}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{k.id}</td>
                <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{k.formula}</td>
                <td className="px-3 py-2 text-muted-foreground">{k.unit}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {k.trend === "higher" ? (
                      <ArrowUp className="size-3.5" />
                    ) : (
                      <ArrowDown className="size-3.5" />
                    )}
                    {k.trend === "higher" ? "Higher" : "Lower"}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {timingMeta[k.timing].label}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No KPI matches “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
