import * as React from "react";
import { useElementWidth } from "./svg-chart";
import { TipBody } from "./hover-tip";
import { cn } from "@/lib/utils";

export type MarketLevel = {
  /** e.g. "TAM" */
  label: string;
  /** Raw value used for the circle area (any unit, same for every level) */
  value: number;
  /** Formatted value shown next to the circle, e.g. "Rp1,7 T" */
  display: string;
  /** One line under the value, e.g. "8,791 sites × contract value" */
  note?: string;
};

export type MarketSizeCirclesProps = {
  /** Outermost first: TAM, SAM, SOM (2–4 levels) */
  levels: MarketLevel[];
  height?: number;
  className?: string;
};

/**
 * Nested TAM / SAM / SOM circles, the market-size picture used in every pitch deck. Circle AREA is proportional
 * to value (radius = √value), circles sit on a common baseline, and labels sit to the right with leader lines.
 * Very small inner levels get a minimum radius so they stay visible; the label always carries the real number.
 */
export function MarketSizeCircles({ levels, height = 300, className }: MarketSizeCirclesProps) {
  const [ref, width] = useElementWidth(640);
  const [hover, setHover] = React.useState<number | null>(null);
  const pad = 12;
  const labelW = Math.min(260, Math.max(150, width * 0.42));
  const R = Math.min((height - pad * 2) / 2, (width - labelW - pad * 2) / 2);
  const max = levels[0]?.value || 1;
  const radii = levels.map((l, i) =>
    Math.max(Math.sqrt(l.value / max) * R, i === 0 ? R : 10 + (levels.length - i) * 2),
  );
  const cx = pad + R;
  const base = pad + 2 * R;
  const opac = [0.12, 0.24, 1, 1];
  const labelX = cx + R + 28;
  const slot = (2 * R) / levels.length;

  return (
    <div ref={ref} className={cn("relative w-full min-w-0", className)}>
      <svg
        width={width}
        height={Math.max(height, base + pad)}
        role="img"
        aria-label={levels.map((l) => `${l.label} ${l.display}`).join(", ")}
        className="block"
      >
        {levels.map((l, i) => {
          const r = radii[i];
          const cy = base - r;
          const inner = i === levels.length - 1;
          const ly = pad + slot * i + slot / 2;
          return (
            <g
              key={l.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="outline-none"
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--chart-1)"
                fillOpacity={inner ? 1 : opac[i]}
                stroke={hover === i ? "var(--foreground)" : "var(--chart-1)"}
                strokeOpacity={hover === i ? 0.8 : 0.5}
                strokeWidth={hover === i ? 2 : 1}
              />
              <text
                x={cx}
                y={cy - r + (inner ? r + 4 : 18)}
                textAnchor="middle"
                fontSize={inner ? 10.5 : 12}
                fontWeight={600}
                fill={inner ? "var(--background)" : "var(--foreground)"}
                className="pointer-events-none"
              >
                {inner && r < 16 ? "" : l.label}
              </text>
              <path
                d={`M${cx + r * 0.7} ${cy - r * 0.7} L${labelX - 8} ${ly}`}
                stroke="var(--border)"
                fill="none"
              />
              <circle cx={cx + r * 0.7} cy={cy - r * 0.7} r={2.5} fill="var(--foreground)" />
              <text
                x={labelX}
                y={ly - 6}
                fontSize={12}
                fill="var(--muted-foreground)"
                fontWeight={600}
              >
                {l.label}
              </text>
              <text
                x={labelX}
                y={ly + 12}
                fontSize={17}
                fontWeight={600}
                fill="var(--foreground)"
                className="tabular-nums"
              >
                {l.display}
              </text>
              {l.note && (
                <text x={labelX} y={ly + 28} fontSize={11} fill="var(--muted-foreground)">
                  {l.note.length > labelW / 5.6
                    ? l.note.slice(0, Math.floor(labelW / 5.6) - 1) + "…"
                    : l.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 w-max max-w-[min(16rem,60%)] rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg"
          style={{ left: pad + 8, top: pad }}
        >
          <TipBody
            title={levels[hover].label}
            value={levels[hover].display}
            note={[
              levels[hover].note,
              hover > 0
                ? `${((levels[hover].value / levels[hover - 1].value) * 100).toFixed(1)}% of ${levels[hover - 1].label}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
      )}
    </div>
  );
}
