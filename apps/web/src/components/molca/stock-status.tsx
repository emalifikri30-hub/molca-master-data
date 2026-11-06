"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Status model                                                        */
/* ------------------------------------------------------------------ */

/**
 * Stock / material coverage status, by meaning:
 * - covered: enough usable stock for the demand (green)
 * - low: covered, but below the reorder point / safety margin (orange)
 * - short: less than the demand — the order or shift will stop (red)
 * - out: nothing usable left (solid red)
 * - on-order: the gap is covered by a confirmed delivery in time (indigo = planned)
 * - quarantine: stock exists but is blocked by QC / hold and cannot be used (grey, hatched)
 */
export type StockStatus = "covered" | "low" | "short" | "out" | "on-order" | "quarantine";

export const STOCK_STATUS_META: Record<
  StockStatus,
  { label: string; color: string; description: string; rank: number }
> = {
  out: {
    label: "Out of stock",
    color: "var(--sys-red)",
    description: "No usable stock left",
    rank: 0,
  },
  short: {
    label: "Short",
    color: "var(--sys-red)",
    description: "Available stock is below the demand",
    rank: 1,
  },
  quarantine: {
    label: "Quarantine",
    color: "var(--st-off)",
    description: "Stock is blocked by quality hold and cannot be used",
    rank: 2,
  },
  low: {
    label: "Low",
    color: "var(--sys-orange)",
    description: "Covers the demand but is below the reorder point",
    rank: 3,
  },
  "on-order": {
    label: "On order",
    color: "var(--sys-indigo)",
    description: "Gap is covered by a confirmed delivery",
    rank: 4,
  },
  covered: {
    label: "Covered",
    color: "var(--sys-green)",
    description: "Enough usable stock for the demand",
    rank: 5,
  },
};

/** Text color per status that keeps 4.5:1 on the soft fill in all four modes. */
const TEXT: Record<StockStatus, string> = {
  out: "text-danger",
  short: "text-danger",
  quarantine: "text-muted-foreground",
  low: "text-[color-mix(in_oklab,var(--warning)_72%,black)] dark:text-warning",
  "on-order": "text-[color-mix(in_oklab,var(--sys-indigo)_85%,black)] dark:text-sys-indigo",
  covered: "text-success",
};
const SOFT: Record<StockStatus, string> = {
  out: "bg-danger-soft",
  short: "bg-danger-soft",
  quarantine: "bg-muted",
  low: "bg-warning-soft",
  "on-order": "bg-[color-mix(in_oklab,var(--sys-indigo)_13%,transparent)]",
  covered: "bg-success-soft",
};

/**
 * Status for a coverage value (hours, days or quantity) against the demand.
 * `reorderPoint` is the level (same unit) below which stock counts as low; default 1.2 × required.
 */
export function coverageStatus(
  available: number,
  required: number,
  opts: { reorderPoint?: number; onOrder?: number; blocked?: boolean } = {},
): StockStatus {
  if (opts.blocked) return "quarantine";
  if (available <= 0 && !(opts.onOrder && opts.onOrder >= required)) return "out";
  if (available < required)
    return opts.onOrder && available + opts.onOrder >= required ? "on-order" : "short";
  if (available < (opts.reorderPoint ?? required * 1.2)) return "low";
  return "covered";
}

/* ------------------------------------------------------------------ */
/* StockStatusBadge                                                    */
/* ------------------------------------------------------------------ */

export type StockStatusBadgeProps = {
  status: StockStatus;
  /** Override the label (e.g. "Short 14 rolls") */
  label?: React.ReactNode;
  /** "dot" = neutral pill with colored dot (dense tables), "soft" = tinted pill */
  variant?: "dot" | "soft";
  size?: "sm" | "default";
  className?: string;
};

