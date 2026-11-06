"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Defect location in normalized product coordinates (0–1, origin top-left of the front face). */
export type DefectPoint = { x: number; y: number; type: string; id?: string };
/** Rectangular zone in normalized coordinates. Zones are tested in order — put small zones first. */
export type DefectZone = { id: string; label: string; x: number; y: number; w: number; h: number };
export type DefectShape = "bag" | "carton";

const ZONES: Record<DefectShape, DefectZone[]> = {
  bag: [
    { id: "top-seal", label: "Top seal", x: 0, y: 0, w: 1, h: 0.12 },
    { id: "bottom-seal", label: "Bottom seal", x: 0, y: 0.88, w: 1, h: 0.12 },
    { id: "left-edge", label: "Left gusset", x: 0, y: 0.12, w: 0.13, h: 0.76 },
    { id: "right-edge", label: "Right gusset", x: 0.87, y: 0.12, w: 0.13, h: 0.76 },
    { id: "label", label: "Label panel", x: 0.13, y: 0.34, w: 0.74, h: 0.32 },
    { id: "upper-body", label: "Upper body", x: 0.13, y: 0.12, w: 0.74, h: 0.22 },
    { id: "lower-body", label: "Lower body", x: 0.13, y: 0.66, w: 0.74, h: 0.22 },
  ],
  carton: [
    { id: "top-flap", label: "Top flap", x: 0, y: 0, w: 0.88, h: 0.14 },
    { id: "bottom-flap", label: "Bottom flap", x: 0, y: 0.86, w: 0.88, h: 0.14 },
    { id: "glue-flap", label: "Glue flap", x: 0.88, y: 0.14, w: 0.12, h: 0.72 },
    { id: "corner-tl", label: "Corner top-left", x: 0, y: 0.14, w: 0.2, h: 0.16 },
    { id: "corner-tr", label: "Corner top-right", x: 0.68, y: 0.14, w: 0.2, h: 0.16 },
    { id: "corner-bl", label: "Corner bottom-left", x: 0, y: 0.7, w: 0.2, h: 0.16 },
    { id: "corner-br", label: "Corner bottom-right", x: 0.68, y: 0.7, w: 0.2, h: 0.16 },
    { id: "print", label: "Print panel", x: 0, y: 0.14, w: 0.88, h: 0.72 },
  ],
};

/** Default zones for a product shape. */
export const defectZones = (shape: DefectShape) => ZONES[shape];

