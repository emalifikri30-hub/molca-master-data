"use client";

import * as React from "react";
import { useElementWidth } from "./svg-chart";
import { cn } from "@/lib/utils";

export type VennSet = { id: string; label: string };
/** One region = the items that belong to exactly these sets (e.g. ["a"] only A, ["a","b"] A∩B, ["a","b","c"] the centre). */
export type VennRegion = { sets: string[]; items: string[]; highlight?: boolean };

export type VennDiagramProps = {
  /** Two or three sets */
  sets: VennSet[];
  regions: VennRegion[];
  height?: number;
  className?: string;
};

const key = (ids: string[]) => [...ids].sort().join("+");

/**
 * Two- or three-set Venn diagram for comparisons: which capabilities each group of players covers, and what sits
 * only in the overlap. Circles are equal (a Venn shows membership, not size). Each region shows its item count;
 * hover or focus a region to list its items, and a highlighted region (e.g. "where we play") is drawn in blue.
 */
export function VennDiagram({ sets, regions, height = 340, className }: VennDiagramProps) {
  const [ref, width] = useElementWidth(640);
  const [active, setActive] = React.useState<string | null>(null);
  const three = sets.length === 3;
  const r = Math.min(three ? height / 3.1 : height / 2.4, three ? width / 3.4 : width / 3.4);
  const cx = width / 2;
  const cy = three ? height / 2 + r * 0.12 : height / 2;
  const d = r * (three ? 0.62 : 0.6);
  const centres = three
    ? [
        { x: cx - d, y: cy - d * 0.55 },
        { x: cx + d, y: cy - d * 0.55 },
        { x: cx, y: cy + d * 0.95 },
      ]
    : [
        { x: cx - d, y: cy },
        { x: cx + d, y: cy },
      ];
  // label anchor for each region, by membership
  const ids = sets.map((s) => s.id);
  const anchor = (mem: string[]): { x: number; y: number } => {
    const inSet = ids.map((id) => mem.includes(id));
    if (!three) {
      if (inSet[0] && inSet[1]) return { x: cx, y: cy };
      return inSet[0] ? { x: cx - d - r * 0.45, y: cy } : { x: cx + d + r * 0.45, y: cy };
    }
    const [a, b, c] = inSet;
    if (a && b && c) return { x: cx, y: cy - d * 0.05 };
    if (a && b) return { x: cx, y: cy - d * 1.25 };
    if (a && c) return { x: cx - d * 0.95, y: cy + d * 0.55 };
    if (b && c) return { x: cx + d * 0.95, y: cy + d * 0.55 };
    if (a) return { x: cx - d - r * 0.45, y: cy - d * 0.8 };
    if (b) return { x: cx + d + r * 0.45, y: cy - d * 0.8 };
    return { x: cx, y: cy + d * 0.95 + r * 0.5 };
  };
  // long set names never fit around circles, so each circle gets a letter badge and the names sit in an HTML legend
  const LETTERS = ["A", "B", "C"];
  const badgePos = (i: number) => {
    const c = centres[i];
    if (three && i === 2) return { x: c.x + r * 0.78, y: c.y + r * 0.66 };
    return { x: i === 0 ? c.x - r * 0.72 : c.x + r * 0.72, y: c.y - r * 0.72 };
  };
  const byKey = new Map(regions.map((g) => [key(g.sets), g]));
  const shown = active ? byKey.get(active) : regions.find((g) => g.highlight);
  const svgH = three ? Math.ceil(cy + d * 0.95 + r + 6) : height;

  return (
    <div className={cn("grid min-w-0 gap-3 md:grid-cols-[1fr_17rem]", className)}>
      <div ref={ref} className="min-w-0">
        <svg
          width={width}
          height={svgH}
          role="img"
          aria-label={`Venn diagram of ${sets.map((s) => s.label).join(", ")}`}
          className="block"
        >
          {centres.map((c, i) => (
            <circle
              key={sets[i].id}
              cx={c.x}
              cy={c.y}
              r={r}
              fill="var(--muted-foreground)"
              fillOpacity={0.08}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.55}
              strokeWidth={1.25}
            />
          ))}
          {sets.map((s, i) => {
            const p = badgePos(i);
            return (
              <g key={s.id}>
                <rect
                  x={p.x - 11}
                  y={p.y - 11}
                  width={22}
                  height={22}
                  rx={6}
                  fill="var(--foreground)"
                />
                <text
                  x={p.x}
                  y={p.y + 4.5}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontWeight={700}
                  fill="var(--background)"
                >
                  {LETTERS[i]}
                </text>
              </g>
            );
          })}
          {regions.map((g) => {
            const k = key(g.sets);
            const p = anchor(g.sets);
            const on = active === k || (!active && g.highlight);
            return (
              <g
                key={k}
                tabIndex={0}
                className="cursor-default outline-none"
                onMouseEnter={() => setActive(k)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(k)}
                onBlur={() => setActive(null)}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={17}
                  fill={g.highlight ? "var(--chart-1)" : on ? "var(--foreground)" : "var(--card)"}
                  stroke={g.highlight ? "var(--chart-1)" : "var(--border)"}
                />
                <text
                  x={p.x}
                  y={p.y + 4.5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill={g.highlight || on ? "var(--background)" : "var(--foreground)"}
                  className="pointer-events-none tabular-nums"
                >
                  {g.items.length}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid min-w-0 content-center gap-3">
        <ul className="grid gap-1.5 text-[12.5px]">
          {sets.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2">
              <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-bold text-background">
                {LETTERS[i]}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <div className="min-w-0 rounded-xl border bg-card p-3 text-[12.5px]">
          {shown ? (
            <>
              <div className="mb-1.5 font-medium">
                {shown.sets.map((id) => LETTERS[ids.indexOf(id)]).join(" ∩ ")}
                {shown.sets.length === 1 ? (sets.length > 1 ? " only" : "") : ""}
              </div>
              <ul className="grid gap-1 text-muted-foreground">
                {shown.items.map((it) => (
                  <li key={it}>• {it}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-muted-foreground">
              Hover a number to list the items in that region.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
