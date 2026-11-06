import * as React from "react";
import { useElementWidth, scaleLinear, svgTick } from "./svg-chart";
import { TipBody } from "./hover-tip";
import { cn } from "@/lib/utils";

/** One player on the map. `x`/`y` on the map's scale (default 0–10); omit both to list it in the "not placed" lane. */
export type PositioningItem = {
  id: string;
  label: string;
  x?: number;
  y?: number;
  /** Relative bubble size, e.g. revenue or installed base (any unit; scaled to 6–18 px radius) */
  size?: number;
  /** focus = us (blue), target = where we want to be (dashed ring), context = everyone else (grey) */
  tone?: "focus" | "target" | "context";
  /** Free text shown in the tooltip */
  note?: string;
  /** Shown as "estimate" in the tooltip when the placement is a judgement, not a measured figure */
  estimated?: boolean;
};

export type PositioningAxis = { title: string; low: string; high: string };

export type PositioningMapProps = {
  items: PositioningItem[];
  x: PositioningAxis;
  y: PositioningAxis;
  /** Quadrant titles: top-left, top-right, bottom-left, bottom-right */
  quadrants?: [string, string, string, string];
  /** Scale of both axes (default [0, 10]) */
  domain?: [number, number];
  /** Where the split lines sit (default: the middle of the domain) */
  split?: { x?: number; y?: number };
  /** Arrow from one item to another, e.g. today → target */
  move?: { from: string; to: string };
  /** Title of the lane listing items without a placement */
  unplacedLabel?: string;
  height?: number;
  className?: string;
};

const PAD = { top: 30, right: 16, bottom: 44, left: 44 };

/**
 * Two-axis positioning map (a "magic quadrant"-style competitor map). Labelled bubbles, quadrant titles,
 * split lines, a hover tip per bubble, an optional today → target arrow and a lane for players with no figures.
 * The focus item is blue, everyone else is grey context; labels never use the series colour.
 */