/** Count defects per zone (first matching zone wins). */
export function countByZone(defects: readonly DefectPoint[], zones: readonly DefectZone[]) {
  const counts = new Map(zones.map((z) => [z.id, 0]));
  for (const d of defects) {
    const z = zones.find((z) => d.x >= z.x && d.x <= z.x + z.w && d.y >= z.y && d.y <= z.y + z.h);
    if (z) counts.set(z.id, (counts.get(z.id) ?? 0) + 1);
  }
  return zones
    .map((z) => ({ ...z, count: counts.get(z.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Red sequential step for a loss magnitude (rule: more defects = redder). 0 → transparent. */
export function lossFill(v: number, max: number) {
  if (!v || !max) return "transparent";
  const r = v / max;
  const pct = r > 0.8 ? 100 : r > 0.6 ? 75 : r > 0.4 ? 55 : r > 0.2 ? 35 : 15;
  return `color-mix(in oklab, var(--sys-red) ${pct}%, var(--card))`;
}

export type DefectMapProps = {
  shape?: DefectShape;
  defects: readonly DefectPoint[];
  zones?: DefectZone[];
  /** dots = each defect; heat = zones shaded by count (red scale); both = heat + dots */
  mode?: "dots" | "heat" | "both";
  /** Only show these defect types (dots and counts) */
  types?: string[];
  selectedZone?: string | null;
  onSelectZone?: (id: string | null) => void;
  /** Max rendered height in px; the SVG keeps the product's aspect ratio */
  height?: number;
  className?: string;
};

const DIM: Record<DefectShape, { w: number; h: number }> = {
  bag: { w: 300, h: 420 },
  carton: { w: 340, h: 400 },
};

/**
 * Defect concentration diagram: a product outline with each defect plotted where it was found,
 * or zones shaded on a red scale by count. Selected zone gets a blue outline (never blue fill).
 */
export function DefectMap({
  shape = "bag",
  defects,
  zones,
  mode = "both",
  types,
  selectedZone,
  onSelectZone,
  height = 360,
  className,
}: DefectMapProps) {
  const zs = zones ?? ZONES[shape];
  const shown = types ? defects.filter((d) => types.includes(d.type)) : defects;
  const counts = countByZone(shown, zs);
  const byId = new Map(counts.map((c) => [c.id, c.count]));
  const max = Math.max(1, ...counts.map((c) => c.count));
  const { w: W, h: H } = DIM[shape];
  const pad = 14;
  const iw = W - pad * 2;
  const ih = H - pad * 2;
  const X = (v: number) => Math.round((pad + v * iw) * 100) / 100;
  const Y = (v: number) => Math.round((pad + v * ih) * 100) / 100;
  const [hover, setHover] = React.useState<string | null>(null);
  // draw big zones first so small zones (corners) sit on top
  const drawOrder = [...zs].sort((a, b) => b.w * b.h - a.w * a.h);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ maxHeight: height }}
      className={cn("block h-auto w-full", className)}
      role="img"
      aria-label={`Defect map, ${shown.length} defects. Most: ${counts[0]?.label} (${counts[0]?.count}).`}
    >
      {/* outline */}
      {shape === "bag" ? (
        <g>
          <path
            d={`M${X(0)},${Y(0)} H${X(1)} V${Y(1)} H${X(0)} Z`}
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {[0.12, 0.88].map((y) => (
            <line
              key={y}
              x1={X(0)}
              x2={X(1)}
              y1={Y(y)}
              y2={Y(y)}
              stroke="var(--foreground)"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          ))}
          {/* seal crimp pattern */}
          {Array.from({ length: 24 }, (_, i) => (
            <g key={i} stroke="var(--foreground)" strokeOpacity={0.12}>
              <line x1={X(i / 24 + 0.02)} x2={X(i / 24 + 0.02)} y1={Y(0.02)} y2={Y(0.1)} />
              <line x1={X(i / 24 + 0.02)} x2={X(i / 24 + 0.02)} y1={Y(0.9)} y2={Y(0.98)} />
            </g>
          ))}
          <line
            x1={X(0.13)}
            x2={X(0.13)}
            y1={Y(0.12)}
            y2={Y(0.88)}
            stroke="var(--foreground)"
            strokeOpacity={0.2}
          />
          <line
            x1={X(0.87)}
            x2={X(0.87)}
            y1={Y(0.12)}
            y2={Y(0.88)}
            stroke="var(--foreground)"
            strokeOpacity={0.2}
          />
          <rect
            x={X(0.2)}
            y={Y(0.38)}
            width={iw * 0.6}
            height={ih * 0.24}
            rx={6}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.2}
            strokeDasharray="2 3"
          />
        </g>
      ) : (
        <g>
          <rect
            x={X(0)}
            y={Y(0.14)}
            width={iw * 0.88}
            height={ih * 0.72}
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />
          <path
            d={`M${X(0)},${Y(0.14)} L${X(0.04)},${Y(0)} H${X(0.84)} L${X(0.88)},${Y(0.14)}`}
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeOpacity={0.45}
            strokeWidth={1.25}
          />
          <path
            d={`M${X(0)},${Y(0.86)} L${X(0.04)},${Y(1)} H${X(0.84)} L${X(0.88)},${Y(0.86)}`}
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeOpacity={0.45}
            strokeWidth={1.25}
          />
          <path
            d={`M${X(0.88)},${Y(0.14)} L${X(1)},${Y(0.18)} V${Y(0.82)} L${X(0.88)},${Y(0.86)}`}
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeOpacity={0.45}
            strokeWidth={1.25}
          />
          <rect
            x={X(0.22)}
            y={Y(0.36)}
            width={iw * 0.44}
            height={ih * 0.28}
            rx={6}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.2}
            strokeDasharray="2 3"
          />
        </g>
      )}

      {/* zones */}
      {drawOrder.map((z) => {
        const c = byId.get(z.id) ?? 0;
        const sel = selectedZone === z.id;
        const hov = hover === z.id;
        return (
          <g
            key={z.id}
            onMouseEnter={() => setHover(z.id)}
            onMouseLeave={() => setHover(null)}
            onClick={onSelectZone ? () => onSelectZone(sel ? null : z.id) : undefined}
            style={onSelectZone ? { cursor: "pointer" } : undefined}
          >
            <title>{`${z.label}: ${c} defect${c === 1 ? "" : "s"} (${shown.length ? Math.round((c / shown.length) * 100) : 0}%)`}</title>
            <rect
              x={X(z.x) + 1.5}
              y={Y(z.y) + 1.5}
              width={iw * z.w - 3}
              height={ih * z.h - 3}
              rx={4}
              fill={mode !== "dots" ? lossFill(c, max) : hov ? "var(--muted)" : "transparent"}
              fillOpacity={mode === "both" ? 0.7 : 1}
              stroke={
                sel
                  ? "var(--chart-1)"
                  : hov
                    ? "var(--foreground)"
                    : mode === "dots"
                      ? "var(--border)"
                      : "none"
              }
              strokeOpacity={sel ? 1 : hov ? 0.4 : 1}
              strokeDasharray={!sel && !hov ? "2 3" : undefined}
              strokeWidth={sel ? 2.5 : 1}
            />
          </g>
        );
      })}

      {/* dots */}
      {mode !== "heat" &&
        shown.map((d, i) => (
          <circle
            key={d.id ?? i}
            cx={X(d.x)}
            cy={Y(d.y)}
            r={3.2}
            fill="var(--danger)"
            fillOpacity={0.75}
            stroke="var(--card)"
            strokeWidth={0.75}
            pointerEvents="none"
          />
        ))}

      {/* count badges */}
      {mode !== "dots" &&
        drawOrder.map((z) => {
          const c = byId.get(z.id) ?? 0;
          if (!c) return null;
          const cx = X(z.x + z.w / 2);
          const cy = Y(z.y + z.h / 2);
          const w = String(c).length * 7 + 12;
          return (
            <g key={`b-${z.id}`} pointerEvents="none">
              <rect
                x={cx - w / 2}
                y={cy - 9}
                width={w}
                height={18}
                rx={9}
                fill="var(--card)"
                stroke="var(--border)"
              />
              <text
                x={cx}
                y={cy}
                dy="0.34em"
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--foreground)"
                className="tabular-nums"
              >
                {c}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/** Zones ranked by count with red bars — the text companion of the map. */
export function DefectZoneTable({
  defects,
  shape = "bag",
  zones,
  types,
  selectedZone,
  onSelectZone,
  limit = 6,
  className,
}: Pick<
  DefectMapProps,
  "defects" | "shape" | "zones" | "types" | "selectedZone" | "onSelectZone"
> & { limit?: number; className?: string }) {
  const zs = zones ?? ZONES[shape];
  const shown = types ? defects.filter((d) => types.includes(d.type)) : defects;
  const counts = countByZone(shown, zs).slice(0, limit);
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <ul className={cn("grid gap-1", className)}>
      {counts.map((z) => {
        const sel = selectedZone === z.id;
        return (
          <li key={z.id}>
            <button
              type="button"
              onClick={onSelectZone ? () => onSelectZone(sel ? null : z.id) : undefined}
              aria-pressed={sel}
              className={cn(
                "grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                sel ? "bg-highlight-soft ring-1 ring-highlight" : "hover:bg-muted",
              )}
            >
              <span className="truncate">{z.label}</span>
              <span className="font-medium tabular-nums">
                {z.count}{" "}
                <span className="font-normal text-muted-foreground">
                  · {shown.length ? Math.round((z.count / shown.length) * 100) : 0}%
                </span>
              </span>
              <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(z.count / max) * 100}%`, background: lossFill(z.count, max) }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Red-scale legend for heat mode. */
export function LossScaleLegend({
  label = "Defects per zone",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 text-[12.5px] text-muted-foreground", className)}>
      <span>{label}</span>
      <span className="text-[11.5px]">fewer</span>
      <span className="flex gap-0.5">
        {[15, 35, 55, 75, 100].map((p) => (
          <span
            key={p}
            className="h-2.5 w-5 rounded-[3px]"
            style={{ background: `color-mix(in oklab, var(--sys-red) ${p}%, var(--card))` }}
          />
        ))}
      </span>
      <span className="text-[11.5px]">more</span>
    </div>
  );
}
