"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { TipBody } from "./hover-tip";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * One stock movement and the balance after it — a row of the stock ledger.
 * kind: receipt (stock in), issue (to a work order), return, adjustment (count), transfer_in / transfer_out.
 */
export type StockMovement = {
  at: string | number | Date;
  /** Balance after the movement */
  level: number;
  kind: string;
  /** Signed quantity of the movement */
  qty: number;
  note?: string;
};

const ms = (d: StockMovement["at"]) =>
  d instanceof Date ? d.getTime() : typeof d === "number" ? d : new Date(d).getTime();
const isStockout = (m: StockMovement) => /stock-?out/i.test(m.note ?? "") || m.level < 0;

/** Cycles (receipts), stock-outs, time below min (share of the window) and average level, from the movements. */
export function sawtoothStats(points: readonly StockMovement[], min: number, now = Date.now()) {
  const pts = [...points].sort((a, b) => ms(a.at) - ms(b.at));
  if (!pts.length) return { receipts: 0, stockouts: 0, belowMinShare: 0, average: 0, current: 0 };
  let below = 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const t0 = ms(pts[i]!.at);
    const t1 = i + 1 < pts.length ? ms(pts[i + 1]!.at) : now;
    const dt = Math.max(0, t1 - t0);
    area += pts[i]!.level * dt;
    if (pts[i]!.level <= min) below += dt;
  }
  const span = Math.max(1, now - ms(pts[0]!.at));
  return {
    receipts: pts.filter((p) => p.kind === "receipt").length,
    stockouts: pts.filter(isStockout).length,
    belowMinShare: below / span,
    average: area / span,
    current: pts[pts.length - 1]!.level,
  };
}

/* ------------------------------------------------------------------ */
/* Chart                                                               */
/* ------------------------------------------------------------------ */

export type StockSawtoothChartProps = {
  points: StockMovement[];
  min: number;
  max: number;
  /** Reorder level: the stock at which an order is placed (min + demand during the lead time) */
  reorderPoint?: number;
  /**
   * "sawtooth" (default): the textbook stock-control chart — consumption as a falling line, receipts as vertical
   * rises, with the lead time marked from crossing the reorder level to the receipt.
   * "step": the exact ledger — level held flat until each movement (lumpy spare-part demand).
   */
  shape?: "sawtooth" | "step";
  unit?: string;
  /** Window end (default now): the last level is carried to it */
  now?: number;
  height?: number;
  locale?: string;
  /** Labels for i18n */
  labels?: {
    level?: string;
    max?: string;
    min?: string;
    reorder?: string;
    receipt?: string;
    stockout?: string;
    issue?: string;
    lead?: string;
    buffer?: string;
  };
  /** Screen-reader summary; built from the data when omitted */
  summary?: string;
  className?: string;
};

/**
 * The inventory sawtooth: on-hand stock as a step line over time against max, min / reorder point. Each fall is
 * consumption, each rise a receipt; the shaded band below min is where a stock-out is near. Receipts are green
 * dots, stock-outs red. Read it for: is the min right (how often and how long below it), is the max too high
 * (long flat tops), is the lead time longer than the stock lasts (drops to zero before the rise).
 */
