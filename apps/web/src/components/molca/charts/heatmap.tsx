import * as React from "react";
import { cn } from "@/lib/utils";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";
import {
  OEE_CLASSES_4,
  OEE_RAMP,
  oeeClass,
  oeeColor,
  oeeRampColor,
  oeeRampText,
  oeeText,
} from "@/lib/oee";

/** sequential = single-hue ramp; status = green / orange / red vs thresholds; oee = OEE benchmark classes; oee-ramp = 10-step OEE ramp (src/lib/oee.ts) */
export type HeatScale = "sequential" | "status" | "oee" | "oee-ramp";
const isOee = (s?: HeatScale) => s === "oee" || s === "oee-ramp";
/** Text class for a value on an OEE-colored cell. */
const oeeInk = (v: number, s?: HeatScale) => (s === "oee-ramp" ? oeeRampText(v) : oeeText(v));

/** Status thresholds. goodWhen "up" (OEE, FPY): ≥ good is green, ≥ warn is orange, below is red. "down" (downtime, defects): ≤ good green, ≤ warn orange, above red. */
export type HeatThresholds = { good: number; warn: number; goodWhen?: "up" | "down" };

/**
 * What the color encodes (UPDATE v4 color semantics):
 * "loss" — downtime, defects, scrap, alarms: red ramp from var(--sys-red), more = redder.
 * "good" — OEE, output, yield, availability: blue ramp from var(--chart-1).
 */
export type HeatTone = "loss" | "good";

export type HeatColorOptions = {
  scale?: HeatScale;
  tone?: HeatTone;
  domain?: [number, number];
  steps?: number;
  thresholds?: HeatThresholds;
};

/** Mix ratios of var(--chart-1) into var(--chart-base) per bin — a single-hue blue ramp that follows theme and contrast. */
export function heatRamp(steps = 5) {
  return Array.from({ length: steps }, (_, i) =>
    Math.round(14 + (86 * i) / Math.max(1, steps - 1)),
  );
}

/** Fill for one ramp step (p = mix % of the tone color). */
export function heatRampColor(p: number, tone: HeatTone = "good") {
  return tone === "loss"
    ? `color-mix(in oklab, var(--sys-red) ${p}%, var(--card))`
    : `color-mix(in oklab, var(--chart-1) ${p}%, var(--chart-base))`;
}

export function heatBin(v: number, domain: [number, number], steps = 5) {
  const [min, max] = domain;
  const t = max === min ? 1 : (v - min) / (max - min);
  return Math.max(0, Math.min(steps - 1, Math.floor(Math.max(0, Math.min(1, t)) * steps)));
}

export function heatStatus(v: number, th: HeatThresholds): "good" | "warn" | "bad" {
  const up = (th.goodWhen ?? "up") === "up";
  if (up) return v >= th.good ? "good" : v >= th.warn ? "warn" : "bad";
  return v <= th.good ? "good" : v <= th.warn ? "warn" : "bad";
}

export const HEAT_STATUS_COLOR = {
  good: "var(--st-run)",
  warn: "var(--st-small)",
  bad: "var(--st-unplanned)",
} as const;

/** Color for one value. `null` = no data (render an empty, outlined cell). */
export function heatColor(
  v: number | null | undefined,
  { scale = "sequential", tone = "good", domain = [0, 1], steps = 5, thresholds }: HeatColorOptions,
): string | null {
  if (v == null) return null;
  if (scale === "oee") return oeeColor(v);
  if (scale === "oee-ramp") return oeeRampColor(v);
  if (scale === "status" && thresholds) return HEAT_STATUS_COLOR[heatStatus(v, thresholds)];
  if (v === 0 && domain[0] === 0) return "var(--chart-base)";
  return heatRampColor(heatRamp(steps)[heatBin(v, domain, steps)], tone);
}

