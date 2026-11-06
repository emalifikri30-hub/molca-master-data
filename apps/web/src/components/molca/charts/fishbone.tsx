import * as React from "react";
import { cn } from "@/lib/utils";
import { useElementWidth } from "./svg-chart";

export type FishboneCauseStatus = "open" | "suspected" | "root" | "ruled-out";
export type FishboneCause = {
  id?: string;
  label: string;
  status?: FishboneCauseStatus;
  note?: string;
};
export type FishboneCategory = { name: string; causes: FishboneCause[] };

/** The classic 6M categories, in diagram order (top row left→right, then bottom row). */
export const SIX_M = [
  "Man",
  "Machine",
  "Method",
  "Material",
  "Measurement",
  "Mother nature",
] as const;

export type FishboneProps = {
  /** The effect / problem statement in the fish head */
  problem: string;
  /** Second line in the head, e.g. "2.4% · week 44" */
  detail?: string;
  /** Up to 6 categories (3 top, 3 bottom). More than 4 causes per bone get crowded. */
  categories: FishboneCategory[];
  /** Controlled selection (cause id or label) */
  selected?: string | null;
  onSelect?: (cause: FishboneCause, category: string) => void;
  /** Below this container width the diagram collapses into a list. Default 620. */
  collapseBelow?: number;
  className?: string;
};

const keyOf = (c: FishboneCause) => c.id ?? c.label;

/** Word-wrap into at most `max` lines of `n` characters; the last line gets an ellipsis if cut. */
function wrap(text: string, n: number, max = 2) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= n) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const last = lines.slice(max - 1).join(" ");
    return [...lines.slice(0, max - 1), last.slice(0, n - 1) + "…"];
  }
  return lines.map((l) => (l.length > n ? l.slice(0, n - 1) + "…" : l));
}

/**
 * Ishikawa / fishbone diagram. Causes hang off six bones; the root cause is blue, suspected causes
 * get a blue ring, ruled-out causes are struck through. Collapses to a grouped list on narrow screens.
 */
