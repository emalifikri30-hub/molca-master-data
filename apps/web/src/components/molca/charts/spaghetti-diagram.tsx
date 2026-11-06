import * as React from "react";
import { cn } from "@/lib/utils";

export type Point = [number, number];

export type LayoutArea = {
  id: string;
  label: string;
  /** x, y, width, height in metres from the top-left corner of the hall */
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: "work" | "storage" | "aisle" | "office";
};

export type WalkPath = {
  id: string;
  label: string;
  /** Waypoints in metres. Consecutive points are walked in a straight line. */
  points: Point[];
  /** Stops (indexes into points) that get a numbered marker */
  stops?: number[];
};

/** Polyline length in metres. */
export function pathLength(points: Point[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++)
    d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return d;
}

export type SpaghettiDiagramProps = {
  /** Hall size in metres */
  width: number;
  height: number;
  areas: LayoutArea[];
  /** The path drawn in full */
  path: WalkPath;
  /** Optional comparison path, drawn faint and dashed underneath (e.g. "before") */
  ghost?: WalkPath;
  /** Draw a 5 m grid and a scale bar (default true) */
  grid?: boolean;
  className?: string;
};

const PX = 20; // px per metre in the viewBox

const AREA_STYLE: Record<
  NonNullable<LayoutArea["kind"]>,
  { fill: string; stroke: string; dash?: string }
> = {
  work: { fill: "var(--card)", stroke: "var(--input)" },
  storage: { fill: "var(--muted)", stroke: "var(--input)" },
  aisle: { fill: "transparent", stroke: "var(--border)", dash: "4 4" },
  office: { fill: "var(--muted)", stroke: "var(--border)" },
};

/**
 * Walking is motion waste, so the path is drawn in red (v4 color rule: loss = red); a ghost path is grey.
 * Spaghetti diagram: a plant layout (SVG, drawn to scale in metres) with an operator's walking path,
 * numbered stops, direction arrows and the total distance. Pass a `ghost` path to compare before / after.
 */
export function SpaghettiDiagram({
  width,
  height,
  areas,
  path,
  ghost,
  grid = true,
  className,
}: SpaghettiDiagramProps) {
  const id = React.useId().replace(/:/g, "");
  const W = width * PX;
  const H = height * PX;
  const pts = (p: Point[]) => p.map(([x, y]) => `${x * PX},${y * PX}`).join(" ");
  const dist = pathLength(path.points);

  return (
    <svg
      viewBox={`-8 -8 ${W + 16} ${H + 40}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={`${path.label}: walking distance ${Math.round(dist)} metres per cycle`}
    >
      <defs>
        <marker
          id={`arr-${id}`}
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--sys-red)" />
        </marker>
        <pattern id={`grid-${id}`} width={5 * PX} height={5 * PX} patternUnits="userSpaceOnUse">
          <path
            d={`M ${5 * PX} 0 L 0 0 0 ${5 * PX}`}
            fill="none"
            stroke="var(--border)"
            strokeWidth={0.75}
          />
        </pattern>
      </defs>

      {/* hall */}
      <rect x={0} y={0} width={W} height={H} rx={6} fill="var(--subtle)" stroke="var(--input)" />
      {grid && <rect x={0} y={0} width={W} height={H} fill={`url(#grid-${id})`} opacity={0.7} />}

      {/* areas */}
      {areas.map((a) => {
        const s = AREA_STYLE[a.kind ?? "work"];
        return (
          <g key={a.id}>
            <rect
              x={a.x * PX}
              y={a.y * PX}
              width={a.w * PX}
              height={a.h * PX}
              rx={6}
              fill={s.fill}
              stroke={s.stroke}
              strokeDasharray={s.dash}
              strokeWidth={1.25}
            />
            <text
              x={(a.x + a.w / 2) * PX}
              y={(a.y + a.h / 2) * PX}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
              fontWeight={500}
              fill={a.kind === "aisle" ? "var(--muted-foreground)" : "var(--foreground)"}
            >
              {a.label}
            </text>
          </g>
        );
      })}

      {/* ghost (before) */}
      {ghost && (
        <polyline
          points={pts(ghost.points)}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.45}
          strokeWidth={2}
          strokeDasharray="6 5"
          strokeLinejoin="round"
        />
      )}

      {/* path: each leg gets a mid-arrow */}
      <polyline
        points={pts(path.points)}
        fill="none"
        stroke="var(--sys-red)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {path.points.slice(1).map((p, i) => {
        const a = path.points[i];
        if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 3) return null;
        const mx = ((a[0] + p[0]) / 2) * PX;
        const my = ((a[1] + p[1]) / 2) * PX;
        const dx = (p[0] - a[0]) * 0.001;
        const dy = (p[1] - a[1]) * 0.001;
        return (
          <polyline
            key={i}
            points={`${mx - dx * PX},${my - dy * PX} ${mx},${my}`}
            fill="none"
            stroke="var(--sys-red)"
            strokeWidth={2.5}
            markerEnd={`url(#arr-${id})`}
          />
        );
      })}
      {(path.stops ?? []).map((si, n) => {
        const [x, y] = path.points[si];
        return (
          <g key={si}>
            <circle
              cx={x * PX}
              cy={y * PX}
              r={9}
              fill="var(--sys-red)"
              stroke="var(--card)"
              strokeWidth={2}
            />
            <text
              x={x * PX}
              y={y * PX}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={600}
              fill="white"
            >
              {n + 1}
            </text>
          </g>
        );
      })}

      {/* scale bar */}
      {grid && (
        <g transform={`translate(0 ${H + 18})`} fontSize={11} fill="var(--muted-foreground)">
          <line
            x1={0}
            x2={5 * PX}
            y1={0}
            y2={0}
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
          />
          <line x1={0} x2={0} y1={-4} y2={4} stroke="var(--muted-foreground)" strokeWidth={1.5} />
          <line
            x1={5 * PX}
            x2={5 * PX}
            y1={-4}
            y2={4}
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
          />
          <text x={5 * PX + 8} y={0} dominantBaseline="middle">
            5 m
          </text>
          <text x={W} y={0} textAnchor="end" dominantBaseline="middle">
            {width} × {height} m · grid 5 m
          </text>
        </g>
      )}
    </svg>
  );
}