function StatusDot({ status, className }: { status: StockStatus; className?: string }) {
  const color = STOCK_STATUS_META[status].color;
  if (status === "quarantine")
    return (
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full border", className)}
        style={{
          borderColor: color,
          background: `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 3px)`,
        }}
      />
    );
  if (status === "on-order")
    return (
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full border-[1.5px]", className)}
        style={{ borderColor: color }}
      />
    );
  if (status === "out")
    return (
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full ring-2 ring-[color-mix(in_oklab,var(--sys-red)_30%,transparent)]",
          className,
        )}
        style={{ background: color }}
      />
    );
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}

/** Dot + label status pill. The label always carries the meaning; color only reinforces it. */
export function StockStatusBadge({
  status,
  label,
  variant = "soft",
  size = "default",
  className,
}: StockStatusBadgeProps) {
  const meta = STOCK_STATUS_META[status];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-[11.5px]" : "h-6 px-2 text-[12px]",
        variant === "soft" ? [SOFT[status], TEXT[status]] : "border bg-card text-foreground",
        status === "out" && variant === "soft" && "font-semibold",
        className,
      )}
    >
      <StatusDot status={status} />
      {label ?? meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CoverageMeter                                                       */
/* ------------------------------------------------------------------ */

export type CoverageMeterProps = {
  /** Coverage of the usable stock (hours, days or quantity) */
  value: number;
  /** Coverage the demand needs (e.g. until the next delivery or end of order) */
  required: number;
  /** Reorder point in the same unit — marker + "low" threshold */
  reorderPoint?: number;
  /** Additional coverage from a confirmed delivery (hatched extension) */
  onOrder?: number;
  /** Axis maximum. Default: 1.25 × the largest of value + onOrder, required, reorderPoint */
  max?: number;
  /** Unit label, e.g. "h", "d", "rolls" */
  unit?: string;
  /** Status override (otherwise from coverageStatus) */
  status?: StockStatus;
  /** Show the text line above the bar. Default true. */
  showLabel?: boolean;
  size?: "sm" | "default";
  className?: string;
};

const pct = (v: number, max: number) =>
  `${Math.round(Math.max(0, Math.min(1, v / max)) * 1000) / 10}%`;
const num = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 });

/** Horizontal coverage bar: usable stock vs requirement, with the reorder point and incoming deliveries. */
export function CoverageMeter({
  value,
  required,
  reorderPoint,
  onOrder,
  max,
  unit = "h",
  status,
  showLabel = true,
  size = "default",
  className,
}: CoverageMeterProps) {
  const st = status ?? coverageStatus(value, required, { reorderPoint, onOrder });
  const top = max ?? Math.max(value + (onOrder ?? 0), required, reorderPoint ?? 0) * 1.25;
  const color = st === "covered" ? "var(--foreground)" : STOCK_STATUS_META[st].color;
  const gap = required - value;
  const sm = size === "sm";
  return (
    <div className={cn("@container grid min-w-0 gap-1.5", className)}>
      {showLabel && (
        <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
          <span>
            <span className={cn("font-semibold", sm ? "text-[12.5px]" : "text-[13.5px]")}>
              {num(value)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              {unit} of {num(required)} {unit}
            </span>
          </span>
          {gap > 0 ? (
            <span
              className={cn(
                "font-medium",
                st === "on-order" ? "text-muted-foreground" : "text-danger",
              )}
            >
              −{num(gap)} {unit}
              {st === "on-order" && " · on order"}
            </span>
          ) : (
            <span className="hidden text-muted-foreground @[14rem]:inline">
              +{num(-gap)} {unit} spare
            </span>
          )}
        </div>
      )}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={Math.round(top * 100) / 100}
        aria-valuenow={value}
        aria-valuetext={`${num(value)} ${unit} of ${num(required)} ${unit} required, ${STOCK_STATUS_META[st].label}`}
        className={cn("relative rounded-full bg-foreground/10", sm ? "h-1.5" : "h-2")}
      >
        {onOrder ? (
          <span
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: pct(value, top),
              width: pct(onOrder, top),
              background:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--sys-indigo) 55%, transparent) 0 2px, transparent 2px 4px)",
            }}
          />
        ) : null}
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: pct(value, top),
            background: color,
            opacity: st === "covered" ? 0.45 : 1,
          }}
        />
        {reorderPoint != null && (
          <span
            title={`Reorder point ${num(reorderPoint)} ${unit}`}
            aria-hidden
            className="absolute -inset-y-1 w-0 border-l border-dashed border-muted-foreground"
            style={{ left: pct(reorderPoint, top) }}
          />
        )}
        <span
          title={`Required ${num(required)} ${unit}`}
          aria-hidden
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: pct(required, top) }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MaterialCoverageList                                                */
/* ------------------------------------------------------------------ */

