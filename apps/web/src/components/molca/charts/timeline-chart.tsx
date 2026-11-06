"use client";

import * as React from "react";
import { useElementWidth } from "./svg-chart";
import { cn } from "@/lib/utils";

export type TimelineRow = { id: string; label: string; sub?: string };
export type TimelineItem = {
  id: string;
  row: string;
  /** Start and end in period units from the first column (0 = start of the first period; 1.5 = middle of the second) */
  start: number;
  end: number;
  label: string;
  /** Second line on the bar and in the detail panel */
  detail?: string;
  /** Longer explanation shown on hover and in the detail panel */
  note?: string;
  /** focus = the main track (blue), done = finished (filled), planned = default, watch = tentative (dashed) */
  tone?: "focus" | "done" | "planned" | "watch";
};

export type TimelineChartProps = {
  rows: TimelineRow[];
  items: TimelineItem[];
  /** Column labels, e.g. ["2026", "2027", …] or ["Q1", "Q2", …] */
  periods: string[];
  /** Title of the row-label column */
  rowHeader?: string;
  /** Sub-ticks per period (e.g. 4 for quarters inside years) */
  subdivisions?: number;
  labelWidth?: number;
  rowHeight?: number;
  /** Initially selected item */
  defaultSelected?: string;
  className?: string;
};

const toneCls: Record<NonNullable<TimelineItem["tone"]>, string> = {
  focus: "border-chart-1 bg-chart-1 text-background",
  done: "border-chart-1/40 bg-chart-1/15",
  planned: "border-border bg-card",
  watch: "border-dashed border-muted-foreground/60 bg-card",
};

/**
 * Roadmap / plan timeline: rows of bars over periods (years, quarters, weeks). Hover a bar for its full text,
 * click it to pin the explanation in the panel below — the bar text may be shortened, the panel never is.
 * For hour-based production schedules use GanttChart instead.
 */
export function TimelineChart({
  rows,
  items,
  periods,
  rowHeader = "",
  subdivisions = 1,
  labelWidth = 200,
  rowHeight = 52,
  defaultSelected,
  className,
}: TimelineChartProps) {
  const [ref, width] = useElementWidth(720);
  const [hover, setHover] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>(defaultSelected ?? null);
  const lw = width < 560 ? Math.min(labelWidth, 120) : labelWidth;
  const minTrack = periods.length * 90;
  const track = Math.max(width - lw, minTrack);
  const W = lw + track;
  const pw = track / periods.length;
  const x = (v: number) => lw + v * pw;
  const head = 34;
  const H = head + rows.length * rowHeight;
  const show = items.find((i) => i.id === (hover ?? sel));
  const period = (i: TimelineItem) => {
    const a = periods[Math.floor(i.start)] ?? "";
    const b = periods[Math.max(0, Math.ceil(i.end) - 1)] ?? "";
    return a === b ? a : `${a} – ${b}`;
  };

  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <div ref={ref} className="w-full min-w-0 overflow-x-auto rounded-xl border">
        <div className="relative" style={{ width: W, height: H }}>
          {/* header */}
          <div className="absolute inset-x-0 top-0 border-b bg-subtle" style={{ height: head }} />
          <div
            className="absolute top-0 flex items-center px-3 text-xs font-medium text-muted-foreground"
            style={{ width: lw, height: head }}
          >
            {rowHeader}
          </div>
          {periods.map((p, i) => (
            <div
              key={p}
              className="absolute top-0 flex items-center border-l px-2 text-xs font-medium text-muted-foreground"
              style={{ left: x(i), width: pw, height: head }}
            >
              {p}
            </div>
          ))}
          {/* grid */}
          {periods.map((_, i) =>
            Array.from({ length: subdivisions }, (_, k) => (
              <div
                key={`${i}-${k}`}
                className={cn(
                  "absolute border-l",
                  k === 0 ? "border-border" : "border-dashed border-border/50",
                )}
                style={{ left: x(i + k / subdivisions), top: head, height: H - head }}
              />
            )),
          )}
          {/* rows */}
          {rows.map((r, ri) => (
            <div
              key={r.id}
              className={cn(
                "absolute inset-x-0 flex flex-col justify-center px-3",
                ri > 0 && "border-t",
              )}
              style={{ top: head + ri * rowHeight, height: rowHeight, width: lw }}
            >
              <div className="truncate text-[13px] font-medium" title={r.label}>
                {r.label}
              </div>
              {r.sub && (
                <div className="truncate text-[11.5px] text-muted-foreground" title={r.sub}>
                  {r.sub}
                </div>
              )}
            </div>
          ))}
          {rows.map(
            (r, ri) =>
              ri > 0 && (
                <div
                  key={`l-${r.id}`}
                  className="absolute border-t"
                  style={{ left: lw, right: 0, top: head + ri * rowHeight }}
                />
              ),
          )}
          {/* bars */}
          {items.map((it) => {
            const ri = rows.findIndex((r) => r.id === it.row);
            if (ri < 0) return null;
            const left = x(it.start) + 3;
            const w = Math.max(24, (it.end - it.start) * pw - 6);
            const active = sel === it.id || hover === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onMouseEnter={() => setHover(it.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(it.id)}
                onBlur={() => setHover(null)}
                onClick={() => setSel(sel === it.id ? null : it.id)}
                aria-pressed={sel === it.id}
                className={cn(
                  "absolute flex flex-col justify-center overflow-hidden rounded-lg border px-2.5 text-left outline-none transition-shadow",
                  toneCls[it.tone ?? "planned"],
                  active && "ring-2 ring-chart-1/50",
                )}
                style={{ left, width: w, top: head + ri * rowHeight + 6, height: rowHeight - 12 }}
              >
                <span className="truncate text-[12.5px] font-medium leading-tight">{it.label}</span>
                {it.detail && rowHeight >= 44 && (
                  <span
                    className={cn(
                      "truncate text-[11px] leading-snug",
                      it.tone === "focus" ? "text-background/80" : "text-muted-foreground",
                    )}
                  >
                    {it.detail}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="min-h-[3.5rem] rounded-xl border bg-card p-3 text-[13px]"
        role="status"
        aria-live="polite"
      >
        {show ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{show.label}</span>
              <span className="text-xs text-muted-foreground">
                {rows.find((r) => r.id === show.row)?.label} · {period(show)}
              </span>
            </div>
            {show.detail && <div className="mt-0.5 text-foreground/80">{show.detail}</div>}
            {show.note && (
              <div className="mt-1 text-[12.5px] text-muted-foreground">{show.note}</div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover or click a bar to read its full description.
          </span>
        )}
      </div>
    </div>
  );
}