function isDark(v: number | null, o: HeatColorOptions) {
  if (v == null) return false;
  if (isOee(o.scale)) return false; // OEE cells pick their own ink (oeeInk)
  if (o.scale === "status") return true;
  if (v === 0 && (o.domain?.[0] ?? 0) === 0) return false;
  // light text only on the darkest bins; mid bins keep foreground (measured: white on mid red/blue < 3 : 1)
  return heatBin(v, o.domain ?? [0, 1], o.steps ?? 5) >= (o.steps ?? 5) - 1;
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** "Less ▢▢▢▢▢ More" ramp, or the three status swatches, plus the "No data" swatch. */
export function HeatmapLegend({
  scale = "sequential",
  tone = "good",
  domain = [0, 1],
  steps = 5,
  thresholds,
  unit,
  valueFormatter = fmt,
  statusLabels,
  showEmpty = true,
  className,
}: HeatColorOptions & {
  unit?: string;
  valueFormatter?: (v: number) => string;
  statusLabels?: [string, string, string];
  showEmpty?: boolean;
  className?: string;
}) {
  const u = unit ? ` ${unit}` : "";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {scale === "oee-ramp" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums">0%</span>
          <span className="inline-flex gap-0.5">
            {OEE_RAMP.map((c) => (
              <span key={c} className="h-2.5 w-3.5 rounded-[3px]" style={{ background: c }} />
            ))}
          </span>
          <span className="tabular-nums">100%</span>
        </span>
      ) : scale === "oee" ? (
        OEE_CLASSES_4.map((c, i) => {
          const next = OEE_CLASSES_4[i + 1];
          return (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
              {next
                ? c.min === 0
                  ? `< ${next.min}%`
                  : `${c.min} – ${next.min}%`
                : `≥ ${c.min}%`}{" "}
              {c.label.toLowerCase()}
            </span>
          );
        })
      ) : scale === "status" && thresholds ? (
        (() => {
          const up = (thresholds.goodWhen ?? "up") === "up";
          const g = valueFormatter(thresholds.good),
            w = valueFormatter(thresholds.warn);
          const labels =
            statusLabels ??
            (up
              ? [`≥ ${g}${u}`, `${w} – ${g}${u}`, `< ${w}${u}`]
              : [`≤ ${g}${u}`, `${g} – ${w}${u}`, `> ${w}${u}`]);
          return (["good", "warn", "bad"] as const).map((k, i) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: HEAT_STATUS_COLOR[k] }}
              />
              {labels[i]}
            </span>
          ));
        })()
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums">
            {valueFormatter(domain[0])}
            {u}
          </span>
          <span className="inline-flex gap-0.5">
            {heatRamp(steps).map((p) => (
              <span
                key={p}
                className="h-2.5 w-4 rounded-[3px]"
                style={{ background: heatRampColor(p, tone) }}
              />
            ))}
          </span>
          <span className="tabular-nums">
            {valueFormatter(domain[1])}
            {u}
          </span>
        </span>
      )}
      {showEmpty && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-dashed border-muted-foreground/50" />
          No data
        </span>
      )}
    </div>
  );
}

export type HeatmapProps = HeatColorOptions & {
  rows: string[];
  columns: string[];
  /** rows × columns. `null` = no data / not scheduled (outlined empty cell). */
  values: (number | null)[][];
  unit?: string;
  valueFormatter?: (v: number) => string;
  /** Print the value inside every cell (use for ≤ ~12 columns) */
  showValues?: boolean;
  /** Show every nth column label (e.g. 3 for 24 hours) */
  columnLabelEvery?: number;
  /** Sum per row in an extra right column */
  rowTotals?: boolean;
  cellHeight?: number;
  rowLabelWidth?: number;
  /** Ring one cell in blue (the cell you talk about) */
  highlight?: [number, number];
  /** Tooltip title per cell, default "row · column" */
  cellTitle?: (row: string, column: string) => React.ReactNode;
  /** Tooltip note for empty cells */
  emptyLabel?: string;
  legend?: boolean;
  statusLabels?: [string, string, string];
  /** Accessible summary of the whole chart */
  summary?: string;
  className?: string;
};

/**
 * Matrix heatmap (row × column), e.g. downtime minutes by day × hour or defects by line × shift.
 * Sequential: single-hue ramp — tone="loss" red (var(--sys-red)) for downtime/defects, tone="good" blue (var(--chart-1)) for OEE/output.
 * Status: green / orange / red against thresholds. Selection is always a ring, never a recolor.
 */
