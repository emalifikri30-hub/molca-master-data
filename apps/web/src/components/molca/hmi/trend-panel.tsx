"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { HmiStyle, hmi } from "./hmi-theme";
import type { AnalogLimits } from "./analog-indicator";

/**
 * Pen colours: blue first, then neutral and indigo/purple.
 * Alarm hues (red, orange, yellow, cyan) are deliberately excluded — they mean alarm priority on an HMI.
 */
export const TREND_PEN_COLORS = [
  "var(--chart-1)",
  "var(--hmi-text)",
  "var(--chart-3)",
  "var(--chart-5)",
];

export type TrendPen = {
  tag: string;
  label?: string;
  unit: string;
  /** Samples, oldest first; same length as `times` */
  data: number[];
  /** Pen scale */
  min: number;
  max: number;
  color?: string;
  /** Setpoint — constant or per sample (drawn as a dashed step line) */
  setpoint?: number | number[];
  /** Alarm limits (drawn for the active pen) */
  limits?: AnalogLimits;
  /** Normal operating range (shaded for the active pen) */
  normal?: [number, number];
  decimals?: number;
};

export type TrendPanelProps = {
  pens: TrendPen[];
  /** Time label per sample, e.g. "13:05" */
  times: string[];
  title?: string;
  /** e.g. "Last 60 min" */
  span?: string;
  /** Plot height in px */
  height?: number;
  /** Index of the pen whose scale, band and limits are shown (uncontrolled default) */
  defaultActive?: number;
  className?: string;
};

