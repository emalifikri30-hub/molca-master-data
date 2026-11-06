import * as React from "react";
import { cn } from "@/lib/utils";
import { SPC_CONSTANTS } from "./control-chart";
import { decimalsFor, mean, niceDomain, niceTicks, normalCdf, normalPdf, stdev } from "./spc-stats";
import { SvgTooltip, TipRow, scaleLinear, svgTick, useElementWidth } from "./svg-chart";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export type SpecLimits = { lsl?: number; usl?: number; target?: number };

export type Capability = {
  n: number;
  mean: number;
  /** overall (long-term) σ — sample standard deviation */
  sigmaOverall: number;
  /** within (short-term) σ — R̄/d₂ of subgroups or MR̄/1.128 */
  sigmaWithin: number;
  cp: number;
  cpk: number;
  pp: number;
  ppk: number;
  /** observed parts outside spec, per million */
  ppmObserved: number;
  /** expected parts outside spec from the overall normal fit, per million */
  ppmExpected: number;
};

/**
 * Process capability. Cp = (USL − LSL) / 6σ_within, Cpk = min(USL − μ, μ − LSL) / 3σ_within;
 * Pp / Ppk use the overall σ. One-sided specs: Cp/Pp are NaN and Cpk/Ppk use the available side.
 * Pass `subgroupSize` when values are consecutive rational subgroups (σ_within = R̄/d₂), otherwise MR̄/1.128 is used.
 */
export function capability(
  values: readonly number[],
  {
    lsl,
    usl,
    subgroupSize = 1,
    sigmaWithin,
  }: SpecLimits & { subgroupSize?: number; sigmaWithin?: number },
): Capability {
  const mu = mean(values);
  const so = stdev(values);
  let sw = sigmaWithin;
  if (sw == null) {
    if (subgroupSize >= 2 && SPC_CONSTANTS[subgroupSize]) {
      const ranges: number[] = [];
      for (let i = 0; i + subgroupSize <= values.length; i += subgroupSize) {
        const g = values.slice(i, i + subgroupSize);
        ranges.push(Math.max(...g) - Math.min(...g));
      }
      sw = mean(ranges) / SPC_CONSTANTS[subgroupSize].d2;
    } else {
      sw = mean(values.slice(1).map((v, i) => Math.abs(v - values[i]))) / 1.128;
    }
  }
  const idx = (s: number) => {
    const up = usl != null ? (usl - mu) / (3 * s) : Infinity;
    const lo = lsl != null ? (mu - lsl) / (3 * s) : Infinity;
    return { p: usl != null && lsl != null ? (usl - lsl) / (6 * s) : NaN, pk: Math.min(up, lo) };
  };
  const w = idx(sw);
  const o = idx(so);
  const out = values.filter((v) => (lsl != null && v < lsl) || (usl != null && v > usl)).length;
  const tail =
    (lsl != null ? normalCdf((lsl - mu) / so) : 0) +
    (usl != null ? 1 - normalCdf((usl - mu) / so) : 0);
  return {
    n: values.length,
    mean: mu,
    sigmaOverall: so,
    sigmaWithin: sw,
    cp: w.p,
    cpk: w.pk,
    pp: o.p,
    ppk: o.pk,
    ppmObserved: (out / values.length) * 1e6,
    ppmExpected: tail * 1e6,
  };
}

export type CapabilityTone = "good" | "warning" | "bad";
/** ≥ 1.33 capable (good) · 1.00–1.33 marginal (warning) · < 1.00 not capable (bad). */
export const capabilityTone = (v: number, { good = 1.33, ok = 1 } = {}): CapabilityTone =>
  v >= good ? "good" : v >= ok ? "warning" : "bad";

export type HistogramBin = { x0: number; x1: number; count: number };

