import * as React from "react";
import { cn } from "@/lib/utils";

export type XItem = { id?: string; label: string };
export type XStrength = "strong" | "weak";
export type XRole = "lead" | "support";

export type XMatrixCorrelations = {
  /** South-west: [breakthrough index, annual index, strength] */
  breakthroughAnnual: [number, number, XStrength][];
  /** North-west: [priority index, annual index, strength] */
  prioritiesAnnual: [number, number, XStrength][];
  /** North-east: [priority index, KPI index, strength] */
  prioritiesKpis: [number, number, XStrength][];
  /** Far right: [priority index, owner index, role] */
  owners?: [number, number, XRole][];
};

export type XMatrixProps = {
  /** South — 3–5 year breakthrough objectives */
  breakthrough: XItem[];
  /** West — this year's annual objectives */
  annual: XItem[];
  /** North — top-level improvement priorities / projects */
  priorities: XItem[];
  /** East — KPIs and targets to improve */
  kpis: XItem[];
  /** Far east — people / teams responsible */
  owners?: XItem[];
  correlations: XMatrixCorrelations;
  /** Size of one row / column in px */
  cell?: number;
  /** Side of the central square in px */
  square?: number;
  title?: string;
  className?: string;
};

type Focus = { side: "B" | "A" | "I" | "K" | "O"; i: number } | null;

/**
 * Hoshin Kanri X-matrix (SVG). Central square with the four lists around it — breakthrough objectives (south),
 * annual objectives (west), improvement priorities (north), KPIs (east) — plus owners on the far right.
 * The corner matrices show correlations: ● strong, ○ weak; owners ● lead, ○ support. Hover an item to trace it.
 */