const fmt = (v: number, d = 1) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Compact multi-pen trend for HMI displays: each pen on its own scale; the active pen shows its axis, normal band, limits and SP. */
export function TrendPanel({
  pens,
  times,
  title,
  span,
  height = 180,
  defaultActive = 0,
  className,
}: TrendPanelProps) {
  const [active, setActive] = React.useState(defaultActive);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const n = times.length;
  const W = 1000;
  const H = 100;
  const xs = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const ys = (p: TrendPen, v: number) =>
    H - ((Math.max(p.min, Math.min(p.max, v)) - p.min) / (p.max - p.min)) * H;
  const pct = (p: TrendPen, v: number) => (ys(p, v) / H) * 100;
  const ap = pens[active] ?? pens[0];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ap.min + t * (ap.max - ap.min));
  const idx = cursor ?? n - 1;
  const color = (i: number) => pens[i].color ?? TREND_PEN_COLORS[i % TREND_PEN_COLORS.length];
  const spAt = (p: TrendPen, i: number) => (Array.isArray(p.setpoint) ? p.setpoint[i] : p.setpoint);

  const onMove = (e: React.PointerEvent) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setCursor(Math.max(0, Math.min(n - 1, i)));
  };

  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div
      className={cn(
        "molca-hmi w-full overflow-hidden rounded-xl border text-[var(--hmi-text)]",
        className,
      )}
      style={{ background: hmi.surface }}
    >
      <HmiStyle />
      {(title || span) && (
        <div className="flex items-baseline justify-between gap-3 border-b px-3 py-2">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="text-[11.5px] text-[var(--hmi-text-muted)] tabular-nums">
            {cursor !== null ? `Cursor ${times[idx]}` : span}
          </span>
        </div>
      )}

      {/* legend — click to make a pen active; a single pen needs none (its name is the panel's context) */}
      {pens.length > 1 && (
        <div
          className="flex flex-wrap gap-1.5 px-3 pt-2.5"
          role="radiogroup"
          aria-label="Active pen"
        >
          {pens.map((p, i) => {
            const v = p.data[idx];
            return (
              <button
                key={p.tag}
                type="button"
                role="radio"
                aria-checked={i === active}
                onClick={() => setActive(i)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === active ? "border-[var(--hmi-text)]" : "opacity-80 hover:opacity-100",
                )}
              >
                <span
                  className="block h-0.5 w-4 rounded-full"
                  style={{ background: color(i) }}
                  aria-hidden
                />
                <span className="grid leading-tight">
                  <span className="font-mono text-[11.5px] font-semibold">{p.tag}</span>
                  {p.label && (
                    <span className="text-[10.5px] text-[var(--hmi-text-muted)]">{p.label}</span>
                  )}
                </span>
                <span className="ml-1 text-[13px] font-semibold tabular-nums">
                  {v !== undefined ? fmt(v, p.decimals) : "—"}
                  <span className="ml-0.5 text-[10.5px] font-medium text-[var(--hmi-text-muted)]">
                    {p.unit}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 px-3 pt-3 pb-2">
        {/* y axis of the active pen */}
        <div
          className="relative w-9 shrink-0 text-right text-[10px] text-[var(--hmi-text-muted)] tabular-nums"
          style={{ height }}
          aria-hidden
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${pct(ap, t)}%` }}
            >
              {fmt(t, Math.abs(ap.max - ap.min) < 10 ? 1 : 0)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            className="relative touch-none"
            style={{ height }}
            onPointerMove={onMove}
            onPointerLeave={() => setCursor(null)}
            role="img"
            aria-label={`Trend ${pens.map((p) => `${p.tag} ${fmt(p.data[n - 1], p.decimals)} ${p.unit}`).join(", ")}`}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              <rect width={W} height={H} fill={hmi.bg} />
              {ticks.map((t) => (
                <path
                  key={t}
                  d={`M0,${ys(ap, t)} H${W}`}
                  stroke={hmi.track}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {ap.normal && (
                <rect
                  x={0}
                  width={W}
                  y={ys(ap, ap.normal[1])}
                  height={ys(ap, ap.normal[0]) - ys(ap, ap.normal[1])}
                  fill={hmi.liquid}
                  opacity={0.7}
                />
              )}
              {ap.limits &&
                Object.entries(ap.limits).map(([k, v]) =>
                  v === undefined ? null : (
                    <path
                      key={k}
                      d={`M0,${ys(ap, v)} H${W}`}
                      stroke={hmi.line}
                      strokeWidth={k.length === 2 ? 1.5 : 1}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ),
                )}
              {pens.map((p, i) =>
                p.setpoint === undefined ? null : (
                  <path
                    key={`sp-${p.tag}`}
                    d={p.data
                      .map(
                        (_, j) =>
                          `${j ? `L${xs(j)},${ys(p, spAt(p, j - 1)!)} L` : "M"}${xs(j)},${ys(p, spAt(p, j)!)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={color(i)}
                    strokeWidth={1.25}
                    strokeDasharray="2 3"
                    opacity={i === active ? 1 : 0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
              {pens.map((p, i) => (
                <path
                  key={p.tag}
                  d={p.data.map((v, j) => `${j ? "L" : "M"}${xs(j)},${ys(p, v)}`).join(" ")}
                  fill="none"
                  stroke={color(i)}
                  strokeWidth={i === active ? 2.25 : 1.5}
                  opacity={i === active ? 1 : 0.65}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {/* limit labels (HTML so they don't stretch) */}
            {ap.limits &&
              Object.entries(ap.limits).map(([k, v]) =>
                v === undefined ? null : (
                  <span
                    key={k}
                    className="absolute right-1 -translate-y-full rounded-sm px-0.5 text-[9.5px] font-semibold text-[var(--hmi-text-muted)]"
                    style={{ top: `${pct(ap, v)}%`, background: hmi.bg }}
                  >
                    {k.toUpperCase()} {fmt(v, ap.decimals)}
                  </span>
                ),
              )}
            {/* cursor */}
            {cursor !== null && (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 w-px"
                  style={{ left: `${(xs(idx) / W) * 100}%`, background: hmi.line }}
                />
                {pens.map((p, i) => (
                  <span
                    key={p.tag}
                    className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                    style={
                      {
                        left: `${(xs(idx) / W) * 100}%`,
                        top: `${pct(p, p.data[idx])}%`,
                        background: color(i),
                        ["--tw-ring-color" as string]: hmi.bg,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </>
            )}
          </div>
          <div
            className="relative mt-1 h-3.5 text-[10px] text-[var(--hmi-text-muted)] tabular-nums"
            aria-hidden
          >
            {times.map((t, i) =>
              (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) || i === n - 1 ? (
                <span
                  key={i}
                  className={cn(
                    "absolute",
                    i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2",
                  )}
                  style={{ left: `${(xs(i) / W) * 100}%` }}
                >
                  {t}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <div className="px-3 pb-2.5 text-[11px] text-[var(--hmi-text-muted)]">
        Scale: {ap.tag} {fmt(ap.min, 0)}–{fmt(ap.max, 0)} {ap.unit}
        {spAt(ap, idx) !== undefined && ` · SP ${fmt(spAt(ap, idx)!, ap.decimals)} ${ap.unit}`}
        {ap.normal &&
          ` · normal ${fmt(ap.normal[0], ap.decimals)}–${fmt(ap.normal[1], ap.decimals)}`}
      </div>
    </div>
  );
}