/** Equal-width bins aligned to multiples of `binWidth` (default: Freedman–Diaconis rounded to a nice step). */
export function histogramBins(
  values: readonly number[],
  { binWidth }: { binWidth?: number } = {},
): HistogramBin[] {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  let w = binWidth;
  if (!w) {
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const fd = (2 * (q3 - q1)) / Math.cbrt(sorted.length) || (max - min) / 10 || 1;
    const t = niceTicks(0, fd * 4, 4);
    w = t[1] - t[0];
  }
  const start = Math.floor(min / w + 1e-9) * w;
  const n = Math.max(1, Math.ceil((max - start) / w + 1e-9));
  const bins = Array.from({ length: n }, (_, i) => ({
    x0: +(start + i * w).toPrecision(12),
    x1: +(start + (i + 1) * w).toPrecision(12),
    count: 0,
  }));
  for (const v of values)
    bins[Math.min(n - 1, Math.max(0, Math.floor((v - start) / w + 1e-9)))].count++;
  return bins;
}

/* ------------------------------------------------------------------ */
/* Histogram                                                           */
/* ------------------------------------------------------------------ */

export type HistogramCapabilityProps = SpecLimits & {
  values: readonly number[];
  binWidth?: number;
  /** Fitted normal curve(s): overall σ (solid), within σ (dashed) */
  curve?: "overall" | "within" | "both" | "none";
  subgroupSize?: number;
  unit?: string;
  decimals?: number;
  height?: number;
  className?: string;
};

/**
 * Histogram with LSL / USL / target lines and a fitted normal curve. Bins outside the spec turn red.
 * Pair with <CapabilityKpis> for Cp / Cpk / Pp / Ppk.
 */