export function StockSawtoothChart({
  points,
  min,
  max,
  reorderPoint,
  shape = "sawtooth",
  unit = "",
  now = Date.now(),
  height = 260,
  locale = "en-US",
  labels,
  summary,
  className,
}: StockSawtoothChartProps) {
  const L = {
    level: "On hand",
    max: "Maximum",
    min: "Minimum",
    reorder: "Reorder level",
    receipt: "Receipt",
    stockout: "Stock-out",
    issue: "Issue",
    lead: "Lead time",
    buffer: "Buffer stock",
    ...labels,
  };
  const rows = React.useMemo(() => {
    const pts = [...points].sort((a, b) => ms(a.at) - ms(b.at));
    type Row = { x: number; level: number; src: StockMovement; zone: [number, number] };
    const out: Row[] = [];
    if (shape === "step") {
      for (const p of pts) {
        const x = ms(p.at);
        if (out.length) out.push({ x, level: out[out.length - 1]!.level, src: p, zone: [0, min] });
        out.push({ x, level: p.level, src: p, zone: [0, min] });
      }
    } else {
      // the textbook model: one tooth per replenishment cycle — a straight fall from the level after a receipt to the
      // level just before the next one, then a vertical rise. Issues inside a cycle are not drawn one by one.
      let before = pts[0]?.level ?? 0;
      for (const [i, p] of pts.entries()) {
        const x = ms(p.at);
        if (i === 0) out.push({ x, level: p.level, src: p, zone: [0, min] });
        else if (p.qty > 0) {
          out.push({
            x,
            level: before,
            src: { ...p, level: before, kind: "before", qty: 0 },
            zone: [0, min],
          });
          out.push({ x, level: p.level, src: p, zone: [0, min] });
        }
        before = p.level;
      }
      const last = pts[pts.length - 1];
      if (last && out[out.length - 1]?.src !== last)
        out.push({ x: ms(last.at), level: last.level, src: last, zone: [0, min] });
    }
    if (out.length)
      out.push({
        ...out[out.length - 1]!,
        x: now,
        src: { ...out[out.length - 1]!.src, kind: "now", qty: 0 },
      });
    return out;
  }, [points, min, now, shape]);
  // lead time: from the moment stock fell to the reorder level to the receipt that refilled it
  const leads = React.useMemo(() => {
    if (reorderPoint == null) return [];
    const pts = [...points].sort((a, b) => ms(a.at) - ms(b.at));
    const spans: { x1: number; x2: number }[] = [];
    let crossed: number | null = null;
    let prev = pts[0]?.level ?? 0;
    for (const p of pts) {
      if (p.qty < 0 && prev > reorderPoint && p.level <= reorderPoint && crossed === null)
        crossed = ms(p.at);
      if (p.qty > 0 && crossed !== null && !isStockout(p)) {
        spans.push({ x1: crossed, x2: ms(p.at) });
        crossed = null;
      }
      prev = p.level;
    }
    return spans;
  }, [points, reorderPoint]);
  const receipts = rows
    .filter(
      (r) =>
        (r.src.kind === "receipt" || r.src.kind === "transfer_in") &&
        r.src.qty > 0 &&
        !isStockout(r.src),
    )
    .map((r) => ({ x: r.x, dot: r.level }));
  const outs = rows
    .filter((r) => isStockout(r.src))
    .map((r) => ({ x: r.x, dot: Math.max(0, r.level - r.src.qty) }));
  const top = Math.max(max, ...rows.map((r) => r.level)) * 1.12 || 1;
  const fmtDate = (v: number) =>
    new Date(v).toLocaleDateString(locale, { day: "2-digit", month: "short" });
  const st = sawtoothStats(points, min, now);
  const auto = `${L.level} ${st.current} ${unit}; ${st.receipts} receipts, ${st.stockouts} stock-outs, ${Math.round(st.belowMinShare * 100)}% of the time at or below min (${min} ${unit}).`;
  const config = { level: { label: L.level, color: "var(--chart-1)" } } satisfies ChartConfig;

  return (
    <div role="img" aria-label={summary ?? auto} className={cn("w-full", className)}>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            type="number"
            dataKey="x"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={fmtDate}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={36}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickMargin={6}
            domain={[0, Math.ceil(top)]}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeOpacity: 0.35,
              strokeDasharray: "3 3",
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0]?.payload as (typeof rows)[number] | undefined;
              if (!r?.src) return null;
              const m = r.src;
              const what = isStockout(m)
                ? L.stockout
                : m.kind === "receipt"
                  ? L.receipt
                  : m.kind === "issue"
                    ? L.issue
                    : m.kind;
              return (
                <div className="rounded-lg border bg-popover px-2.5 py-2 text-xs shadow-md">
                  <TipBody
                    title={new Date(r.x).toLocaleString(locale, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    rows={[
                      {
                        label: L.level,
                        value: `${m.level} ${unit}`.trim(),
                        color: "var(--chart-1)",
                      },
                      ...(m.kind !== "now"
                        ? [{ label: what, value: `${m.qty > 0 ? "+" : ""}${m.qty} ${unit}`.trim() }]
                        : []),
                    ]}
                    note={m.note}
                  />
                </div>
              );
            }}
          />
          <Area
            dataKey="zone"
            type="stepAfter"
            stroke="none"
            fill="var(--sys-orange)"
            fillOpacity={0.1}
            isAnimationActive={false}
            activeDot={false}
          />
          {leads.map((l, i) => (
            <ReferenceArea
              key={i}
              x1={l.x1}
              x2={l.x2}
              y1={reorderPoint}
              y2={Math.min(top, (reorderPoint ?? 0) + (max - (reorderPoint ?? 0)) * 0.18)}
              fill="var(--sys-indigo)"
              fillOpacity={0.14}
              stroke="var(--sys-indigo)"
              strokeOpacity={0.5}
              label={
                i === 0
                  ? {
                      value: L.lead,
                      position: "insideTop",
                      fontSize: 10,
                      fill: "var(--sys-indigo)",
                    }
                  : undefined
              }
            />
          ))}
          <ReferenceLine
            y={max}
            stroke="var(--sys-green)"
            strokeDasharray="5 4"
            label={{
              value: `${L.max} ${max}`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
          <ReferenceLine
            y={min}
            stroke="var(--sys-red)"
            strokeDasharray="5 4"
            label={{
              value: `${L.min} ${min} · ${L.buffer}`,
              position: "insideBottomLeft",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
          {reorderPoint != null && reorderPoint !== min ? (
            <ReferenceLine
              y={reorderPoint}
              stroke="var(--sys-indigo)"
              strokeDasharray="5 4"
              label={{
                value: `${L.reorder} ${reorderPoint}`,
                position: "insideBottomRight",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
          ) : null}
          <Line
            dataKey="level"
            type="linear"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {receipts.length ? (
            <Scatter
              data={receipts}
              dataKey="dot"
              fill="var(--sys-green)"
              isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number }) => (
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={3.5}
                  fill="var(--sys-green)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              )}
            />
          ) : null}
          {/* an empty Scatter falls back to the chart's rows in recharts: render it only with points */}
          {outs.length ? (
            <Scatter
              data={outs}
              dataKey="dot"
              fill="var(--sys-red)"
              isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number }) => (
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={4.5}
                  fill="var(--sys-red)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              )}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

/** Legend for StockSawtoothChart. */
export function StockSawtoothLegend({
  labels,
  className,
}: {
  labels?: StockSawtoothChartProps["labels"];
  className?: string;
}) {
  const L = {
    level: "On hand",
    max: "Maximum",
    min: "Minimum (buffer stock)",
    reorder: "Reorder level",
    lead: "Lead time",
    receipt: "Receipt",
    stockout: "Stock-out",
    ...labels,
  };
  const item = (swatch: React.ReactNode, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {text}
    </span>
  );
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {item(<span className="h-0.5 w-4 rounded bg-chart-1" />, L.level)}
      {item(<span className="w-4 border-t border-dashed border-sys-green" />, L.max)}
      {item(<span className="w-4 border-t border-dashed border-sys-indigo" />, L.reorder)}
      {item(<span className="w-4 border-t border-dashed border-sys-red" />, L.min)}
      {item(
        <span className="h-2.5 w-4 rounded-sm border border-sys-indigo/50 bg-sys-indigo/15" />,
        L.lead,
      )}
      {item(<span className="size-2 rounded-full bg-sys-green" />, L.receipt)}
      {item(<span className="size-2.5 rounded-full bg-sys-red" />, L.stockout)}
    </div>
  );
}
