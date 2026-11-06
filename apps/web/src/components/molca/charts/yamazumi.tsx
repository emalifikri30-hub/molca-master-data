"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type WorkElementType = "va" | "nva" | "waste";

export type WorkElement = { name: string; seconds: number; type: WorkElementType };

export type YamazumiStation = {
  station: string;
  /** Operator or role, second label line */
  operator?: string;
  elements: WorkElement[];
};

export const WORK_TYPES: Record<WorkElementType, { label: string; color: string }> = {
  va: { label: "Value-added", color: "var(--chart-1)" },
  nva: { label: "Non-value-added (necessary)", color: "var(--st-small)" },
  waste: { label: "Waste", color: "var(--sys-red)" },
};

/** Legend entries for ChartLegendList. */
export const yamazumiLegend = (Object.keys(WORK_TYPES) as WorkElementType[]).map((t) => ({
  label: WORK_TYPES[t].label,
  color: WORK_TYPES[t].color,
}));

/**
 * Line-balance numbers. Cycle time per station = Σ element times. Bottleneck = max cycle time.
 * Balance efficiency = Σ CT ÷ (stations × max CT). Theoretical min. operators = Σ CT ÷ takt.
 */
export function yamazumiStats(stations: YamazumiStation[], takt: number) {
  const cts = stations.map((s) => s.elements.reduce((a, e) => a + e.seconds, 0));
  const total = cts.reduce((a, b) => a + b, 0);
  const maxCt = Math.max(...cts);
  const bottleneck = cts.indexOf(maxCt);
  const byType = (t: WorkElementType) =>
    stations.reduce(
      (a, s) => a + s.elements.filter((e) => e.type === t).reduce((x, e) => x + e.seconds, 0),
      0,
    );
  return {
    cycleTimes: cts,
    total,
    maxCt,
    bottleneck,
    overTakt: cts.map((c) => c > takt),
    balanceEfficiency: total / (stations.length * maxCt),
    minOperators: total / takt,
    va: byType("va"),
    nva: byType("nva"),
    waste: byType("waste"),
  };
}

export type YamazumiChartProps = {
  stations: YamazumiStation[];
  /** Takt time in seconds — red dashed line */
  takt: number;
  /** Optional target cycle time (e.g. 95% of takt) — dashed grey line */
  target?: number;
  /** "elements" stacks every work element; "type" groups them into VA / NVA / waste */
  mode?: "elements" | "type";
  /** Outline and label the bottleneck station (default true) */
  showBottleneck?: boolean;
  height?: number;
  className?: string;
};

const niceTop = (v: number) => Math.ceil((v * 1.12) / 10) * 10;

/**
 * Yamazumi (stack) chart: one column per station stacked by work element, colored by type,
 * with the takt line, cycle time on top of each column and the bottleneck outlined.
 */
export function YamazumiChart({
  stations,
  takt,
  target,
  mode = "elements",
  showBottleneck = true,
  height = 320,
  className,
}: YamazumiChartProps) {
  const stats = React.useMemo(() => yamazumiStats(stations, takt), [stations, takt]);
  const top = niceTop(Math.max(stats.maxCt, takt));
  const step = top <= 60 ? 10 : top <= 120 ? 20 : 50;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const y = (s: number) => (s / top) * 100;
  const [hover, setHover] = React.useState<string | null>(null);

  const columns = stations.map((s) =>
    mode === "type"
      ? (["va", "nva", "waste"] as WorkElementType[])
          .map((t) => ({
            name: WORK_TYPES[t].label,
            type: t,
            seconds: s.elements.filter((e) => e.type === t).reduce((a, e) => a + e.seconds, 0),
          }))
          .filter((e) => e.seconds > 0)
      : s.elements,
  );

  return (
    <div className={cn("w-full", className)}>
      <div className="flex" style={{ height }}>
        {/* y axis */}
        <div className="relative w-10 shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 translate-y-1/2"
              style={{ bottom: `${y(t)}%` }}
            >
              {t}
            </span>
          ))}
          <span className="absolute -left-1 top-1/2 origin-center -translate-y-1/2 -rotate-90 text-[10.5px]">
            sec
          </span>
        </div>
        {/* plot */}
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className={cn(
                "absolute inset-x-0 border-t",
                t === 0 ? "border-border" : "border-dashed border-border/70",
              )}
              style={{ bottom: `${y(t)}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-[3%] px-[2%]">
            {columns.map((els, i) => {
              const ct = stats.cycleTimes[i];
              const isBn = showBottleneck && i === stats.bottleneck;
              const over = stats.overTakt[i];
              return (
                <div
                  key={stations[i].station}
                  className="relative flex h-full max-w-24 flex-1 flex-col justify-end"
                >
                  <div
                    className={cn(
                      "flex flex-col-reverse overflow-visible rounded-md",
                      isBn && "outline-2 outline-offset-2 outline-foreground",
                    )}
                    style={{ height: `${y(ct)}%` }}
                    role="img"
                    aria-label={`${stations[i].station}: cycle time ${ct} s${over ? ", over takt" : ""}${isBn ? ", bottleneck" : ""}`}
                  >
                    {els.map((e, j) => {
                      const key = `${i}-${j}`;
                      return (
                        <div
                          key={key}
                          onMouseEnter={() => setHover(key)}
                          onMouseLeave={() => setHover(null)}
                          className={cn(
                            "relative flex min-h-0 items-center justify-center overflow-visible border-t border-card text-[10.5px] font-medium first:rounded-b-md last:rounded-t-md last:border-t-0",
                            hover && hover !== key && "opacity-60",
                          )}
                          style={{
                            height: `${(e.seconds / ct) * 100}%`,
                            background: WORK_TYPES[e.type].color,
                            color: e.type === "va" ? "var(--ink-on-deep)" : "var(--ink-on-bright)",
                          }}
                        >
                          {(e.seconds / top) * height >= 16 && (
                            <span className="truncate px-1 tabular-nums">{e.seconds}</span>
                          )}
                          {hover === key && (
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-52 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-left text-xs font-normal text-background shadow-lg">
                              <div className="font-medium">{e.name}</div>
                              <div className="mt-0.5 flex justify-between gap-4">
                                <span className="opacity-65">{WORK_TYPES[e.type].label}</span>
                                <span className="font-semibold tabular-nums">{e.seconds} s</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className={cn(
                      "absolute inset-x-0 text-center text-[12px] font-semibold tabular-nums",
                      over ? "text-danger" : "text-foreground",
                    )}
                    style={{ bottom: `calc(${y(ct)}% + 6px)` }}
                  >
                    {ct} s
                  </div>
                </div>
              );
            })}
          </div>
          {target != null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-muted-foreground"
              style={{ bottom: `${y(target)}%` }}
            >
              <span className="absolute -top-[18px] left-1 text-[11px] text-muted-foreground">
                Target {target} s
              </span>
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-danger"
            style={{ bottom: `${y(takt)}%` }}
          >
            <span className="absolute -top-[19px] right-1 rounded bg-card px-1 text-[11px] font-semibold text-danger">
              Takt {takt} s
            </span>
          </div>
        </div>
      </div>
      {/* x labels */}
      <div className="ml-10 flex justify-around gap-[3%] px-[2%] pt-2">
        {stations.map((s, i) => (
          <div key={s.station} className="max-w-24 flex-1 text-center leading-tight">
            <div className="truncate text-[12px] font-medium">{s.station}</div>
            {s.operator && (
              <div className="truncate text-[11px] text-muted-foreground">{s.operator}</div>
            )}
            {showBottleneck && i === stats.bottleneck && (
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide">
                Bottleneck
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