export function Heatmap({
  rows,
  columns,
  values,
  scale = "sequential",
  tone = "good",
  domain,
  steps = 5,
  thresholds,
  unit,
  valueFormatter = fmt,
  showValues = false,
  columnLabelEvery = 1,
  rowTotals = false,
  cellHeight = 28,
  rowLabelWidth,
  highlight,
  cellTitle = (r, c) => `${r} · ${c}`,
  emptyLabel = "No data",
  legend = true,
  statusLabels,
  summary,
  className,
}: HeatmapProps) {
  const tip = useHoverTip();
  const flat = values.flat().filter((v): v is number => v != null);
  const dom: [number, number] = domain ?? [Math.min(0, ...flat), Math.max(1, ...flat)];
  const opts: HeatColorOptions = { scale, tone, domain: dom, steps, thresholds };
  // row labels are never truncated by default: the column fits the longest label (capped so cells keep room)
  const labelW =
    rowLabelWidth ??
    Math.min(220, Math.max(72, Math.round(Math.max(...rows.map((r) => r.length)) * 6.6 + 14)));

  return (
    <div className={cn("w-full", className)}>
      <div ref={tip.ref} className="relative" role="img" aria-label={summary}>
        <div
          className="grid gap-[3px]"
          style={{
            gridTemplateColumns: `${labelW}px repeat(${columns.length}, minmax(0, 1fr))${rowTotals ? " 56px" : ""}`,
          }}
        >
          {rows.map((r, ri) => (
            <React.Fragment key={r}>
              <div
                className="flex items-center pr-2 text-[12px] leading-tight text-muted-foreground [overflow-wrap:anywhere]"
                style={{ minHeight: cellHeight }}
              >
                {r}
              </div>
              {columns.map((c, ci) => {
                const v = values[ri]?.[ci] ?? null;
                const bg = heatColor(v, opts);
                const hl = highlight && highlight[0] === ri && highlight[1] === ci;
                return (
                  <div
                    key={c}
                    onMouseEnter={(e) =>
                      tip.show(
                        e,
                        v == null ? (
                          <TipBody title={cellTitle(r, c)} note={emptyLabel} />
                        ) : (
                          <TipBody
                            title={cellTitle(r, c)}
                            value={valueFormatter(v)}
                            unit={unit}
                            color={bg ?? undefined}
                            note={
                              isOee(scale)
                                ? oeeClass(v).label
                                : scale === "status" && thresholds
                                  ? { good: "On target", warn: "Watch", bad: "Off target" }[
                                      heatStatus(v, thresholds)
                                    ]
                                  : undefined
                            }
                          />
                        ),
                      )
                    }
                    onMouseLeave={tip.hide}
                    className={cn(
                      "flex items-center justify-center rounded-[4px] text-[11px] font-medium tabular-nums transition-[filter] hover:brightness-90",
                      v == null && "border border-dashed border-muted-foreground/35",
                      isOee(scale) && v != null
                        ? oeeInk(v, scale)
                        : isDark(v, opts)
                          ? "text-highlight-foreground"
                          : "text-foreground",
                      hl && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                    )}
                    style={{ height: cellHeight, background: bg ?? undefined }}
                  >
                    {showValues && v != null ? valueFormatter(v) : null}
                  </div>
                );
              })}
              {rowTotals && (
                <div
                  className="flex items-center justify-end text-[12px] font-medium tabular-nums"
                  style={{ height: cellHeight }}
                >
                  {fmt(values[ri]?.reduce<number>((s, v) => s + (v ?? 0), 0) ?? 0)}
                </div>
              )}
            </React.Fragment>
          ))}
          {/* column labels */}
          <div />
          {columns.map((c, ci) => (
            <div key={c} className="pt-1 text-center text-[11.5px] text-muted-foreground">
              {ci % columnLabelEvery === 0 ? c : ""}
            </div>
          ))}
          {rowTotals && (
            <div className="pt-1 text-right text-[11.5px] text-muted-foreground">Total</div>
          )}
        </div>
        <HoverTip state={tip.state} />
      </div>
      {legend && (
        <HeatmapLegend
          className="mt-4"
          {...opts}
          unit={unit}
          valueFormatter={valueFormatter}
          statusLabels={statusLabels}
        />
      )}
    </div>
  );
}

/* ---------------- calendar heatmap ---------------- */

export type CalendarDatum = { date: string; value: number | null; note?: string };

export type CalendarHeatmapProps = HeatColorOptions & {
  data: CalendarDatum[];
  /** ISO date (YYYY-MM-DD), first day shown */
  from: string;
  /** ISO date, last day shown */
  to: string;
  /** ISO date ringed as "today"; later days render as empty future cells */
  today?: string;
  unit?: string;
  valueFormatter?: (v: number) => string;
  cellSize?: number;
  gap?: number;
  legend?: boolean;
  statusLabels?: [string, string, string];
  emptyLabel?: string;
  summary?: string;
  className?: string;
};

