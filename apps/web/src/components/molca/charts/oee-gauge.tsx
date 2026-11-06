import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltipPanel } from "./chart-tooltip";
import { OEE_CLASSES_4, oeeClass, oeeRampColor, type OeeClass } from "@/lib/oee";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** Class bands as [from, to] ranges for a scale. */
export function oeeBands(scale: OeeClass[] = OEE_CLASSES_4) {
  return scale.map((c, i) => ({ ...c, from: c.min, to: scale[i + 1]?.min ?? 100 }));
}

export type OeeMarker = { value: number; label: string };

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

/** Pill filled with the OEE benchmark class color. Text is dark on yellow / lime fills (see oee.ts). */
export function OeeClassBadge({
  value,
  scale = OEE_CLASSES_4,
  showValue = false,
  className,
}: {
  value: number;
  scale?: OeeClass[];
  showValue?: boolean;
  className?: string;
}) {
  const c = oeeClass(value, scale);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap",
        c.text,
        className,
      )}
      style={{ background: c.color }}
      title={`OEE ${value.toFixed(1)}% — ${c.label}`}
    >
      {showValue && <span className="tabular-nums">{value.toFixed(1)}%</span>}
      {showValue && (
        <span aria-hidden className="opacity-50">
          ·
        </span>
      )}
      {c.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge                                                               */
/* ------------------------------------------------------------------ */

export type OeeGaugeProps = {
  /** OEE in percent (0–100) */
  value: number;
  /** Optional second marker, e.g. { value: 85, label: "World class" } or { value: 72, label: "Industry" } */
  compare?: OeeMarker;
  /** Benchmark scale used for the class chip and the boundary labels */
  scale?: OeeClass[];
  /** Number of ticks on the arc. 40 = 2.5 % per tick, so 40 / 60 / 85 all fall on tick edges. */
  ticks?: number;
  /** Width in px; height is ~0.6 × width */
  size?: number;
  label?: string;
  className?: string;
};

/** Small chip for the class: colored dot + label on a neutral surface (quieter than the filled badge). */
export function OeeClassChip({ cls }: { cls: OeeClass }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] font-medium whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: cls.color }} />
      {cls.label}
    </span>
  );
}

/**
 * OEE tick gauge (Mebius style): a half circle of thin rounded ticks. Ticks up to the value take the
 * 10-step OEE ramp (lib/oee — Foundation colors only), the rest stay chart-base grey. The value sits
 * inside the arc with a muted unit, the benchmark class as a quiet chip, boundaries as small labels.
 */
export function OeeGauge({
  value,
  compare,
  scale = OEE_CLASSES_4,
  ticks = 40,
  size = 280,
  label = "OEE",
  className,
}: OeeGaugeProps) {
  const id = React.useId();
  const w = size;
  const pad = 18;
  const rOut = w / 2 - pad;
  const len = w * 0.075;
  const rIn = rOut - len;
  const cx = w / 2;
  const cy = rOut + pad;
  const h = cy + 4;
  const stroke = Math.max(2, w * 0.011);
  const v = clamp(value);
  const cls = oeeClass(v, scale);
  // rounded so server and client render identical attributes (no hydration mismatch)
  const pt = (val: number, rad: number) => {
    const a = Math.PI * (1 - clamp(val) / 100);
    return [+(cx + rad * Math.cos(a)).toFixed(2), +(cy - rad * Math.sin(a)).toFixed(2)] as const;
  };
  const step = 100 / ticks;
  return (
    <figure
      className={cn("inline-flex flex-col items-center", className)}
      aria-labelledby={`${id}-cap`}
    >
      <div className="relative" style={{ width: w, height: h }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
          className="absolute inset-0"
        >
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const at = i * step;
            const on = at <= v && v > 0;
            const [x0, y0] = pt(at, rIn);
            const [x1, y1] = pt(at, rOut);
            return (
              <line
                key={i}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke={on ? oeeRampColor(Math.min(at, 99.9)) : "var(--chart-base)"}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
            );
          })}
          {/* benchmark boundaries: short foreground marks just outside the ticks */}
          {scale.slice(1).map((c) => {
            const [x0, y0] = pt(c.min, rOut + 4);
            const [x1, y1] = pt(c.min, rOut + 8);
            const [tx, ty] = pt(c.min, rOut + 14);
            return (
              <g key={c.id}>
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                />
                <text
                  x={tx}
                  y={ty}
                  fontSize={10}
                  fill="var(--muted-foreground)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="tabular-nums"
                >
                  {c.min}
                </text>
              </g>
            );
          })}
          {/* compare marker: a foreground dot on the inner edge */}
          {compare &&
            (() => {
              const [mx, my] = pt(compare.value, rIn - 7);
              return <circle cx={mx} cy={my} r={3} fill="var(--foreground)" />;
            })()}
        </svg>
        <div
          id={`${id}-cap`}
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5"
        >
          <span className="text-[12.5px] text-muted-foreground">{label}</span>
          <span
            className="inline-flex items-baseline gap-0.5 leading-none font-semibold tracking-[-0.03em] tabular-nums"
            style={{ fontSize: Math.round(w * 0.13) }}
          >
            {value.toFixed(1)}
            <span className="text-[0.45em] font-medium text-muted-foreground">%</span>
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-col items-center gap-1.5">
        <OeeClassChip cls={cls} />
        {compare && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-foreground" />
            {compare.label}{" "}
            <b className="font-semibold text-foreground tabular-nums">{compare.value}%</b>
          </span>
        )}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Linear benchmark bar                                                */
