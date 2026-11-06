"use client";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Cost of maintenance work: labour (hours × the person's rate) plus parts issued (quantity × unit cost), and per
 * asset the split between reactive (corrective + emergency) and planned (preventive, inspection, improvement).
 */
export type CostLine = { label: string; hours?: number; rate?: number; cost: number };
export type AssetCost = {
  assetId: string;
  assetTag: string;
  labour: number;
  parts: number;
  corrective: number;
  preventive: number;
  total: number;
  hours?: number;
};

export const COST_COLORS = {
  labour: "var(--sys-indigo)",
  parts: "var(--sys-orange)",
  corrective: "var(--sys-red)",
  preventive: "var(--sys-green)",
};

export function formatMoney(v: number, currency = "IDR", compact = true) {
  if (currency === "IDR" && compact) {
    if (Math.abs(v) >= 1e9) return `Rp${(v / 1e9).toFixed(1)} M`;
    if (Math.abs(v) >= 1e6) return `Rp${(v / 1e6).toFixed(1)} jt`;
    if (Math.abs(v) >= 1e3) return `Rp${Math.round(v / 1e3)} rb`;
    return `Rp${Math.round(v)}`;
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

/** Two-part bar with the totals: labour against parts of one work order. */
export function WorkOrderCost({
  labour,
  parts,
  lines = [],
  currency = "IDR",
  className,
}: {
  labour: number;
  parts: number;
  lines?: CostLine[];
  currency?: string;
  className?: string;
}) {
  const total = labour + parts;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  return (
    <div className={cn("grid gap-2.5", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[24px] leading-none font-semibold tracking-tight tabular-nums">
          {formatMoney(total, currency)}
        </span>
        <span className="text-[12px] text-muted-foreground">total</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${pct(labour)}%`, background: COST_COLORS.labour }} />
        <div style={{ width: `${pct(parts)}%`, background: COST_COLORS.parts }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        {[
          ["Labour", labour, COST_COLORS.labour],
          ["Parts", parts, COST_COLORS.parts],
        ].map(([l, v, c]) => (
          <div key={l as string} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: c as string }} />
            <span className="text-muted-foreground">{l as string}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatMoney(v as number, currency)}
            </span>
          </div>
        ))}
      </div>
      {lines.length > 0 && (
        <div className="divide-y rounded-lg border text-[12.5px]">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              {l.hours != null && (
                <span className="text-muted-foreground tabular-nums">
                  {l.hours} h{l.rate != null ? ` × ${formatMoney(l.rate, currency)}` : ""}
                </span>
              )}
              <span className="w-20 text-right font-medium tabular-nums">
                {formatMoney(l.cost, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ranked assets by maintenance cost; each bar splits reactive against planned. */
export function AssetCostRanking({
  rows,
  limit = 12,
  currency = "IDR",
  onSelect,
  className,
}: {
  rows: AssetCost[];
  limit?: number;
  currency?: string;
  onSelect?: (assetId: string) => void;
  className?: string;
}) {
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.total));
  return (
    <div className={cn("grid gap-1.5", className)}>
      {top.map((r) => (
        <button
          key={r.assetId}
          type="button"
          onClick={() => onSelect?.(r.assetId)}
          className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12.5px] hover:bg-subtle"
        >
          <span className="truncate font-mono text-[12px]">{r.assetTag}</span>
          <span
            className="flex h-3.5 overflow-hidden rounded-sm bg-muted"
            title={`reactive ${formatMoney(r.corrective, currency)} · planned ${formatMoney(r.preventive, currency)}`}
          >
            <span
              style={{
                width: `${(r.corrective / max) * 100}%`,
                background: COST_COLORS.corrective,
              }}
            />
            <span
              style={{
                width: `${(r.preventive / max) * 100}%`,
                background: COST_COLORS.preventive,
              }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">
            {formatMoney(r.total, currency)}
          </span>
        </button>
      ))}
      <div className="mt-1 flex gap-3 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: COST_COLORS.corrective }} />{" "}
          Reactive
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: COST_COLORS.preventive }} />{" "}
          Planned
        </span>
      </div>
    </div>
  );
}
