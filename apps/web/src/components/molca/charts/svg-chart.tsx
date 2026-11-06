import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Measures an element's width with ResizeObserver so custom SVG charts can lay out in real pixels
 * (crisp 1px lines, unscaled text). Renders with `fallback` on the server and first paint.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 720) {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Linear scale d0..d1 → r0..r1 */
export const scaleLinear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Dark neutral tooltip for custom SVG charts — same look as ChartTooltipPanel. Position in container px. */
export function SvgTooltip({
  x,
  y,
  width,
  children,
  className,
}: {
  x: number;
  y: number;
  width: number;
  children: React.ReactNode;
  className?: string;
}) {
  const flip = x > width - 200;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 min-w-36 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg",
        className,
      )}
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      {children}
    </div>
  );
}

/** One label/value row inside a tooltip. */
export function TipRow({
  label,
  value,
  unit,
  color,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 opacity-65">
        {color && <span className="size-2.5 rounded-[3px]" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
      </span>
    </div>
  );
}

/** Axis tick text style for custom SVG charts (matches Recharts ticks inside ChartContainer). */
export const svgTick = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

/** Y-axis width that fits the longest formatted tick (Recharts does not measure it). */
export function axisWidth(ticks: number[], format?: (v: number) => string, min = 36) {
  const longest = Math.max(...ticks.map((v) => (format ? format(v) : String(v)).length));
  return Math.max(min, Math.round(longest * 7 + 14));
}

/** Evenly spaced "nice" ticks from 0 to niceMax(max), used to size the axis before render. */
export function zeroTicks(max: number, count = 5) {
  const step = max / (count - 1);
  return Array.from({ length: count }, (_, i) => +(step * i).toFixed(6));
}

/**
 * Category tick that never hides labels: wraps to at most two lines within the band width and ends with "…".
 * Use with `interval={0}`: <XAxis tick={<CategoryTick />} interval={0} />
 */
export function CategoryTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  width?: number;
  visibleTicksCount?: number;
}) {
  const { x = 0, y = 0, payload, width = 600, visibleTicksCount = 1 } = props;
  const band = Math.max(40, width / Math.max(1, visibleTicksCount) - 6);
  const maxChars = Math.max(5, Math.floor(band / 6.4));
  const words = String(payload?.value ?? "").split(/\s+/);
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length <= maxChars) lines[lines.length - 1] = (cur + " " + w).trim();
    else if (lines.length < 2) lines.push(w);
    else {
      lines[1] = (lines[1] + " " + w).trim();
    }
  }
  const out = lines.map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + "…" : l));
  return (
    <text x={x} y={y + 4} textAnchor="middle" fontSize={11.5} fill="var(--muted-foreground)">
      <title>{payload?.value}</title>
      {out.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 8 : 13}>
          {l}
        </tspan>
      ))}
    </text>
  );
}
