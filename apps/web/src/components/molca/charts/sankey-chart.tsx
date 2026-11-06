"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";

export type SankeyNode = {
  id: string;
  label: string;
  /** Fill of the node bar (and of its outgoing links when linkColor="source"). Default: var(--chart-base) */
  color?: string;
  /** Force a column (0 = left). Default: longest path from a source. */
  column?: number;
  /** Secondary text under the label, e.g. "FPY 91.0%" */
  note?: string;
};
export type SankeyLink = {
  source: string;
  target: string;
  value: number;
  /** Override the band color, e.g. var(--sys-red) for a loss */ color?: string;
};

export type SankeyChartProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  unit?: string;
  valueFormatter?: (v: number) => string;
  /** Band color from the source node (default) or the target node */
  linkColor?: "source" | "target";
  height?: number;
  nodeWidth?: number;
  nodePadding?: number;
  /** Space reserved for labels left of the first and right of the last column */
  labelWidth?: number;
  /** Percentages relative to this total (default: sum of the first column) */
  total?: number;
  summary?: string;
  className?: string;
};

type LNode = SankeyNode & {
  col: number;
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  inOff: number;
  outOff: number;
};
type LLink = SankeyLink & { s: LNode; t: LNode; sy: number; ty: number; w: number; i: number };

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

function useWidth<T extends HTMLElement>(initial = 720) {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(initial);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Column assignment, node values, vertical stacking and link offsets. */
function layout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  W: number,
  H: number,
  nodeW: number,
  pad: number,
  labelW: number,
) {
  const byId = new Map<string, LNode>();
  nodes.forEach((n) =>
    byId.set(n.id, {
      ...n,
      col: n.column ?? 0,
      value: 0,
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
      inOff: 0,
      outOff: 0,
    }),
  );
  // longest path from sources (bounded iterations guard against cycles)
  if (nodes.some((n) => n.column == null)) {
    for (let k = 0; k < nodes.length; k++)
      links.forEach((l) => {
        const s = byId.get(l.source),
          t = byId.get(l.target);
        if (s && t && t.column == null && t.col < s.col + 1) t.col = s.col + 1;
      });
  }
  const ins = new Map<string, number>(),
    outs = new Map<string, number>();
  links.forEach((l) => {
    outs.set(l.source, (outs.get(l.source) ?? 0) + l.value);
    ins.set(l.target, (ins.get(l.target) ?? 0) + l.value);
  });
  byId.forEach((n) => (n.value = Math.max(ins.get(n.id) ?? 0, outs.get(n.id) ?? 0)));
  const all = [...byId.values()];
  const cols = Math.max(...all.map((n) => n.col)) + 1;
  const columns = Array.from({ length: cols }, (_, c) => all.filter((n) => n.col === c));
  const k = Math.min(
    ...columns.map(
      (col) => (H - pad * (col.length - 1)) / (col.reduce((s, n) => s + n.value, 0) || 1),
    ),
  );
  const inner = W - labelW * 2 - nodeW;
  columns.forEach((col, c) => {
    const h = col.reduce((s, n) => s + n.value * k, 0) + pad * (col.length - 1);
    let y = (H - h) / 2;
    col.forEach((n) => {
      n.x0 = labelW + (cols > 1 ? (inner * c) / (cols - 1) : 0);
      n.x1 = n.x0 + nodeW;
      n.y0 = y;
      n.y1 = y + n.value * k;
      y = n.y1 + pad;
    });
  });
  const ll: LLink[] = links
    .map((l, i) => ({
      ...l,
      s: byId.get(l.source)!,
      t: byId.get(l.target)!,
      sy: 0,
      ty: 0,
      w: l.value * k,
      i,
    }))
    .filter((l) => l.s && l.t);
  // order bands to minimise crossings
  [...ll]
    .sort((a, b) => a.t.y0 - b.t.y0)
    .forEach((l) => ((l.sy = l.s.y0 + l.s.outOff), (l.s.outOff += l.w)));
  [...ll]
    .sort((a, b) => a.s.y0 - b.s.y0)
    .forEach((l) => ((l.ty = l.t.y0 + l.t.inOff), (l.t.inOff += l.w)));
  return { nodes: all, links: ll, cols };
}

/**
 * Sankey diagram (custom SVG): energy flow from grid / solar to lines and utilities, or material yield from input to good / rework / scrap.
 * Band width is proportional to the flow. Hover a band or a node for values and share of the total.
 */
