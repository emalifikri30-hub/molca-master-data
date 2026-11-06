"use client";

import * as React from "react";
import { useElementWidth } from "./svg-chart";
import { cn } from "@/lib/utils";

export type FlowNode = {
  id: string;
  label: string;
  sub?: string;
  /** Column, left to right, starting at 0 */
  col: number;
  /** focus = the subject of the page (blue), external = outside our system (dashed), muted = context */
  tone?: "default" | "focus" | "external" | "muted";
};
export type FlowEdge = { from: string; to: string; label?: string; dashed?: boolean };

export type FlowDiagramProps = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Column titles, e.g. ["Sources", "Ingest", "Store", "Use"] */
  columns?: string[];
  nodeHeight?: number;
  className?: string;
};

const NODE_W_MIN = 104;
const GAP_Y = 14;

/**
 * Left-to-right flow diagram for pipelines, integrations, state machines and context diagrams. Nodes sit in
 * columns (stacked top to bottom in the order given), edges are curved arrows with optional labels. Below its
 * minimum width the diagram scrolls inside its own box instead of shrinking the text.
 */
export function FlowDiagram({
  nodes,
  edges,
  columns,
  nodeHeight: fixedHeight,
  className,
}: FlowDiagramProps) {
  const [ref, width] = useElementWidth(720);
  const [hover, setHover] = React.useState<string | null>(null);
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  // fits ±5 columns in a docs column (±700px) before it has to scroll
  const minW = cols * (NODE_W_MIN + 28);
  const W = Math.max(width, minW);
  const colW = W / cols;
  const nodeW = Math.min(220, colW - 30);
  // text wraps instead of truncating: size every node for the longest label/sub in the diagram
  const lines = (text: string | undefined, px: number) =>
    text ? Math.ceil((text.length * px) / (nodeW - 22)) : 0;
  const nodeHeight =
    fixedHeight ??
    Math.max(46, ...nodes.map((n) => 14 + lines(n.label, 6.9) * 16 + lines(n.sub, 6.1) * 14));
  const head = columns ? 26 : 4;
  const pos0 = (id: string) => nodes.find((n) => n.id === id)?.col;
  const byCol = Array.from({ length: cols }, (_, c) => nodes.filter((n) => n.col === c));
  const rows = Math.max(...byCol.map((c) => c.length));
  // back edges loop under the nodes, so leave room for them and their labels
  const backRoom = edges.some((e) => (pos0(e.to) ?? 0) <= (pos0(e.from) ?? 0)) ? 58 : 8;
  const H = head + rows * (nodeHeight + GAP_Y) + backRoom;
  const pos = new Map<string, { x: number; y: number }>();
  byCol.forEach((list, c) => {
    const offset = ((rows - list.length) * (nodeHeight + GAP_Y)) / 2;
    list.forEach((n, r) =>
      pos.set(n.id, {
        x: c * colW + (colW - nodeW) / 2,
        y: head + offset + r * (nodeHeight + GAP_Y),
      }),
    );
  });
  const toneCls: Record<NonNullable<FlowNode["tone"]>, string> = {
    default: "border-border bg-card",
    focus: "border-chart-1 bg-chart-1/10",
    external: "border-dashed border-muted-foreground/60 bg-card",
    muted: "border-border bg-muted/60 text-muted-foreground",
  };
  const related = (e: FlowEdge) => hover && (e.from === hover || e.to === hover);

  return (
    <div ref={ref} className={cn("w-full min-w-0 overflow-x-auto", className)}>
      <div className="relative" style={{ width: W, height: H }}>
        {columns?.map((c, i) => (
          <div
            key={c}
            className="absolute top-0 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ left: i * colW, width: colW }}
          >
            {c}
          </div>
        ))}
        <svg width={W} height={H} className="pointer-events-none absolute inset-0" aria-hidden>
          <defs>
            <marker
              id="fd-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="var(--muted-foreground)" />
            </marker>
            <marker
              id="fd-arrow-on"
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
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const back = b.x <= a.x;
            const x1 = back ? a.x + nodeW / 2 : a.x + nodeW;
            const y1 = back ? a.y + nodeHeight : a.y + nodeHeight / 2;
            const x2 = back ? b.x + nodeW / 2 : b.x;
            const y2 = back ? b.y + nodeHeight : b.y + nodeHeight / 2;
            const d = back
              ? `M${x1} ${y1} C${x1} ${y1 + 40}, ${x2} ${y2 + 40}, ${x2} ${y2 + 2}`
              : `M${x1} ${y1} C${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2 - 2} ${y2}`;
            const on = related(e);
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke={on ? "var(--chart-1)" : "var(--muted-foreground)"}
                  strokeOpacity={on ? 1 : 0.55}
                  strokeWidth={on ? 2 : 1.25}
                  strokeDasharray={e.dashed ? "5 4" : undefined}
                  markerEnd={`url(#${on ? "fd-arrow-on" : "fd-arrow"})`}
                />
                {e.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={back ? Math.max(y1, y2) + 34 : (y1 + y2) / 2 - 5}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="var(--muted-foreground)"
                    stroke="var(--card)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <div
              key={n.id}
              tabIndex={0}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
              className={cn(
                "absolute flex flex-col justify-center rounded-lg border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                toneCls[n.tone ?? "default"],
                hover === n.id && "ring-2 ring-chart-1/40",
              )}
              style={{ left: p.x, top: p.y, width: nodeW, height: nodeHeight }}
              title={n.sub ? `${n.label} — ${n.sub}` : n.label}
            >
              <div className="text-[12.5px] font-medium leading-tight [overflow-wrap:anywhere]">
                {n.label}
              </div>
              {n.sub && (
                <div className="text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                  {n.sub}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