export function HistogramCapability({
  values,
  lsl,
  usl,
  target,
  binWidth,
  curve = "both",
  subgroupSize = 1,
  unit,
  decimals,
  height = 280,
  className,
}: HistogramCapabilityProps) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = React.useState<number | null>(null);
  const bins = React.useMemo(() => histogramBins(values, { binWidth }), [values, binWidth]);
  const cap = React.useMemo(
    () => capability(values, { lsl, usl, subgroupSize }),
    [values, lsl, usl, subgroupSize],
  );
  const w = bins[0].x1 - bins[0].x0;
  const dec = decimals ?? decimalsFor(w);
  const f = (v: number) => v.toFixed(dec);

  const s = cap.sigmaOverall;
  const xs = [
    bins[0].x0,
    bins[bins.length - 1].x1,
    cap.mean - 3.5 * s,
    cap.mean + 3.5 * s,
    lsl,
    usl,
    target,
  ].filter((v): v is number => v != null);
  const x0 = Math.min(...xs) - w * 0.5;
  const x1 = Math.max(...xs) + w * 0.5;
  const pdfScale = values.length * w; // pdf → expected count per bin
  const maxCount = Math.max(
    ...bins.map((b) => b.count),
    normalPdf(cap.mean, cap.mean, Math.min(s, cap.sigmaWithin)) * pdfScale,
  );
  const yTicks = niceDomain(0, maxCount * 1.05, 4);
  const yMax = yTicks[yTicks.length - 1];

  const m = { top: 28, right: 12, bottom: 28, left: 36 };
  const X = scaleLinear(x0, x1, m.left, width - m.right);
  const Y = scaleLinear(0, yMax, height - m.bottom, m.top);
  const xTicks = niceTicks(x0, x1, Math.max(3, Math.floor(width / 110)));

  const curvePath = (sigma: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const x = x0 + ((x1 - x0) * i) / 120;
      pts.push(
        `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(normalPdf(x, cap.mean, sigma) * pdfScale).toFixed(1)}`,
      );
    }
    return pts.join("");
  };
  const outside = (b: HistogramBin) =>
    (lsl != null && b.x1 <= lsl + 1e-9) || (usl != null && b.x0 >= usl - 1e-9);
  const specLine = (v: number, label: string, kind: "spec" | "target") => (
    <g key={label}>
      <line
        x1={X(v)}
        x2={X(v)}
        y1={m.top - 6}
        y2={height - m.bottom}
        stroke={kind === "spec" ? "var(--danger)" : "var(--foreground)"}
        strokeOpacity={kind === "spec" ? 0.85 : 0.6}
        strokeDasharray={kind === "spec" ? "5 4" : "1 3"}
        strokeWidth={kind === "spec" ? 1.25 : 1.5}
      />
      <text
        x={X(v)}
        y={m.top - 12}
        textAnchor="middle"
        fontSize={11}
        fill="var(--muted-foreground)"
      >
        <tspan fontWeight={600} fill="var(--foreground)">
          {label}
        </tspan>{" "}
        {f(v)}
      </text>
    </g>
  );
  const hb = hover != null ? bins[hover] : null;

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Histogram of ${values.length} values${lsl != null ? `, LSL ${f(lsl)}` : ""}${usl != null ? `, USL ${f(usl)}` : ""}`}
        className="block overflow-visible"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={m.left}
              x2={width - m.right}
              y1={Y(t)}
              y2={Y(t)}
              stroke="var(--border)"
              strokeDasharray={t === 0 ? undefined : "4 4"}
            />
            <text x={m.left - 8} y={Y(t)} dy="0.32em" textAnchor="end" {...svgTick}>
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={height - m.bottom + 18} textAnchor="middle" {...svgTick}>
            {t.toFixed(dec)}
          </text>
        ))}
        {bins.map((b, i) => {
          const bx = X(b.x0) + 1;
          const bw = Math.max(1, X(b.x1) - X(b.x0) - 2);
          const out = outside(b);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={bx - 1}
                y={m.top}
                width={bw + 2}
                height={height - m.top - m.bottom}
                fill={hover === i ? "var(--muted)" : "transparent"}
              />
              {b.count > 0 && (
                <rect
                  x={bx}
                  y={Y(b.count)}
                  width={bw}
                  height={Y(0) - Y(b.count)}
                  rx={Math.min(3, bw / 3)}
                  fill={out ? "var(--danger)" : "var(--chart-base)"}
                />
              )}
            </g>
          );
        })}
        {(curve === "within" || curve === "both") && (
          <path
            d={curvePath(cap.sigmaWithin)}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        )}
        {(curve === "overall" || curve === "both") && (
          <path
            d={curvePath(s)}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {lsl != null && specLine(lsl, "LSL", "spec")}
        {usl != null && specLine(usl, "USL", "spec")}
        {target != null && specLine(target, "Target", "target")}
      </svg>
      {hb && hover != null && (
        <SvgTooltip x={X((hb.x0 + hb.x1) / 2)} y={Y(hb.count)} width={width}>
          <div className="mb-1 opacity-65">
            {f(hb.x0)} – {f(hb.x1)} {unit}
          </div>
          <TipRow label="Count" value={hb.count} />
          <TipRow label="Share" value={((hb.count / values.length) * 100).toFixed(1)} unit="%" />
          {outside(hb) && <div className="mt-1 font-medium text-danger">Out of specification</div>}
        </SvgTooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

const toneCls: Record<CapabilityTone, string> = {
  good: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
};
const toneLabel: Record<CapabilityTone, string> = {
  good: "Capable",
  warning: "Marginal",
  bad: "Not capable",
};

/** Cp / Cpk / Pp / Ppk tiles coloured by threshold (≥ 1.33 good, 1.00–1.33 warning, < 1.00 bad). NaN (one-sided spec) shows “—”. */
export function CapabilityKpis({
  cap,
  show = ["cp", "cpk", "pp", "ppk"],
  className,
}: {
  cap: Capability;
  show?: ("cp" | "cpk" | "pp" | "ppk")[];
  className?: string;
}) {
  const names = { cp: "Cp", cpk: "Cpk", pp: "Pp", ppk: "Ppk" };
  const hints = {
    cp: "potential · within",
    cpk: "actual · within",
    pp: "potential · overall",
    ppk: "actual · overall",
  };
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {show.map((k) => {
        const v = cap[k];
        const ok = Number.isFinite(v);
        const tone = ok ? capabilityTone(v) : null;
        return (
          <div key={k} className="rounded-xl border bg-card px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{names[k]}</span>
              {tone && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                    toneCls[tone],
                  )}
                >
                  {toneLabel[tone]}
                </span>
              )}
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums",
                tone ? toneCls[tone].split(" ")[1] : "text-muted-foreground",
              )}
            >
              {ok ? v.toFixed(2) : "—"}
            </div>
            <div className="text-[11.5px] text-muted-foreground">{hints[k]}</div>
          </div>
        );
      })}
    </div>
  );
}