export function SankeyChart({
  nodes,
  links,
  unit,
  valueFormatter = fmt,
  linkColor = "source",
  height = 320,
  nodeWidth = 12,
  nodePadding = 14,
  labelWidth = 116,
  total,
  summary,
  className,
}: SankeyChartProps) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const tip = useHoverTip<HTMLDivElement>();
  const [hover, setHover] = React.useState<{ link?: number; node?: string } | null>(null);
  const L = React.useMemo(
    () => layout(nodes, links, W, height, nodeWidth, nodePadding, labelWidth),
    [nodes, links, W, height, nodeWidth, nodePadding, labelWidth],
  );
  const base = total ?? L.nodes.filter((n) => n.col === 0).reduce((s, n) => s + n.value, 0);
  const pct = (v: number) => `${((v / (base || 1)) * 100).toFixed(1)}%`;
  const u = unit ? ` ${unit}` : "";
  const active = (l: LLink) =>
    !hover || hover.link === l.i || hover.node === l.source || hover.node === l.target;

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
      <div ref={tip.ref} className="relative">
        <svg
          width={W}
          height={height}
          role="img"
          aria-label={summary}
          className="block overflow-visible"
        >
          {L.links.map((l) => {
            const x0 = l.s.x1,
              x1 = l.t.x0,
              xm = (x0 + x1) / 2;
            const d = `M${x0},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${x1},${l.ty} L${x1},${l.ty + l.w} C${xm},${l.ty + l.w} ${xm},${l.sy + l.w} ${x0},${l.sy + l.w} Z`;
            const c =
              l.color ?? (linkColor === "target" ? l.t.color : l.s.color) ?? "var(--chart-base)";
            return (
              <path
                key={l.i}
                d={d}
                fill={c}
                fillOpacity={active(l) ? (hover ? 0.62 : 0.38) : 0.12}
                className="transition-[fill-opacity] duration-150"
                onMouseMove={(e) => {
                  setHover({ link: l.i });
                  tip.show(
                    e,
                    <TipBody
                      title={`${l.s.label} → ${l.t.label}`}
                      value={valueFormatter(l.value)}
                      unit={unit}
                      color={c}
                      note={`${pct(l.value)} of total · ${((l.value / (l.s.value || 1)) * 100).toFixed(1)}% of ${l.s.label}`}
                    />,
                    { pointer: true },
                  );
                }}
                onMouseLeave={() => (setHover(null), tip.hide())}
              />
            );
          })}
          {L.nodes.map((n) => {
            const last = n.col === L.cols - 1;
            const first = n.col === 0;
            const tx = last ? n.x1 + 8 : first ? n.x0 - 8 : n.x1 + 6;
            const anchor = first ? "end" : "start";
            const cy = (n.y0 + n.y1) / 2;
            return (
              <g
                key={n.id}
                onMouseEnter={(e) => {
                  setHover({ node: n.id });
                  tip.show(
                    e,
                    <TipBody
                      title={n.label}
                      value={valueFormatter(n.value)}
                      unit={unit}
                      color={n.color ?? "var(--chart-base)"}
                      note={n.note ?? `${pct(n.value)} of total`}
                    />,
                  );
                }}
                onMouseLeave={() => (setHover(null), tip.hide())}
              >
                <rect
                  x={n.x0}
                  y={n.y0}
                  width={nodeWidth}
                  height={Math.max(2, n.y1 - n.y0)}
                  rx={3}
                  fill={n.color ?? "var(--chart-base)"}
                />
                <text
                  x={tx}
                  y={cy - 2}
                  textAnchor={anchor}
                  fontSize={12}
                  fontWeight={500}
                  className="fill-foreground"
                  style={{
                    paintOrder: "stroke",
                    stroke: "var(--card)",
                    strokeWidth: first || last ? 0 : 4,
                    strokeLinejoin: "round",
                  }}
                >
                  {n.label}
                </text>
                <text
                  x={tx}
                  y={cy + 12}
                  textAnchor={anchor}
                  fontSize={11.5}
                  className="fill-muted-foreground tabular-nums"
                  style={{
                    paintOrder: "stroke",
                    stroke: "var(--card)",
                    strokeWidth: first || last ? 0 : 4,
                    strokeLinejoin: "round",
                  }}
                >
                  {valueFormatter(n.value)}
                  {u} · {pct(n.value)}
                </text>
              </g>
            );
          })}
        </svg>
        <HoverTip state={tip.state} />
      </div>
    </div>
  );
}