const DAY = 86400000;
const parse = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** GitHub-style calendar: one column per week (Mon–Sun), one cell per day. Ideal for daily OEE or daily safety incidents over a year. */
export function CalendarHeatmap({
  data,
  from,
  to,
  today,
  scale = "sequential",
  tone = "good",
  domain,
  steps = 5,
  thresholds,
  unit,
  valueFormatter = fmt,
  cellSize = 13,
  gap = 3,
  legend = true,
  statusLabels,
  emptyLabel = "No production",
  summary,
  className,
}: CalendarHeatmapProps) {
  const tip = useHoverTip();
  const map = React.useMemo(() => new Map(data.map((d) => [d.date, d])), [data]);
  const flat = data.map((d) => d.value).filter((v): v is number => v != null);
  const dom: [number, number] = domain ?? [Math.min(...flat), Math.max(...flat)];
  const opts: HeatColorOptions = { scale, tone, domain: dom, steps, thresholds };

  const start = parse(from);
  const end = parse(to);
  const todayT = today ? parse(today) : null;
  const dow = (t: number) => (new Date(t).getUTCDay() + 6) % 7;
  const gridStart = start - dow(start) * DAY;
  const weeks = Math.floor((end - gridStart) / DAY / 7) + 1;

  const cells: { t: number; w: number; d: number }[] = [];
  for (let t = start; t <= end; t += DAY)
    cells.push({ t, w: Math.floor((t - gridStart) / DAY / 7), d: dow(t) });
  const monthLabels = cells
    .filter((c) => new Date(c.t).getUTCDate() === 1 || c.t === start)
    .map((c) => ({ w: c.w, label: MONTHS[new Date(c.t).getUTCMonth()] }));
  const step = cellSize + gap;

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto pb-1">
        <div ref={tip.ref} className="relative w-max" role="img" aria-label={summary}>
          <div className="relative ml-8 h-5 text-[11.5px] text-muted-foreground">
            {monthLabels.map((m) => (
              <span
                key={`${m.label}${m.w}`}
                className="absolute top-0"
                style={{ left: m.w * step }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex">
            <div
              className="grid w-8 text-[10.5px] text-muted-foreground"
              style={{ gridTemplateRows: `repeat(7, ${cellSize}px)`, rowGap: gap }}
            >
              {DOW.map((d, i) => (
                <span key={d} className="leading-none" style={{ lineHeight: `${cellSize}px` }}>
                  {i % 2 === 0 ? d : ""}
                </span>
              ))}
            </div>
            <div
              className="grid"
              style={{
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`,
                gap,
              }}
            >
              {cells.map((c) => {
                const key = iso(c.t);
                const datum = map.get(key);
                const future = todayT != null && c.t > todayT;
                const v = future ? null : (datum?.value ?? null);
                const bg = heatColor(v, opts);
                const date = new Date(c.t);
                const label = `${DOW[c.d]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
                return (
                  <div
                    key={key}
                    onMouseEnter={(e) =>
                      tip.show(
                        e,
                        v == null ? (
                          <TipBody
                            title={label}
                            note={future ? "Upcoming" : (datum?.note ?? emptyLabel)}
                          />
                        ) : (
                          <TipBody
                            title={label}
                            value={valueFormatter(v)}
                            unit={unit}
                            color={bg ?? undefined}
                            note={
                              [isOee(scale) ? oeeClass(v).label : null, datum?.note]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                          />
                        ),
                      )
                    }
                    onMouseLeave={tip.hide}
                    className={cn(
                      "rounded-[3px] transition-[filter] hover:brightness-90",
                      v == null &&
                        (future
                          ? "bg-muted/60"
                          : "border border-dashed border-muted-foreground/35"),
                      todayT === c.t && "ring-2 ring-highlight ring-offset-1 ring-offset-card",
                    )}
                    style={{ gridColumn: c.w + 1, gridRow: c.d + 1, background: bg ?? undefined }}
                  />
                );
              })}
            </div>
          </div>
          <HoverTip state={tip.state} />
        </div>
      </div>
      {legend && (
        <HeatmapLegend
          className="mt-4"
          {...opts}
          unit={unit}
          valueFormatter={valueFormatter}
          statusLabels={statusLabels}
        />
      )}
    </div>
  );
}
