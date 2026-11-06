"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { decimalsFor, mean, niceTicks, quantile } from "./spc-stats";
import { SvgTooltip, TipRow, scaleLinear, svgTick, useElementWidth } from "./svg-chart";

export type BoxStats = {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  iqr: number;
  /** whisker ends = most extreme values within 1.5 × IQR of the box (Tukey) */
  lo: number;
  hi: number;
  outliers: number[];
};

/** Tukey box-plot statistics (quartiles by linear interpolation, whiskers at 1.5 × IQR). */
export function boxStats(values: readonly number[]): BoxStats {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const fLo = q1 - 1.5 * iqr;
  const fHi = q3 + 1.5 * iqr;
  const inside = s.filter((v) => v >= fLo && v <= fHi);
  return {
    n: s.length,
    min: s[0],
    q1,
    median: quantile(s, 0.5),
    q3,
    max: s[s.length - 1],
    mean: mean(s),
    iqr,
    lo: inside[0] ?? q1,
    hi: inside[inside.length - 1] ?? q3,
    outliers: s.filter((v) => v < fLo || v > fHi),
  };
}

export type BoxPlotGroup = { label: string; values: readonly number[]; sublabel?: string };

export type BoxPlotProps = {
  groups: BoxPlotGroup[];
  lsl?: number;
  usl?: number;
  target?: number;
  /** Show the mean as a small diamond */
  showMean?: boolean;
  /** Selected group (blue). Controlled; pair with onSelect. */
  selected?: string | null;
  onSelect?: (label: string | null) => void;
  unit?: string;
  decimals?: number;
  height?: number;
  className?: string;
};

/**
 * Vertical box plots to compare a characteristic across shifts, lines, suppliers or machines.
 * Boxes are neutral grey; the selected group is blue; values outside the spec are red.
 */