export type MaterialLine = {
  code: string;
  name: string;
  unit: string;
  /** Demand for the order / line / shift */
  required: number;
  /** Usable stock (line-side + warehouse, excluding blocked) */
  available: number;
  /** Confirmed open purchase / transfer quantity */
  onOrder?: number;
  /** Arrival of the open quantity, e.g. "Today 12:40" */
  eta?: string;
  /** When the material runs out at the current rate, e.g. "10:15" */
  runsOutAt?: string;
  /** Blocked quantity (QC hold) — shown, but not counted as available */
  blocked?: number;
  location?: string;
  /** Status override (e.g. on-order that arrives too late is still "short") */
  status?: StockStatus;
  note?: string;
};

export type MaterialCoverageListProps = {
  items: MaterialLine[];
  /** Sort worst first (out, short, quarantine, low, on order, covered). Default true. */
  sortByStatus?: boolean;
  /** Per-row action, e.g. a "Request" button for short items */
  renderAction?: (item: MaterialLine, status: StockStatus) => React.ReactNode;
  /** Hide the summary line */
  hideSummary?: boolean;
  className?: string;
};

/** Status of a material line (explicit override wins). */
export function materialStatus(m: MaterialLine): StockStatus {
  if (m.status) return m.status;
  if (m.blocked && m.available <= 0) return "quarantine";
  return coverageStatus(m.available, m.required, { onOrder: m.onOrder });
}

/**
 * Materials for an order or line: required vs available vs on order, coverage meter, status and ETA.
 * Lays out as a table-like grid in wide containers and as stacked rows in narrow panels (container queries).
 */
