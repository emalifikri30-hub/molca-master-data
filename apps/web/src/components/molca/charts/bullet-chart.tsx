import { cn } from "@/lib/utils";
import { DeltaBadge } from "./kpi-chart-card";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";
import { OEE_CLASSES_4 } from "@/lib/oee";

export type BulletItem = {
  label: string;
  description?: string;
  actual: number;
  target: number;
  /**
   * The two boundaries between the qualitative ranges, in value units.
   * Higher is better: [poor → ok, ok → good]. Lower is better: [good → ok, ok → poor].
   */
  ranges: [number, number];
  min?: number;
  max: number;
  unit?: string;
  /** Energy per unit, scrap, MTTR, lead time… — the good range sits on the left */
  lowerIsBetter?: boolean;
  /** Suffix for the delta vs target, e.g. " pt" for percentages */
  deltaSuffix?: string;
  valueFormatter?: (v: number) => string;
  /**
   * Custom qualitative bands that replace the three ranges in the drawing, e.g. the OEE benchmark classes
   * (bulletBandsFromOee()). Colors are softened for the track; the bar takes the full color when bar="status".
   */
  bands?: { from: number; to: number; color: string; label: string }[];
};

/** OEE benchmark classes (src/lib/oee.ts) as bullet bands. */
export function bulletBandsFromOee(max = 100): NonNullable<BulletItem["bands"]> {
  return OEE_CLASSES_4.map((c, i) => ({
    from: c.min,
    to: OEE_CLASSES_4[i + 1]?.min ?? max,
    color: c.color,
    label: c.label,
  }));
}

const bandOf = (v: number, bands: NonNullable<BulletItem["bands"]>) =>
  bands.find((b) => v >= b.from && v < b.to) ?? bands[v < bands[0].from ? 0 : bands.length - 1];

export type BulletRating = "poor" | "ok" | "good";

export const BULLET_LABEL: Record<BulletRating, string> = { poor: "Poor", ok: "OK", good: "Good" };

/** Which qualitative range a value falls into. */
export function bulletRating(
  v: number,
  item: Pick<BulletItem, "ranges" | "lowerIsBetter">,
): BulletRating {
  const [a, b] = item.ranges;
  if (item.lowerIsBetter) return v <= a ? "good" : v <= b ? "ok" : "poor";
  return v < a ? "poor" : v < b ? "ok" : "good";
}

const GREY: Record<BulletRating, string> = {
  poor: "color-mix(in oklab, var(--muted-foreground) 38%, var(--chart-base))",
  ok: "color-mix(in oklab, var(--muted-foreground) 14%, var(--chart-base))",
  good: "color-mix(in oklab, var(--chart-base) 55%, var(--card))",
};
const SOFT: Record<BulletRating, string> = {
  poor: "var(--danger-soft)",
  ok: "var(--warning-soft)",
  good: "var(--success-soft)",
};
const STATUS: Record<BulletRating, string> = {
  poor: "var(--st-unplanned)",
  ok: "var(--st-small)",
  good: "var(--st-run)",
};

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export type BulletChartProps = {
  item: BulletItem;
  /** "grey": classic Stephen Few bands (darker = worse). "status": soft red / orange / green bands. */
  bands?: "grey" | "status";
  /** "highlight": the actual bar is blue. "status": colored by the range it lands in. */
  bar?: "highlight" | "status";
  height?: number;
  /** Tick labels under the track (min, boundaries, max) */
  showScale?: boolean;
  className?: string;
};

