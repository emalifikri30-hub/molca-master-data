import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceMax } from "./highlight-bar-chart";
import { cn } from "@/lib/utils";
import { axisWidth, CategoryTick } from "./svg-chart";

export type WaterfallStep = {
  label: string;
  /** Total / subtotal: the absolute amount. Loss: a positive number that is subtracted. Gain: a positive number that is added. */
  value: number;
  kind: "total" | "loss" | "gain";
  /** Override the bar color (defaults: total = grey, last total = blue, loss = danger, gain = success) */
  color?: string;
  /** Secondary line in the tooltip, e.g. "Unplanned downtime" */
  note?: string;
};

export type WaterfallChartProps = {
  steps: WaterfallStep[];
  unit?: string;
  /** Show each step as % of the first total in labels and tooltip */
  showPercent?: boolean;
  /** Highlight the last total in blue (the result) */
  highlightResult?: boolean;
  /**
   * "floating" (default): each loss is its own floating bar between two totals.
   * "stacked": JIPM / TPM time-structure style — only totals get a column, and the losses
   * taken from the previous total sit as colored caps on top of it (Calendar → Loading → Operating → Net operating → Value added).
   */
  variant?: "floating" | "stacked";
  /** Format numbers in labels and tooltip (e.g. hours → "1 h 10 m") */
  valueFormatter?: (v: number) => string;
  height?: number;
  tickFormatter?: (v: number) => string;
  className?: string;
};

type Row = WaterfallStep & {
  base: number;
  amount: number;
  end: number;
  fill: string;
  pct: number;
  display: string;
};

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Turn steps into floating range rows: each bar spans [base, base + amount]. */
function toRows(
  steps: WaterfallStep[],
  unit: string | undefined,
  showPercent: boolean,
  highlightResult: boolean,
): Row[] {
  const start = steps.find((s) => s.kind === "total")?.value ?? 1;
  const lastTotal = steps.map((s) => s.kind).lastIndexOf("total");
  let running = 0;
  return steps.map((s, i) => {
    let base = 0;
    let end = running;
    if (s.kind === "total") {
      running = s.value;
      end = s.value;
    } else if (s.kind === "loss") {
      end = running - s.value;
      base = end;
      running = end;
    } else {
      base = running;
      end = running + s.value;
      running = end;
    }
    const fill =
      s.color ??
      (s.kind === "loss"
        ? "var(--st-unplanned)"
        : s.kind === "gain"
          ? "var(--st-run)"
          : highlightResult && i === lastTotal && i > 0
            ? "var(--chart-1)"
            : "var(--chart-base)");
    const pct = (s.value / start) * 100;
    const sign = s.kind === "loss" ? "−" : s.kind === "gain" ? "+" : "";
    const display = showPercent
      ? `${sign}${fmt(pct)}%`
      : `${sign}${fmt(s.value)}${unit ? ` ${unit}` : ""}`;
    return { ...s, base, amount: s.value, end, fill, pct, display };
  });
}

/**
 * Waterfall: a start total broken down by losses (or gains) into a result.
 * Classic use: OEE loss waterfall — planned time → availability / performance / quality losses → fully productive time.
 * Totals are grey, the final total is the single blue highlight, losses use their loss color.
 */
export function WaterfallChart(props: WaterfallChartProps) {
  if (props.variant === "stacked") return <StackedWaterfall {...props} />;
  return <FloatingWaterfall {...props} />;
}