export function BoxPlot({
  groups,
  lsl,
  usl,
  target,
  showMean = true,
  selected,
  onSelect,
  unit,
  decimals,
  height = 280,
  className,
}: BoxPlotProps) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = React.useState<number | null>(null);
  const stats = React.useMemo(() => groups.map((g) => boxStats(g.values)), [groups]);

  const all = [...stats.flatMap((s) => [s.min, s.max]), lsl, usl, target].filter(
    (v): v is number => v != null,
  );
  const span = Math.max(...all) - Math.min(...all) || 1;
  const yTicks = niceTicks(Math.min(...all) - span * 0.06, Math.max(...all) + span * 0.06, 5);
  const y0 = Math.min(yTicks[0], Math.min(...all) - span * 0.04);
  const y1 = Math.max(yTicks[yTicks.length - 1], Math.max(...all) + span * 0.04);
  const dec = decimals ?? decimalsFor(yTicks[1] - yTicks[0]);
  const f = (v: number) => v.toFixed(dec);

  const m = {
    top: 14,
    right: lsl != null || usl != null ? 64 : 12,
    bottom: groups.some((g) => g.sublabel) ? 44 : 30,
    left: 52,
  };
  const Y = scaleLinear(y0, y1, height - m.bottom, m.top);
  const band = (width - m.left - m.right) / groups.length;
  const bw = Math.min(56, band * 0.46);
  const cx = (i: number) => m.left + band * (i + 0.5);
  const out = (v: number) => (lsl != null && v < lsl) || (usl != null && v > usl);

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Box plot of ${groups.map((g) => g.label).join(", ")}`}
        className="block overflow-visible"
      >
        {lsl != null && usl != null && (
          <rect
            x={m.left}
            width={width - m.left - m.right}
            y={Y(usl)}
            height={Y(lsl) - Y(usl)}
            fill="var(--muted-foreground)"
            fillOpacity={0.05}
          />
        )}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={m.left}
              x2={width - m.right}
              y1={Y(t)}
              y2={Y(t)}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <text x={m.left - 8} y={Y(t)} dy="0.32em" textAnchor="end" {...svgTick}>
              {f(t)}
            </text>
          </g>
        ))}
        {[
          { v: lsl, l: "LSL", spec: true },
          { v: usl, l: "USL", spec: true },
          { v: target, l: "Target", spec: false },
        ].map((r) =>
          r.v == null ? null : (
            <g key={r.l}>
              <line
                x1={m.left}
                x2={width - m.right}
                y1={Y(r.v)}
                y2={Y(r.v)}
                stroke={r.spec ? "var(--danger)" : "var(--foreground)"}
                strokeOpacity={r.spec ? 0.85 : 0.55}
                strokeDasharray={r.spec ? "5 4" : "1 3"}
                strokeWidth={r.spec ? 1.25 : 1.5}
              />
              <text
                x={width - m.right + 6}
                y={Y(r.v)}
                dy="0.32em"
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                <tspan fontWeight={600} fill="var(--foreground)">
                  {r.l}
                </tspan>{" "}
                {f(r.v)}
              </text>
            </g>
          ),
        )}
        {stats.map((s, i) => {
          const g = groups[i];
          const sel = selected === g.label;
          const x = cx(i);
          const stroke = sel ? "var(--chart-1)" : "var(--foreground)";
          return (
            <g
              key={g.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(sel ? null : g.label) : undefined}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <rect
                x={x - band / 2 + 4}
                width={band - 8}
                y={m.top}
                height={height - m.top - m.bottom}
                rx={8}
                fill={hover === i ? "var(--muted)" : "transparent"}
                fillOpacity={0.6}
              />
              <line x1={x} x2={x} y1={Y(s.hi)} y2={Y(s.q3)} stroke={stroke} strokeOpacity={0.6} />
              <line x1={x} x2={x} y1={Y(s.q1)} y2={Y(s.lo)} stroke={stroke} strokeOpacity={0.6} />
              <line
                x1={x - bw / 4}
                x2={x + bw / 4}
                y1={Y(s.hi)}
                y2={Y(s.hi)}
                stroke={stroke}
                strokeOpacity={0.6}
              />
              <line
                x1={x - bw / 4}
                x2={x + bw / 4}
                y1={Y(s.lo)}
                y2={Y(s.lo)}
                stroke={stroke}
                strokeOpacity={0.6}
              />
              <rect
                x={x - bw / 2}
                width={bw}
                y={Y(s.q3)}
                height={Math.max(1, Y(s.q1) - Y(s.q3))}
                rx={4}
                fill={sel ? "var(--chart-1)" : "var(--chart-base)"}
                fillOpacity={sel ? 0.22 : 1}
                stroke={sel ? "var(--chart-1)" : "none"}
                strokeWidth={1.5}
              />
              <line
                x1={x - bw / 2}
                x2={x + bw / 2}
                y1={Y(s.median)}
                y2={Y(s.median)}
                stroke={sel ? "var(--chart-1)" : "var(--foreground)"}
                strokeWidth={2}
              />
              {showMean && (
                <path
                  d={`M${x},${Y(s.mean) - 4}l4,4l-4,4l-4,-4z`}
                  fill="var(--card)"
                  stroke={stroke}
                  strokeWidth={1.25}
                />
              )}
              {s.outliers.map((v, k) => (
                <circle
                  key={k}
                  cx={x + (k % 2 ? 5 : -5) * (k > 1 ? 1 : 0)}
                  cy={Y(v)}
                  r={3.25}
                  fill={out(v) ? "var(--danger)" : "var(--card)"}
                  stroke={out(v) ? "var(--card)" : stroke}
                  strokeWidth={1.25}
                />
              ))}
              <text
                x={x}
                y={height - m.bottom + 18}
                textAnchor="middle"
                fontSize={12}
                fontWeight={sel ? 600 : 500}
                fill={sel ? "var(--foreground)" : "var(--muted-foreground)"}
              >
                {g.label}
              </text>
              {g.sublabel && (
                <text
                  x={x}
                  y={height - m.bottom + 33}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted-foreground)"
                >
                  {g.sublabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <SvgTooltip x={cx(hover) + bw / 2} y={Y(stats[hover].q3)} width={width}>
          <div className="mb-1 font-medium">
            {groups[hover].label}{" "}
            <span className="font-normal opacity-65">· n = {stats[hover].n}</span>
          </div>
          <TipRow label="Max" value={f(stats[hover].max)} unit={unit} />
          <TipRow label="Q3" value={f(stats[hover].q3)} unit={unit} />
          <TipRow label="Median" value={f(stats[hover].median)} unit={unit} />
          <TipRow label="Mean" value={f(stats[hover].mean)} unit={unit} />
          <TipRow label="Q1" value={f(stats[hover].q1)} unit={unit} />
          <TipRow label="Min" value={f(stats[hover].min)} unit={unit} />
          <TipRow label="IQR" value={f(stats[hover].iqr)} unit={unit} />
          {stats[hover].outliers.length > 0 && (
            <TipRow label="Outliers" value={stats[hover].outliers.length} />
          )}
          {groups[hover].values.some(out) && (
            <div className="mt-1 font-medium text-danger">
              {groups[hover].values.filter(out).length} out of spec
            </div>
          )}
        </SvgTooltip>
      )}
    </div>
  );
}
