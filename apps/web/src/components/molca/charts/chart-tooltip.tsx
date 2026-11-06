"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TooltipRow = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
  type?: string;
  payload?: Record<string, unknown> & { fill?: string };
};

export type ChartTooltipPanelProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipRow>;
  label?: unknown;
  /** Unit appended to every value, e.g. "pcs", "%", "°C" */
  unit?: string;
  labelFormatter?: (label: unknown, payload: ReadonlyArray<TooltipRow>) => React.ReactNode;
  valueFormatter?: (value: number, row: TooltipRow) => React.ReactNode;
  /** Hide the colored square (single-series charts) */
  hideIndicator?: boolean;
  /** Extra line under the rows (e.g. delta vs last period) */
  footer?: (payload: ReadonlyArray<TooltipRow>) => React.ReactNode;
  className?: string;
};

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(v ?? "");

/**
 * Dark, neutral tooltip used by every Molca chart. Pass as `<ChartTooltip content={<ChartTooltipPanel unit="pcs" />} />`.
 * It inverts with the theme (dark in light mode, light in dark mode).
 */
export function ChartTooltipPanel({
  active,
  payload,
  label,
  unit,
  labelFormatter,
  valueFormatter,
  hideIndicator,
  footer,
  className,
}: ChartTooltipPanelProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((r) => r.type !== "none" && r.value != null);
  return (
    <div
      className={cn(
        "min-w-32 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg",
        className,
      )}
    >
      {label != null && label !== "" && (
        <div className="mb-1 text-[11.5px] opacity-65">
          {labelFormatter ? labelFormatter(label, payload) : String(label)}
        </div>
      )}
      <div className="grid gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {!hideIndicator && (
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{
                  background: r.payload?.fill && rows.length === 1 ? r.payload.fill : r.color,
                }}
              />
            )}
            {rows.length > 1 && <span className="opacity-65">{r.name}</span>}
            <span
              className={cn(
                "font-semibold tabular-nums",
                rows.length > 1 ? "ml-auto pl-3" : "text-[14px]",
              )}
            >
              {valueFormatter && typeof r.value === "number"
                ? valueFormatter(r.value, r)
                : fmt(r.value)}
              {unit && <span className="ml-0.5 font-normal opacity-65">{unit}</span>}
            </span>
          </div>
        ))}
      </div>
      {footer && (
        <div className="mt-1.5 border-t border-background/15 pt-1.5">{footer(payload)}</div>
      )}
    </div>
  );
}