export function PositioningMap({
  items,
  x,
  y,
  quadrants,
  domain = [0, 10],
  split,
  move,
  unplacedLabel = "Not placed (no figures)",
  height = 420,
  className,
}: PositioningMapProps) {
  const [wrapRef, width] = useElementWidth(720);
  // tooltip sits beside the bubble on the side with more room and is clamped inside the chart, so it never clips
  const [tip, setTip] = React.useState<{
    cx: number;
    cy: number;
    r: number;
    content: React.ReactNode;
  } | null>(null);
  const placed = items.filter((i) => i.x != null && i.y != null);
  const unplaced = items.filter((i) => i.x == null || i.y == null);
  const sx = scaleLinear(domain[0], domain[1], PAD.left, width - PAD.right);
  const sy = scaleLinear(domain[0], domain[1], height - PAD.bottom, PAD.top);
  const mx = sx(split?.x ?? (domain[0] + domain[1]) / 2);
  const my = sy(split?.y ?? (domain[0] + domain[1]) / 2);
  const sizes = placed.map((i) => i.size ?? 1);
  const rOf = scaleLinear(Math.min(...sizes), Math.max(...sizes), 6, 18);
  const radius = (i: PositioningItem) =>
    sizes.every((s) => s === sizes[0]) ? 8 : rOf(i.size ?? 1);

  // labels: try right, then left of the bubble, then step up/down until the box clears every other label and bubble
  const labels = React.useMemo(() => {
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const out: { id: string; lx: number; ly: number; anchor: "start" | "end" | "middle" }[] = [];
    const boxes: Box[] = placed.map((i) => ({
      x0: sx(i.x!) - radius(i),
      x1: sx(i.x!) + radius(i),
      y0: sy(i.y!) - radius(i),
      y1: sy(i.y!) + radius(i),
    }));
    const hits = (b: Box, own: Box) =>
      boxes.some((o) => o !== own && b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const sorted = placed
      .map((i, k) => ({ i, own: boxes[k] }))
      .sort((a, b) => radius(b.i) - radius(a.i));
    for (const { i, own } of sorted) {
      const cx = sx(i.x!);
      const cy = sy(i.y!);
      const r = radius(i);
      const w = i.label.length * 6.2;
      let pick: { lx: number; ly: number; anchor: "start" | "end" | "middle"; box: Box } | null =
        null;
      // beside the bubble first
      for (const side of ["start", "end"] as const) {
        const lx = side === "start" ? cx + r + 4 : cx - r - 4;
        const x0 = side === "start" ? lx : lx - w;
        const box = { x0, x1: x0 + w, y0: cy - 6, y1: cy + 7 };
        if (pick || box.x0 < PAD.left || box.x1 > width - PAD.right) continue;
        if (!hits(box, own)) pick = { lx, ly: cy + 4, anchor: side, box };
      }
      // then centred below or above it
      for (const ly of [cy + r + 12, cy - r - 4]) {
        const box = { x0: cx - w / 2, x1: cx + w / 2, y0: ly - 10, y1: ly + 3 };
        if (
          pick ||
          box.x0 < PAD.left ||
          box.x1 > width - PAD.right ||
          box.y0 < PAD.top ||
          box.y1 > height - PAD.bottom
        )
          continue;
        if (!hits(box, own)) pick = { lx: cx, ly, anchor: "middle", box };
      }
      for (const dy of [0, 13, -13, 26, -26, 39, -39]) {
        if (pick) break;
        for (const side of ["start", "end"] as const) {
          const lx = side === "start" ? cx + r + 4 : cx - r - 4;
          const x0 = side === "start" ? lx : lx - w;
          const ly = cy + 4 + dy;
          const box = { x0, x1: x0 + w, y0: ly - 10, y1: ly + 3 };
          if (box.x0 < PAD.left || box.x1 > width - PAD.right) continue;
          if (!hits(box, own)) {
            pick = { lx, ly, anchor: side, box };
            break;
          }
        }
        if (pick) break;
      }
      if (!pick) {
        const lx = cx + r + 4;
        pick = {
          lx,
          ly: cy + 4,
          anchor: "start",
          box: { x0: lx, x1: lx + w, y0: cy - 6, y1: cy + 7 },
        };
      }
      boxes.push(pick.box);
      out.push({ id: i.id, lx: pick.lx, ly: pick.ly, anchor: pick.anchor });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.map((p) => `${p.id}${p.x}${p.y}${p.size}`).join(), width, height]);

  const byId = (id: string) => placed.find((p) => p.id === id);
  const from = move && byId(move.from);
  const to = move && byId(move.to);
  const ticks = Array.from({ length: 6 }, (_, k) => domain[0] + ((domain[1] - domain[0]) * k) / 5);

  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <div className="relative min-w-0">
        <div ref={wrapRef} className="w-full min-w-0 overflow-hidden">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${y.title} vs ${x.title}`}
            className="block"
          >
            <defs>
              <marker
                id="pm-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill="var(--chart-1)" />
              </marker>
            </defs>
            {/* quadrant tint: top-right is the strongest corner */}
            <rect
              x={mx}
              y={PAD.top}
              width={width - PAD.right - mx}
              height={my - PAD.top}
              fill="var(--chart-1)"
              fillOpacity={0.05}
            />
            <rect
              x={PAD.left}
              y={PAD.top}
              width={width - PAD.left - PAD.right}
              height={height - PAD.top - PAD.bottom}
              fill="none"
              stroke="var(--border)"
            />
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={sx(t)}
                  x2={sx(t)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              </g>
            ))}
            <line
              x1={mx}
              x2={mx}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke="var(--muted-foreground)"
              strokeDasharray="1 3"
              strokeWidth={1.5}
            />
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={my}
              y2={my}
              stroke="var(--muted-foreground)"
              strokeDasharray="1 3"
              strokeWidth={1.5}
            />
            {quadrants && (
              <g
                className="text-[11px] font-semibold uppercase tracking-wide"
                fill="var(--muted-foreground)"
              >
                <text x={PAD.left + 2} y={PAD.top - 10}>
                  {quadrants[0]}
                </text>
                <text x={width - PAD.right - 2} y={PAD.top - 10} textAnchor="end">
                  {quadrants[1]}
                </text>
                <text x={PAD.left + 8} y={height - PAD.bottom - 8}>
                  {quadrants[2]}
                </text>
                <text x={width - PAD.right - 8} y={height - PAD.bottom - 8} textAnchor="end">
                  {quadrants[3]}
                </text>
              </g>
            )}
            {/* axes: title in the middle, low/high at the ends */}
            <g style={svgTick}>
              <text
                x={PAD.left}
                y={height - PAD.bottom + 18}
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {x.low}
              </text>
              <text
                x={width - PAD.right}
                y={height - PAD.bottom + 18}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {x.high}
              </text>
              <text
                x={(PAD.left + width - PAD.right) / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={12}
                fontWeight={500}
              >
                {x.title} →
              </text>
              <text
                transform={`translate(${PAD.left - 10} ${height - PAD.bottom}) rotate(-90)`}
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {y.low}
              </text>
              <text
                transform={`translate(${PAD.left - 10} ${PAD.top}) rotate(-90)`}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {y.high}
              </text>
              <text
                transform={`translate(${PAD.left - 28} ${(PAD.top + height - PAD.bottom) / 2}) rotate(-90)`}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={12}
                fontWeight={500}
              >
                {y.title} →
              </text>
            </g>
            {from && to && (
              <line
                x1={sx(from.x!)}
                y1={sy(from.y!)}
                x2={sx(to.x!)}
                y2={sy(to.y!)}
                stroke="var(--chart-1)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                markerEnd="url(#pm-arrow)"
              />
            )}
            {placed.map((i) => {
              const cx = sx(i.x!);
              const cy = sy(i.y!);
              const r = radius(i);
              const tone = i.tone ?? "context";
              const tipContent = (
                <TipBody
                  title={i.label}
                  rows={[
                    { label: x.title, value: i.x!.toFixed(1) },
                    { label: y.title, value: i.y!.toFixed(1) },
                  ]}
                  note={
                    [i.note, i.estimated ? "Estimate" : null].filter(Boolean).join(" · ") ||
                    undefined
                  }
                />
              );
              return (
                <g
                  key={i.id}
                  tabIndex={0}
                  className="outline-none"
                  onMouseEnter={() => setTip({ cx, cy, r, content: tipContent })}
                  onMouseLeave={() => setTip(null)}
                  onFocus={() => setTip({ cx, cy, r, content: tipContent })}
                  onBlur={() => setTip(null)}
                >
                  <circle cx={cx} cy={cy} r={Math.max(r + 6, 14)} fill="transparent" />
                  {tone === "target" ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="var(--card)"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                    />
                  ) : (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={tone === "focus" ? "var(--chart-1)" : "var(--muted-foreground)"}
                      fillOpacity={tone === "focus" ? 1 : 0.4}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
            {labels.map((l) => {
              const i = byId(l.id)!;
              return (
                <text
                  key={l.id}
                  x={l.lx}
                  y={l.ly}
                  textAnchor={l.anchor}
                  fontSize={11.5}
                  fontWeight={i.tone === "context" || !i.tone ? 400 : 600}
                  fill={
                    i.tone === "context" || !i.tone
                      ? "var(--muted-foreground)"
                      : "var(--foreground)"
                  }
                  className="pointer-events-none"
                  stroke="var(--card)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {i.label}
                </text>
              );
            })}
          </svg>
        </div>
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-30 w-max max-w-[min(16rem,calc(50%-1rem))] rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg"
            style={{
              left: tip.cx < width / 2 ? tip.cx + tip.r + 10 : undefined,
              right: tip.cx >= width / 2 ? width - tip.cx + tip.r + 10 : undefined,
              top: tip.cy < height / 2 ? Math.max(4, tip.cy - 16) : undefined,
              bottom: tip.cy >= height / 2 ? Math.max(4, height - tip.cy - 16) : undefined,
            }}
          >
            {tip.content}
          </div>
        )}
      </div>
      {unplaced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{unplacedLabel}:</span>
          {unplaced.map((i) => (
            <span
              key={i.id}
              title={i.note}
              className="rounded-md border border-dashed px-2 py-0.5 text-muted-foreground"
            >
              {i.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legend for the three tones. */
/** Pass `target={null}` when the map has no target item. */
export function PositioningLegend({
  focus = "Us today",
  target = "Target position",
  context = "Competitors",
}: {
  focus?: string;
  target?: string | null;
  context?: string;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-chart-1" />
        {focus}
      </span>
      {target && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-dashed border-chart-1" />
          {target}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/40" />
        {context}
      </span>
    </div>
  );
}