export function XMatrix({
  breakthrough,
  annual,
  priorities,
  kpis,
  owners = [],
  correlations,
  cell = 26,
  square = 260,
  title,
  className,
}: XMatrixProps) {
  const [focus, setFocus] = React.useState<Focus>(null);
  const nA = annual.length,
    nK = kpis.length,
    nO = owners.length,
    nI = priorities.length,
    nB = breakthrough.length;
  const xC0 = nA * cell,
    xC1 = xC0 + square,
    xE1 = xC1 + nK * cell,
    xO1 = xE1 + nO * cell;
  const yC0 = nI * cell,
    yC1 = yC0 + square,
    yS1 = yC1 + nB * cell;
  const W = xO1 + 1,
    H = yS1 + 1;
  const midX = (xC0 + xC1) / 2,
    midY = (yC0 + yC1) / 2;

  const id = (p: string, i: number, it: XItem) => it.id ?? `${p}${i + 1}`;
  // related items for tracing
  const rel = React.useMemo(() => {
    const on = new Set<string>();
    if (!focus) return on;
    const add = (k: string) => on.add(k);
    add(`${focus.side}${focus.i}`);
    const c = correlations;
    if (focus.side === "B")
      c.breakthroughAnnual.filter(([b]) => b === focus.i).forEach(([, a]) => add(`A${a}`));
    if (focus.side === "A") {
      c.breakthroughAnnual.filter(([, a]) => a === focus.i).forEach(([b]) => add(`B${b}`));
      c.prioritiesAnnual.filter(([, a]) => a === focus.i).forEach(([p]) => add(`I${p}`));
    }
    if (focus.side === "I") {
      c.prioritiesAnnual.filter(([p]) => p === focus.i).forEach(([, a]) => add(`A${a}`));
      c.prioritiesKpis.filter(([p]) => p === focus.i).forEach(([, k]) => add(`K${k}`));
      c.owners?.filter(([p]) => p === focus.i).forEach(([, o]) => add(`O${o}`));
    }
    if (focus.side === "K")
      c.prioritiesKpis.filter(([, k]) => k === focus.i).forEach(([p]) => add(`I${p}`));
    if (focus.side === "O")
      c.owners?.filter(([, o]) => o === focus.i).forEach(([p]) => add(`I${p}`));
    return on;
  }, [focus, correlations]);
  const lit = (k: string) => rel.has(k);
  const dim = (k: string) => focus != null && !rel.has(k);

  const hl = "var(--highlight-soft)";
  const textCls = (k: string) =>
    cn(
      "transition-opacity",
      dim(k) ? "fill-muted-foreground opacity-50" : "fill-foreground",
      lit(k) && "font-semibold",
    );
  const enter = (side: NonNullable<Focus>["side"], i: number) => ({
    onMouseEnter: () => setFocus({ side, i }),
    onMouseLeave: () => setFocus(null),
    onFocus: () => setFocus({ side, i }),
    onBlur: () => setFocus(null),
    tabIndex: 0,
    className: "cursor-default outline-none",
  });

  const dot = (cx: number, cy: number, s: XStrength | XRole, key: string) => {
    const filled = s === "strong" || s === "lead";
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={filled ? 5.5 : 5}
        fill={filled ? "var(--foreground)" : "var(--card)"}
        stroke="var(--foreground)"
        strokeWidth={1.5}
      />
    );
  };
  const grid = (x0: number, y0: number, cols: number, rows: number, key: string) => (
    <g key={key} stroke="var(--border)" strokeWidth={1}>
      <rect x={x0 + 0.5} y={y0 + 0.5} width={cols * cell} height={rows * cell} fill="none" />
      {Array.from({ length: cols - 1 }, (_, i) => (
        <line
          key={`c${i}`}
          x1={x0 + (i + 1) * cell + 0.5}
          y1={y0}
          x2={x0 + (i + 1) * cell + 0.5}
          y2={y0 + rows * cell}
        />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <line
          key={`r${i}`}
          x1={x0}
          y1={y0 + (i + 1) * cell + 0.5}
          x2={x0 + cols * cell}
          y2={y0 + (i + 1) * cell + 0.5}
        />
      ))}
    </g>
  );
  const fs = 11.5;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title ?? "Hoshin Kanri X-matrix"}
        className="mx-auto block"
      >
        {/* focus bands */}
        {focus?.side === "I" && (
          <rect x={0} y={focus.i * cell} width={xO1} height={cell} fill={hl} />
        )}
        {focus?.side === "B" && (
          <rect x={0} y={yC1 + focus.i * cell} width={xC1} height={cell} fill={hl} />
        )}
        {focus?.side === "A" && (
          <rect x={focus.i * cell} y={0} width={cell} height={yS1} fill={hl} />
        )}
        {focus?.side === "K" && (
          <rect x={xC1 + focus.i * cell} y={0} width={cell} height={yC1} fill={hl} />
        )}
        {focus?.side === "O" && (
          <rect x={xE1 + focus.i * cell} y={0} width={cell} height={yC1} fill={hl} />
        )}

        {/* corner matrices */}
        {grid(0, 0, nA, nI, "nw")}
        {grid(0, yC1, nA, nB, "sw")}
        {grid(xC1, 0, nK, nI, "ne")}
        {nO > 0 && grid(xE1, 0, nO, nI, "own")}
        <g stroke="var(--border)">
          {Array.from({ length: nI + 1 }, (_, i) => (
            <line key={`n${i}`} x1={xC0} x2={xC1} y1={i * cell + 0.5} y2={i * cell + 0.5} />
          ))}
          {Array.from({ length: nB + 1 }, (_, i) => (
            <line
              key={`s${i}`}
              x1={xC0}
              x2={xC1}
              y1={yC1 + i * cell + 0.5}
              y2={yC1 + i * cell + 0.5}
            />
          ))}
          {Array.from({ length: nA + 1 }, (_, i) => (
            <line key={`w${i}`} y1={yC0} y2={yC1} x1={i * cell + 0.5} x2={i * cell + 0.5} />
          ))}
          {Array.from({ length: nK + nO + 1 }, (_, i) => (
            <line
              key={`e${i}`}
              y1={yC0}
              y2={yC1}
              x1={xC1 + i * cell + 0.5}
              x2={xC1 + i * cell + 0.5}
            />
          ))}
          {nO > 0 && <line y1={0} y2={yC1} x1={xE1 + 0.5} x2={xE1 + 0.5} strokeWidth={2} />}
        </g>

        {/* central square with diagonals */}
        <rect
          x={xC0 + 0.5}
          y={yC0 + 0.5}
          width={square}
          height={square}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.6}
        />
        <line x1={xC0} y1={yC0} x2={xC1} y2={yC1} stroke="var(--foreground)" strokeOpacity={0.35} />
        <line x1={xC1} y1={yC0} x2={xC0} y2={yC1} stroke="var(--foreground)" strokeOpacity={0.35} />
        <g fontSize={12} fontWeight={600} className="fill-muted-foreground" textAnchor="middle">
          <text x={midX} y={yC0 + square * 0.2}>
            Improvement priorities
          </text>
          <text x={midX} y={yC0 + square * 0.2 + 15} fontWeight={400} fontSize={11}>
            How · this year’s projects
          </text>
          <text x={midX} y={yC1 - square * 0.2 - 15}>
            Breakthrough objectives
          </text>
          <text x={midX} y={yC1 - square * 0.2} fontWeight={400} fontSize={11}>
            What · 3–5 years
          </text>
          <text transform={`translate(${xC0 + square * 0.2} ${midY}) rotate(-90)`}>
            Annual objectives
          </text>
          <text
            transform={`translate(${xC0 + square * 0.2 + 15} ${midY}) rotate(-90)`}
            fontWeight={400}
            fontSize={11}
          >
            What · this year
          </text>
          <text transform={`translate(${xC1 - square * 0.2} ${midY}) rotate(90)`}>
            KPIs to improve
          </text>
          <text
            transform={`translate(${xC1 - square * 0.2 + 15} ${midY}) rotate(90)`}
            fontWeight={400}
            fontSize={11}
          >
            How much · targets
          </text>
        </g>

        {/* north: priorities (rows above the square) */}
        {priorities.map((it, i) => (
          <g key={`I${i}`} {...enter("I", i)}>
            <rect x={xC0} y={i * cell} width={square} height={cell} fill="transparent" />
            <text
              x={xC0 + 8}
              y={i * cell + cell / 2 + 4}
              fontSize={fs}
              className={textCls(`I${i}`)}
            >
              <tspan className="fill-muted-foreground font-mono" fontSize={10.5}>
                {id("I", i, it)}
              </tspan>{" "}
              {it.label}
            </text>
          </g>
        ))}
        {/* south: breakthrough objectives */}
        {breakthrough.map((it, i) => (
          <g key={`B${i}`} {...enter("B", i)}>
            <rect x={xC0} y={yC1 + i * cell} width={square} height={cell} fill="transparent" />
            <text
              x={xC0 + 8}
              y={yC1 + i * cell + cell / 2 + 4}
              fontSize={fs}
              className={textCls(`B${i}`)}
            >
              <tspan className="fill-muted-foreground font-mono" fontSize={10.5}>
                {id("B", i, it)}
              </tspan>{" "}
              {it.label}
            </text>
          </g>
        ))}
        {/* west: annual objectives (vertical) */}
        {annual.map((it, i) => (
          <g key={`A${i}`} {...enter("A", i)}>
            <rect x={i * cell} y={yC0} width={cell} height={square} fill="transparent" />
            <text
              transform={`translate(${i * cell + cell / 2 + 4} ${yC1 - 8}) rotate(-90)`}
              fontSize={fs}
              className={textCls(`A${i}`)}
            >
              <tspan className="fill-muted-foreground font-mono" fontSize={10.5}>
                {id("A", i, it)}
              </tspan>{" "}
              {it.label}
            </text>
          </g>
        ))}
        {/* east: KPIs (vertical) */}
        {kpis.map((it, i) => (
          <g key={`K${i}`} {...enter("K", i)}>
            <rect x={xC1 + i * cell} y={yC0} width={cell} height={square} fill="transparent" />
            <text
              transform={`translate(${xC1 + i * cell + cell / 2 - 4} ${yC0 + 8}) rotate(90)`}
              fontSize={fs}
              className={textCls(`K${i}`)}
            >
              <tspan className="fill-muted-foreground font-mono" fontSize={10.5}>
                {id("K", i, it)}
              </tspan>{" "}
              {it.label}
            </text>
          </g>
        ))}
        {/* far east: owners (vertical) */}
        {owners.map((it, i) => (
          <g key={`O${i}`} {...enter("O", i)}>
            <rect x={xE1 + i * cell} y={yC0} width={cell} height={square} fill="transparent" />
            <text
              transform={`translate(${xE1 + i * cell + cell / 2 - 4} ${yC0 + 8}) rotate(90)`}
              fontSize={fs}
              className={textCls(`O${i}`)}
            >
              {it.label}
            </text>
          </g>
        ))}

        {/* correlation dots */}
        {correlations.prioritiesAnnual.map(([p, a, s]) =>
          dot(a * cell + cell / 2, p * cell + cell / 2, s, `nw${p}-${a}`),
        )}
        {correlations.breakthroughAnnual.map(([b, a, s]) =>
          dot(a * cell + cell / 2, yC1 + b * cell + cell / 2, s, `sw${b}-${a}`),
        )}
        {correlations.prioritiesKpis.map(([p, k, s]) =>
          dot(xC1 + k * cell + cell / 2, p * cell + cell / 2, s, `ne${p}-${k}`),
        )}
        {correlations.owners?.map(([p, o, r]) =>
          dot(xE1 + o * cell + cell / 2, p * cell + cell / 2, r, `ow${p}-${o}`),
        )}

        {/* legend in the unused south-east corner */}
        <g
          transform={`translate(${xC1 + 12} ${yC1 + 14})`}
          fontSize={11.5}
          className="fill-muted-foreground"
        >
          {dot(5, 0, "strong", "lg1")}
          <text x={16} y={4}>
            Strong correlation · lead
          </text>
          {dot(5, 20, "weak", "lg2")}
          <text x={16} y={24}>
            Weak correlation · support
          </text>
        </g>
      </svg>
    </div>
  );
}