/** One bullet: qualitative bands, the actual bar and the target tick, on a linear scale. */
export function BulletChart({
  item,
  bands = "grey",
  bar = "highlight",
  height = 22,
  showScale = true,
  className,
}: BulletChartProps) {
  const min = item.min ?? 0;
  const span = item.max - min || 1;
  const pct = (v: number) => `${(Math.max(0, Math.min(1, (v - min) / span)) * 100).toFixed(2)}%`;
  const [a, b] = item.ranges;
  const order: BulletRating[] = item.lowerIsBetter
    ? ["good", "ok", "poor"]
    : ["poor", "ok", "good"];
  const segs = [
    { from: min, to: a, r: order[0] },
    { from: a, to: b, r: order[1] },
    { from: b, to: item.max, r: order[2] },
  ];
  const rating = bulletRating(item.actual, item);
  const f = item.valueFormatter ?? fmt;
  return (
    <div className={cn("w-full", className)}>
      <div className="relative w-full overflow-hidden rounded-[5px]" style={{ height }}>
        {item.bands
          ? item.bands.map((b) => (
              <div
                key={b.label}
                title={b.label}
                className="absolute inset-y-0"
                style={{
                  left: pct(Math.max(min, b.from)),
                  width: `calc(${pct(b.to)} - ${pct(Math.max(min, b.from))})`,
                  background: `color-mix(in oklab, ${b.color} 32%, var(--card))`,
                }}
              />
            ))
          : segs.map((s) => (
              <div
                key={s.r}
                className="absolute inset-y-0"
                style={{
                  left: pct(s.from),
                  width: `calc(${pct(s.to)} - ${pct(s.from)})`,
                  background: bands === "status" ? SOFT[s.r] : GREY[s.r],
                }}
              />
            ))}
        <div
          className="absolute left-0 rounded-r-[3px]"
          style={{
            top: "33%",
            height: "34%",
            width: pct(item.actual),
            background:
              bar === "status"
                ? item.bands
                  ? bandOf(item.actual, item.bands).color
                  : STATUS[rating]
                : "var(--chart-1)",
          }}
        />
        <div
          className="absolute w-[3px] -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: pct(item.target), top: "12%", height: "76%" }}
        />
      </div>
      {showScale && (
        <div className="relative mt-1 h-3.5 text-[10.5px] text-muted-foreground tabular-nums">
          {(() => {
            const ticks = item.bands
              ? [
                  min,
                  ...item.bands.map((x) => x.from).filter((v) => v > min && v < item.max),
                  item.max,
                ]
              : [min, a, b, item.max];
            return ticks.map((v, i) => (
              <span
                key={i}
                className={cn(
                  "absolute",
                  i === 0 ? "left-0" : i === ticks.length - 1 ? "right-0" : "-translate-x-1/2",
                )}
                style={i === 0 || i === ticks.length - 1 ? undefined : { left: pct(v) }}
              >
                {f(v)}
              </span>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

export type BulletListProps = Omit<BulletChartProps, "item"> & {
  items: BulletItem[];
  labelWidth?: number;
  className?: string;
};

/** A KPI list: label · bullet · actual with delta vs target. Rows share layout, not scale — every KPI keeps its own min / max. */
export function BulletList({
  items,
  labelWidth = 150,
  bands,
  bar,
  height,
  showScale = true,
  className,
}: BulletListProps) {
  const tip = useHoverTip();
  return (
    <div ref={tip.ref} className={cn("relative grid gap-4", className)}>
      {items.map((it) => {
        const f = it.valueFormatter ?? fmt;
        const r = bulletRating(it.actual, it);
        const delta = it.actual - it.target;
        return (
          <div
            key={it.label}
            className="grid items-center gap-x-4 gap-y-1.5"
            style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr) 132px` }}
            onMouseEnter={(e) =>
              tip.show(
                e,
                <TipBody
                  title={it.label}
                  rows={[
                    {
                      label: "Actual",
                      value: `${f(it.actual)}${it.unit ? ` ${it.unit}` : ""}`,
                      color:
                        bar === "status"
                          ? it.bands
                            ? bandOf(it.actual, it.bands).color
                            : STATUS[r]
                          : "var(--chart-1)",
                    },
                    {
                      label: "Target",
                      value: `${f(it.target)}${it.unit ? ` ${it.unit}` : ""}`,
                      color: "var(--foreground)",
                    },
                  ]}
                  note={`${it.bands ? bandOf(it.actual, it.bands).label : `${BULLET_LABEL[r]} range`} · ${it.lowerIsBetter ? "lower is better" : "higher is better"}`}
                />,
              )
            }
            onMouseLeave={tip.hide}
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{it.label}</div>
              {it.description && (
                <div className="truncate text-[12px] text-muted-foreground">{it.description}</div>
              )}
            </div>
            <BulletChart
              item={it}
              bands={bands}
              bar={bar}
              height={height}
              showScale={showScale}
              className={showScale ? "pt-3.5" : undefined}
            />
            <div className="flex items-center justify-end gap-2">
              <span className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums">
                {f(it.actual)}
                {it.unit && (
                  <span className="ml-0.5 text-[12px] font-medium tracking-normal text-muted-foreground">
                    {it.unit}
                  </span>
                )}
              </span>
              <DeltaBadge
                value={Number(delta.toFixed(2))}
                suffix={it.deltaSuffix ?? ""}
                goodWhen={it.lowerIsBetter ? "down" : "up"}
              />
            </div>
          </div>
        );
      })}
      <HoverTip state={tip.state} />
    </div>
  );
}

/** Legend for the bullet anatomy: actual bar, target tick and the three ranges. */
export function BulletLegend({
  bands = "grey",
  bar = "highlight",
  className,
}: {
  bands?: "grey" | "status";
  bar?: "highlight" | "status";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-1.5 w-4 rounded-[2px]"
          style={{ background: bar === "status" ? "var(--st-run)" : "var(--chart-1)" }}
        />
        Actual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-[3px] rounded-full bg-foreground" />
        Target
      </span>
      {(["poor", "ok", "good"] as const).map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[3px] border border-border/60"
            style={{ background: bands === "status" ? SOFT[r] : GREY[r] }}
          />
          {BULLET_LABEL[r]}
        </span>
      ))}
    </div>
  );
}