export function MaterialCoverageList({
  items,
  sortByStatus = true,
  renderAction,
  hideSummary,
  className,
}: MaterialCoverageListProps) {
  const rows = items.map((m) => ({ m, st: materialStatus(m) }));
  if (sortByStatus)
    rows.sort((a, b) => STOCK_STATUS_META[a.st].rank - STOCK_STATUS_META[b.st].rank);
  const counts = rows.reduce<Partial<Record<StockStatus, number>>>(
    (acc, r) => ({ ...acc, [r.st]: (acc[r.st] ?? 0) + 1 }),
    {},
  );
  const order: StockStatus[] = ["out", "short", "quarantine", "low", "on-order", "covered"];
  const cols =
    "@[40rem]:grid-cols-[minmax(8rem,1.5fr)_4.25rem_4.75rem_5.25rem_minmax(5.5rem,1fr)_7rem]";

  return (
    <div className={cn("@container w-full", className)}>
      {!hideSummary && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Status summary">
          {order
            .filter((s) => counts[s])
            .map((s) => (
              <StockStatusBadge
                key={s}
                status={s}
                variant="dot"
                size="sm"
                label={`${counts[s]} ${STOCK_STATUS_META[s].label.toLowerCase()}`}
              />
            ))}
        </div>
      )}
      <div
        role="table"
        aria-label="Material coverage"
        className="overflow-hidden rounded-xl border"
      >
        <div
          role="row"
          className={cn(
            "hidden border-b bg-subtle px-3 py-2 text-[11.5px] font-medium text-muted-foreground @[40rem]:grid @[40rem]:items-center @[40rem]:gap-3",
            cols,
          )}
        >
          <span role="columnheader">Material</span>
          <span role="columnheader" className="text-right">
            Required
          </span>
          <span role="columnheader" className="text-right">
            Available
          </span>
          <span role="columnheader" className="text-right">
            On order
          </span>
          <span role="columnheader">Coverage</span>
          <span role="columnheader">Status</span>
        </div>
        {rows.map(({ m, st }) => {
          const bad = st === "short" || st === "out";
          return (
            <div
              role="row"
              key={m.code}
              className={cn(
                "grid gap-x-3 gap-y-2 border-b px-3 py-2.5 text-[13px] last:border-b-0 @[40rem]:items-center",
                cols,
                bad && "bg-[color-mix(in_oklab,var(--sys-red)_5%,transparent)]",
              )}
            >
              <div role="cell" className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    <span className="font-mono">{m.code}</span>
                    {m.location && <> · {m.location}</>}
                  </div>
                </div>
                <span className="@[40rem]:hidden">
                  <StockStatusBadge status={st} size="sm" />
                </span>
              </div>
              {/* numbers: inline row on narrow, columns on wide */}
              <div className="grid grid-cols-3 gap-2 text-[12px] tabular-nums @[40rem]:contents">
                <div role="cell" className="@[40rem]:text-right">
                  <span className="block text-[11px] text-muted-foreground @[40rem]:hidden">
                    Required
                  </span>
                  {num(m.required)} <span className="text-muted-foreground">{m.unit}</span>
                </div>
                <div
                  role="cell"
                  className={cn("@[40rem]:text-right", bad && "font-semibold text-danger")}
                >
                  <span className="block text-[11px] font-normal text-muted-foreground @[40rem]:hidden">
                    Available
                  </span>
                  {num(m.available)}{" "}
                  <span
                    className={cn(bad ? "text-danger/80" : "text-muted-foreground", "font-normal")}
                  >
                    {m.unit}
                  </span>
                  {m.blocked ? (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      +{num(m.blocked)} blocked
                    </span>
                  ) : null}
                </div>
                <div role="cell" className="@[40rem]:text-right">
                  <span className="block text-[11px] text-muted-foreground @[40rem]:hidden">
                    On order
                  </span>
                  {m.onOrder ? (
                    <>
                      {num(m.onOrder)} <span className="text-muted-foreground">{m.unit}</span>
                      {m.eta && (
                        <span className="block text-[11px] text-muted-foreground">ETA {m.eta}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div role="cell" className="min-w-0">
                <CoverageMeter
                  value={m.available}
                  required={m.required}
                  onOrder={m.onOrder}
                  unit={m.unit}
                  status={st}
                  size="sm"
                  showLabel={false}
                  className="mt-1"
                />
                <div
                  className={cn(
                    "mt-1 text-[11.5px] tabular-nums",
                    bad ? "text-danger" : "text-muted-foreground",
                  )}
                >
                  {m.available < m.required ? (
                    <span className="font-semibold">
                      −{num(m.required - m.available)} {m.unit}
                    </span>
                  ) : (
                    <span>
                      {m.required > 0 ? Math.round((m.available / m.required) * 100) : 100}% covered
                    </span>
                  )}
                  {m.runsOutAt && <> · runs out {m.runsOutAt}</>}
                  {m.note && <> · {m.note}</>}
                </div>
              </div>
              <div
                role="cell"
                className={cn(
                  "flex items-center gap-2",
                  renderAction
                    ? "justify-between @[40rem]:flex-col @[40rem]:items-start"
                    : "hidden @[40rem]:flex",
                )}
              >
                <span className="hidden @[40rem]:inline-flex">
                  <StockStatusBadge status={st} />
                </span>
                {renderAction?.(m, st)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