function FloatingWaterfall({
  steps,
  unit,
  showPercent = false,
  highlightResult = true,
  height = 280,
  tickFormatter,
  className,
}: WaterfallChartProps) {
  const rows = React.useMemo(
    () => toRows(steps, unit, showPercent, highlightResult),
    [steps, unit, showPercent, highlightResult],
  );
  const max = Math.max(...rows.map((r) => Math.max(r.end, r.base + r.amount)));
  const config = { amount: { label: "Amount", color: "var(--chart-1)" } } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <BarChart data={rows} margin={{ top: 24, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          interval={0}
          height={44}
          tick={<CategoryTick />}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={axisWidth(
            [0, 1, 2, 3, 4].map((k) => (niceMax(max) / 4) * k),
            tickFormatter,
          )}
          ticks={[0, 1, 2, 3, 4].map((k) => +((niceMax(max) / 4) * k).toFixed(6))}
          domain={[0, niceMax(max)]}
          tickFormatter={tickFormatter}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as Row | undefined);
            if (!r) return null;
            return (
              <div className="min-w-40 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-[3px]" style={{ background: r.fill }} />
                  {r.label}
                </div>
                <div className="text-[14px] font-semibold tabular-nums">
                  {r.kind === "loss" ? "−" : r.kind === "gain" ? "+" : ""}
                  {fmt(r.amount)}
                  {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
                  <span className="ml-2 font-normal opacity-65">{fmt(r.pct)}%</span>
                </div>
                {r.note && <div className="mt-0.5 opacity-65">{r.note}</div>}
                {r.kind !== "total" && (
                  <div className="mt-1.5 border-t border-background/15 pt-1.5 opacity-80">
                    Remaining {fmt(r.end)}
                    {unit && ` ${unit}`}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar
          dataKey={(r: Row) => [r.base, r.base + r.amount]}
          name="Amount"
          radius={5}
          isAnimationActive={false}
        >
          {rows.map((r) => (
            <Cell key={r.label} fill={r.fill} />
          ))}
          <LabelList
            dataKey="display"
            content={(p: {
              x?: number | string;
              y?: number | string;
              width?: number | string;
              value?: unknown;
            }) => (
              <text
                x={Number(p.x) + Number(p.width) / 2}
                y={Number(p.y) - 8}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={11.5}
                fontWeight={600}
              >
                {String(p.value ?? "")}
              </text>
            )}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

type StackRow = {
  label: string;
  value: number;
  capTotal: number;
  caps: { label: string; value: number; color: string; note?: string }[];
  fill: string;
  pct: number;
};

/** Totals only; the losses between two totals become caps on top of the second total. */
function toStackRows(steps: WaterfallStep[], highlightResult: boolean): StackRow[] {
  const start = steps.find((s) => s.kind === "total")?.value ?? 1;
  const lastTotal = steps.map((s) => s.kind).lastIndexOf("total");
  const out: StackRow[] = [];
  let pending: StackRow["caps"] = [];
  steps.forEach((s, i) => {
    if (s.kind === "total") {
      const fill =
        s.color ??
        (highlightResult && i === lastTotal && i > 0 ? "var(--chart-1)" : "var(--chart-base)");
      out.push({
        label: s.label,
        value: s.value,
        caps: pending,
        capTotal: pending.reduce((a, c) => a + c.value, 0),
        fill,
        pct: (s.value / start) * 100,
      });
      pending = [];
    } else {
      pending.push({
        label: s.label,
        value: s.value,
        color: s.color ?? "var(--st-unplanned)",
        note: s.note,
      });
    }
  });
  return out;
}

function StackedWaterfall({
  steps,
  unit,
  highlightResult = true,
  height = 300,
  tickFormatter,
  valueFormatter,
  className,
}: WaterfallChartProps) {
  const rows = React.useMemo(() => toStackRows(steps, highlightResult), [steps, highlightResult]);
  const max = Math.max(...rows.map((r) => r.value + r.capTotal));
  const f = valueFormatter ?? ((v: number) => `${fmt(v)}${unit ? ` ${unit}` : ""}`);
  const config = { amount: { label: "Amount", color: "var(--chart-1)" } } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <BarChart data={rows} margin={{ top: 24, right: 4, left: 0, bottom: 0 }} barCategoryGap="14%">
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          interval={0}
          fontSize={11.5}
        />
        {/* the first total (e.g. 24 h calendar time) is the natural ceiling */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          ticks={[0, 0.25, 0.5, 0.75, 1].map((t) => +(t * max).toFixed(2))}
          domain={[0, max]}
          tickFormatter={tickFormatter}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={({ active, payload }) => {
            const r = active && (payload?.[0]?.payload as StackRow | undefined);
            if (!r) return null;
            return (
              <div className="min-w-48 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-[3px]" style={{ background: r.fill }} />
                  {r.label}
                </div>
                <div className="text-[14px] font-semibold tabular-nums">
                  {f(r.value)}
                  <span className="ml-2 font-normal opacity-65">{fmt(r.pct)}%</span>
                </div>
                {r.caps.length > 0 && (
                  <div className="mt-1.5 grid gap-1 border-t border-background/15 pt-1.5">
                    {r.caps.map((c) => (
                      <div key={c.label} className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 opacity-75">
                          <span className="size-2 rounded-[2px]" style={{ background: c.color }} />
                          {c.label}
                        </span>
                        <span className="font-semibold tabular-nums">−{f(c.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar
          dataKey={(r: StackRow) => r.value + r.capTotal}
          name="Amount"
          isAnimationActive={false}
          shape={(p: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            payload?: StackRow;
          }) => {
            const r = p.payload!;
            const x = Number(p.x),
              y = Number(p.y),
              w = Number(p.width),
              h = Number(p.height);
            const total = r.value + r.capTotal || 1;
            const px = (v: number) => (v / total) * h;
            let top = y;
            return (
              <g>
                {r.caps.map((c) => {
                  const ch = Math.max(c.value > 0 ? 2 : 0, px(c.value));
                  const el = (
                    <rect key={c.label} x={x} y={top} width={w} height={ch} rx={2} fill={c.color} />
                  );
                  top += ch;
                  return el;
                })}
                <rect
                  x={x}
                  y={top}
                  width={w}
                  height={Math.max(0, y + h - top)}
                  rx={5}
                  fill={r.fill}
                />
              </g>
            );
          }}
        >
          <LabelList
            dataKey="value"
            content={(p: {
              x?: number | string;
              y?: number | string;
              width?: number | string;
              value?: unknown;
            }) => (
              <text
                x={Number(p.x) + Number(p.width) / 2}
                y={Number(p.y) - 8}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={11.5}
                fontWeight={600}
              >
                {f(Number(p.value))}
              </text>
            )}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