export function Fishbone({
  problem,
  detail,
  categories,
  selected,
  onSelect,
  collapseBelow = 620,
  className,
}: FishboneProps) {
  const [ref, width] = useElementWidth();
  const narrow = width < collapseBelow;
  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      {narrow ? (
        <FishboneList
          problem={problem}
          detail={detail}
          categories={categories}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <FishboneSvg
          width={width}
          problem={problem}
          detail={detail}
          categories={categories}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function causeColor(s: FishboneCauseStatus | undefined) {
  return s === "root"
    ? "var(--chart-1)"
    : s === "ruled-out"
      ? "var(--muted-foreground)"
      : "var(--foreground)";
}

function FishboneSvg({
  width,
  problem,
  detail,
  categories,
  selected,
  onSelect,
}: Omit<FishboneProps, "collapseBelow" | "className"> & { width: number }) {
  const maxCauses = Math.max(1, ...categories.map((c) => c.causes.length));
  const rowH = 40;
  const half = 44 + maxCauses * rowH + 4;
  const H = half * 2;
  const headW = 150;
  const x0 = 12;
  const spineEnd = width - headW - 8;
  const cols = 3;
  const colW = (spineEnd - x0) / cols;
  const slant = Math.min(colW * 0.2, 40);
  const maxChars = Math.max(10, Math.floor((colW - slant - 24) / 5.9));
  const top = categories.slice(0, 3);
  const bottom = categories.slice(3, 6);
  const [hover, setHover] = React.useState<string | null>(null);

  const bone = (cat: FishboneCategory, col: number, up: boolean) => {
    const jx = x0 + colW * (col + 1) - 14;
    const endY = up ? 40 : H - 40;
    const bx = jx - slant;
    const at = (t: number) => ({ x: bx + (jx - bx) * t, y: endY + (half - endY) * t });
    return (
      <g key={cat.name}>
        <line
          x1={bx}
          y1={endY}
          x2={jx}
          y2={half}
          stroke="var(--foreground)"
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />
        <g transform={`translate(${bx}, ${up ? endY - 14 : endY + 14})`}>
          <rect
            x={-cat.name.length * 3.6 - 12}
            y={-11}
            width={cat.name.length * 7.2 + 24}
            height={22}
            rx={11}
            fill="var(--subtle)"
            stroke="var(--border)"
          />
          <text
            textAnchor="middle"
            dy="0.34em"
            fontSize={12}
            fontWeight={600}
            fill="var(--foreground)"
          >
            {cat.name}
          </text>
        </g>
        {cat.causes.map((c, k) => {
          // spread causes evenly along the bone, from just below the category label to near the spine
          const n = cat.causes.length;
          // labels sit above their tick: keep top-bone labels clear of the category pill, bottom-bone labels clear of the spine
          const u = n === 1 ? 0.55 : (up ? 0.34 : 0.3) + (0.6 * k) / (n - 1);
          const p = at(up ? u : 1 - u);
          const key = keyOf(c);
          const sel = selected === key;
          const hov = hover === key;
          const lines = wrap(c.label, maxChars);
          const longest = Math.max(...lines.map((l) => l.length));
          const color = causeColor(c.status);
          const lx = p.x - Math.min(colW - slant - 12, longest * 5.9 + 14);
          return (
            <g
              key={key}
              onClick={onSelect ? () => onSelect(c, cat.name) : undefined}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <title>{`${cat.name}: ${c.label}${c.status && c.status !== "open" ? ` (${c.status === "root" ? "root cause" : c.status})` : ""}${c.note ? ` — ${c.note}` : ""}`}</title>
              {(sel || hov) && (
                <rect
                  x={lx - 6}
                  y={p.y - 6 - lines.length * 15}
                  width={p.x - lx + 10}
                  height={lines.length * 15 + 10}
                  rx={6}
                  fill={c.status === "root" ? "var(--highlight-soft)" : "var(--muted)"}
                />
              )}
              <line
                x1={lx}
                x2={p.x}
                y1={p.y}
                y2={p.y}
                stroke={c.status === "root" ? "var(--chart-1)" : "var(--foreground)"}
                strokeOpacity={c.status === "root" ? 1 : 0.3}
                strokeWidth={c.status === "root" ? 1.75 : 1}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={c.status === "root" ? 4 : 2.5}
                fill={
                  c.status === "root"
                    ? "var(--chart-1)"
                    : c.status === "suspected"
                      ? "var(--card)"
                      : "var(--foreground)"
                }
                fillOpacity={c.status === "root" || c.status === "suspected" ? 1 : 0.45}
                stroke={c.status === "suspected" ? "var(--chart-1)" : "none"}
                strokeWidth={1.75}
              />
              <text
                x={p.x - 8}
                y={p.y - 5}
                textAnchor="end"
                fontSize={11.5}
                fontWeight={c.status === "root" || sel ? 600 : 400}
                fill={color}
                textDecoration={c.status === "ruled-out" ? "line-through" : undefined}
              >
                {lines.map((l, li) => (
                  <tspan key={li} x={p.x - 8} dy={li === 0 ? -(lines.length - 1) * 15 : 15}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="relative" style={{ height: H }}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Fishbone diagram for: ${problem}`}
        className="block"
      >
        <line
          x1={x0}
          y1={half}
          x2={spineEnd}
          y2={half}
          stroke="var(--foreground)"
          strokeOpacity={0.7}
          strokeWidth={2.25}
        />
        <path
          d={`M${spineEnd - 10},${half - 7} L${spineEnd},${half} L${spineEnd - 10},${half + 7}`}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.7}
          strokeWidth={2.25}
        />
        {top.map((c, i) => bone(c, i, true))}
        {bottom.map((c, i) => bone(c, i, false))}
      </svg>
      <div
        className="absolute grid content-center gap-1 rounded-xl border bg-card p-3 shadow-xs"
        style={{ left: spineEnd + 6, width: headW - 4, top: half - 48, minHeight: 96 }}
      >
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Effect
        </div>
        <div className="text-[13.5px] font-semibold leading-snug">{problem}</div>
        {detail && <div className="text-[12px] text-danger tabular-nums">{detail}</div>}
      </div>
    </div>
  );
}

function FishboneList({
  problem,
  detail,
  categories,
  selected,
  onSelect,
}: Omit<FishboneProps, "collapseBelow" | "className">) {
  return (
    <div className="grid gap-3">
      <div className="rounded-xl border bg-card p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Effect
        </div>
        <div className="text-[14px] font-semibold">{problem}</div>
        {detail && <div className="text-[12px] text-danger tabular-nums">{detail}</div>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map((cat) => (
          <div key={cat.name} className="rounded-xl border p-3">
            <div className="mb-1.5 text-[12.5px] font-semibold">{cat.name}</div>
            <ul className="grid gap-1">
              {cat.causes.map((c) => (
                <li key={keyOf(c)}>
                  <button
                    type="button"
                    onClick={onSelect ? () => onSelect(c, cat.name) : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected === keyOf(c) && "bg-muted",
                      c.status === "root" && "bg-highlight-soft font-semibold text-highlight",
                      c.status === "ruled-out" && "text-muted-foreground line-through",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        c.status === "root"
                          ? "bg-highlight"
                          : c.status === "suspected"
                            ? "border-2 border-highlight"
                            : "bg-foreground/40",
                      )}
                    />
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend for cause states. */
export function FishboneLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-highlight" /> Root cause
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-highlight" /> Suspected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-foreground/45" /> Open
      </span>
      <span className="inline-flex items-center gap-1.5 line-through">Ruled out</span>
    </div>
  );
}