/* ------------------------------------------------------------------ */

export type OeeBenchmarkBarProps = {
  value: number;
  /** Extra markers below the bar (industry average, target…) */
  markers?: OeeMarker[];
  scale?: OeeClass[];
  youLabel?: string;
  className?: string;
};

/** 0–100 scale with the benchmark classes as bands, “You” above and reference markers below. */
export function OeeBenchmarkBar({
  value,
  markers = [],
  scale = OEE_CLASSES_4,
  youLabel = "You",
  className,
}: OeeBenchmarkBarProps) {
  const bands = oeeBands(scale);
  const cls = oeeClass(value, scale);
  const pos = (v: number) => `${clamp(v)}%`;
  return (
    <div
      className={cn("w-full", className)}
      role="img"
      aria-label={`OEE ${value.toFixed(1)}%, ${cls.label}. ${markers.map((m) => `${m.label} ${m.value}%`).join(", ")}`}
    >
      {/* you marker */}
      <div className="relative h-8">
        <div
          className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: pos(value) }}
        >
          <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-background tabular-nums">
            {youLabel} {value.toFixed(1)}%
          </span>
          <span className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground" />
        </div>
      </div>
      {/* bands */}
      <div className="relative mt-1 flex h-2 gap-[3px]">
        {bands.map((b) => (
          <div
            key={b.id}
            className="h-full rounded-full"
            style={{ width: `${b.to - b.from}%`, background: b.color }}
          />
        ))}
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-foreground shadow-sm"
          style={{ left: pos(value) }}
        />
        {markers.map((m) => (
          <div
            key={m.label}
            className="absolute inset-y-0 w-0 -translate-x-1/2 border-l-2 border-dashed border-foreground/70"
            style={{ left: pos(m.value) }}
          />
        ))}
      </div>
      {/* class labels */}
      <div className="mt-1.5 flex text-[11.5px] text-muted-foreground">
        {bands.map((b) => (
          <div
            key={b.id}
            className={cn("truncate pr-1", b.id === cls.id && "font-semibold text-foreground")}
            style={{ width: `${b.to - b.from}%` }}
            title={b.label}
          >
            <span className="tabular-nums">{b.from}</span> · {b.label}
          </div>
        ))}
      </div>
      {/* reference markers */}
      {markers.length > 0 && (
        // listed, not positioned under the bar: nearby markers would overlap; the dashed ticks show where they are
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          {markers.map((m) => (
            <span key={m.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2.5 border-l-2 border-dashed border-foreground/70" />
              {m.label} <b className="font-semibold text-foreground tabular-nums">{m.value}%</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A × P × Q breakdown                                                 */
/* ------------------------------------------------------------------ */

export type OeeBreakdownProps = {
  /** Availability (%) */
  availability: number;
  /** Performance (%) — “Effectiveness” in ISO 22400-2 */
  performance: number;
  /** Quality (%) — “Quality ratio” in ISO 22400-2 */
  quality: number;
  scale?: OeeClass[];
  /** Use ISO 22400-2 names (Availability · Effectiveness · Quality ratio) */
  isoNames?: boolean;
  className?: string;
};

/** OEE = A × P × Q as three factor tiles with blue bars (good metrics), and the result colored by its class. */
export function OeeBreakdown({
  availability,
  performance,
  quality,
  scale = OEE_CLASSES_4,
  isoNames = false,
  className,
}: OeeBreakdownProps) {
  const oee = (availability * performance * quality) / 10000;
  const factors = [
    { k: "A", name: "Availability", v: availability },
    { k: isoNames ? "E" : "P", name: isoNames ? "Effectiveness" : "Performance", v: performance },
    { k: isoNames ? "QR" : "Q", name: isoNames ? "Quality ratio" : "Quality", v: quality },
  ];
  const weakest = factors.reduce((a, b) => (b.v < a.v ? b : a));
  return (
    <div
      className={cn(
        "grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.1fr]",
        className,
      )}
    >
      {factors.map((f, i) => (
        <React.Fragment key={f.k}>
          <div
            className={cn(
              "rounded-xl border bg-card p-3",
              f === weakest && "ring-2 ring-highlight/60",
            )}
          >
            <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>{f.name}</span>
              <span className="font-mono text-[11.5px]">{f.k}</span>
            </div>
            <div className="mt-1 text-xl font-semibold tracking-[-0.02em] tabular-nums">
              {f.v.toFixed(1)}
              <span className="text-sm font-medium text-muted-foreground">%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${clamp(f.v)}%` }} />
            </div>
            {f === weakest && (
              <div className="mt-1.5 text-[11.5px] text-highlight">Biggest loss</div>
            )}
          </div>
          <span className="hidden self-center text-lg text-muted-foreground sm:block" aria-hidden>
            {i < 2 ? "×" : "="}
          </span>
        </React.Fragment>
      ))}
      <div className="flex flex-col justify-between rounded-xl border bg-subtle p-3">
        <div className="text-[12.5px] text-muted-foreground">{isoNames ? "OEE index" : "OEE"}</div>
        <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums">
          {oee.toFixed(1)}
          <span className="text-sm font-medium text-muted-foreground">%</span>
        </div>
        <div className="mt-2">
          <OeeClassChip cls={oeeClass(oee, scale)} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OEE by line                                                         */
/* ------------------------------------------------------------------ */

export type OeeByLineChartProps = {
  data: { line: string; oee: number }[];
  scale?: OeeClass[];
  /** Dashed reference line (default 85 = world class) */
  target?: number;
  targetLabel?: string;
  height?: number;
  className?: string;
};

/** Bars colored by their OEE benchmark class, with a dashed world-class reference line. */
export function OeeByLineChart({
  data,
  scale = OEE_CLASSES_4,
  target = 85,
  targetLabel = "World class",
  height = 260,
  className,
}: OeeByLineChartProps) {
  const config = { oee: { label: "OEE", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <BarChart
        data={data}
        margin={{ top: 22, right: 92, left: 0, bottom: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="line" tickLine={false} axisLine={false} tickMargin={10} interval={0} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipPanel
              unit="%"
              footer={(p) => (
                <span className="opacity-80">
                  {oeeClass(Number(p[0]?.value ?? 0), scale).label}
                </span>
              )}
            />
          }
        />
        <ReferenceLine
          y={target}
          stroke="var(--foreground)"
          strokeDasharray="4 4"
          strokeOpacity={0.6}
          label={{
            value: `${targetLabel} ${target}%`,
            position: "right",
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }}
        />
        <Bar dataKey="oee" name="OEE" radius={[6, 6, 2, 2]}>
          {data.map((d) => (
            <Cell key={d.line} fill={oeeClass(d.oee, scale).color} />
          ))}
          <LabelList
            dataKey="oee"
            position="top"
            fontSize={11.5}
            fill="var(--foreground)"
            formatter={(v: unknown) => `${Number(v).toFixed(1)}`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Legend chips for an OEE class scale. */
export function OeeClassLegend({
  scale = OEE_CLASSES_4,
  className,
}: {
  scale?: OeeClass[];
  className?: string;
}) {
  const bands = oeeBands(scale);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {bands.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: b.color }} />
          {b.label}
          <span className="tabular-nums">
            {b.from === 0 ? `<${b.to}` : b.to === 100 ? `≥${b.from}` : `${b.from}–${b.to}`}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview: gauge + benchmark + factors in one dense block            */
/* ------------------------------------------------------------------ */

export type OeeOverviewProps = {
  availability: number;
  performance: number;
  quality: number;
  scale?: OeeClass[];
  /** Benchmark bar markers, e.g. industry average and target */
  markers?: OeeMarker[];
  /** Gauge dot inside the arc, e.g. last shift */
  compare?: OeeMarker;
  /** Label of the “you” pin on the benchmark bar */
  youLabel?: string;
  /** ISO 22400-2 factor names (Availability · Effectiveness · Quality ratio) */
  isoNames?: boolean;
  gaugeSize?: number;
  className?: string;
};

/**
 * The OEE summary as one compact block: tick gauge on the left; benchmark bar and the A × P × Q
 * factors stacked on the right so both columns end at the same height (no floating whitespace).
 * OEE is computed from the factors.
 */
export function OeeOverview({
  availability,
  performance,
  quality,
  scale = OEE_CLASSES_4,
  markers = [],
  compare,
  youLabel = "You",
  isoNames = false,
  gaugeSize = 220,
  className,
}: OeeOverviewProps) {
  const oee = (availability * performance * quality) / 10000;
  const factors = [
    { k: "A", name: "Availability", v: availability },
    { k: isoNames ? "E" : "P", name: isoNames ? "Effectiveness" : "Performance", v: performance },
    { k: isoNames ? "QR" : "Q", name: isoNames ? "Quality ratio" : "Quality", v: quality },
  ];
  const weakest = factors.reduce((a, b) => (b.v < a.v ? b : a));
  return (
    // container query: side by side only when the block itself is wide enough (cards, mockup panels, full pages)
    <div className={cn("@container", className)}>
      <div className="grid items-center gap-x-8 gap-y-5 @[620px]:grid-cols-[auto_minmax(0,1fr)]">
        <OeeGauge
          value={oee}
          compare={compare}
          scale={scale}
          size={gaugeSize}
          className="justify-self-center"
        />
        <div className="grid min-w-0 gap-4">
          <OeeBenchmarkBar value={oee} scale={scale} markers={markers} youLabel={youLabel} />
          <div className="grid grid-cols-3 divide-x rounded-xl border">
            {factors.map((f) => (
              <div key={f.k} className="min-w-0 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                  <span className="truncate">{f.name}</span>
                  <span className="font-mono text-[11px]">{f.k}</span>
                </div>
                <div className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
                  {f.v.toFixed(1)}
                  <span className="text-[13px] font-medium text-muted-foreground">%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      f === weakest ? "bg-chart-1" : "bg-muted-foreground/35",
                    )}
                    style={{ width: `${clamp(f.v)}%` }}
                  />
                </div>
                <div
                  className={cn(
                    "mt-1.5 h-4 text-[11.5px]",
                    f === weakest ? "text-highlight" : "text-transparent",
                  )}
                >
                  {f === weakest ? "Biggest loss" : "·"}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            OEE = {factors.map((f) => f.k).join(" × ")} ={" "}
            {factors.map((f) => f.v.toFixed(1)).join(" × ")} % ={" "}
            <b className="font-semibold text-foreground">{oee.toFixed(1)} %</b>
          </p>
        </div>
      </div>
    </div>
  );
}
