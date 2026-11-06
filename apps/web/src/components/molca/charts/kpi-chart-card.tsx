import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small delta pill. Green when the change is good, red when it is bad (set `goodWhen="down"` for downtime, scrap, energy…). */
export function DeltaBadge({
  value,
  suffix = "%",
  goodWhen = "up",
  className,
}: {
  value: number;
  suffix?: string;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  const up = value >= 0;
  const good = goodWhen === "up" ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-[12px] font-medium tabular-nums",
        good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}
      {suffix}
    </span>
  );
}

/** Big number with a muted unit, tabular figures. */
export function KpiValue({
  value,
  unit,
  size = "lg",
  className,
}: {
  value: React.ReactNode;
  unit?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-semibold tracking-[-0.03em] tabular-nums",
        { sm: "text-xl", md: "text-2xl", lg: "text-[32px] leading-none" }[size],
        className,
      )}
    >
      {value}
      {unit && (
        <span
          className={cn(
            "font-medium tracking-normal text-muted-foreground",
            size === "lg" ? "text-base" : "text-sm",
          )}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

/** Legend with small rounded squares. Optional values render as a right-aligned list. */
export function ChartLegendList({
  items,
  layout = "inline",
  className,
}: {
  items: { label: string; color: string; value?: React.ReactNode; dashed?: boolean }[];
  layout?: "inline" | "list";
  className?: string;
}) {
  if (layout === "list")
    return (
      <ul className={cn("grid gap-1.5", className)}>
        {items.map((i) => (
          <li
            key={i.label}
            className="flex items-center justify-between gap-4 rounded-lg bg-subtle px-3 py-2 text-[13px]"
          >
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
              {i.label}
            </span>
            {i.value != null && <span className="font-medium tabular-nums">{i.value}</span>}
          </li>
        ))}
      </ul>
    );
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="w-3 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
          {i.value != null && (
            <span className="font-medium text-foreground tabular-nums">{i.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Compact segmented control for chart periods (Day / Week / Month). */
export function ChartPeriodSwitch<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("inline-flex gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            o === value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export type KpiChartCardProps = {
  title: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  /** KPI label shown above the big number */
  label?: React.ReactNode;
  value?: React.ReactNode;
  unit?: React.ReactNode;
  /** Delta in percent (or `deltaSuffix` units) vs the comparison period */
  delta?: number;
  deltaSuffix?: string;
  deltaLabel?: React.ReactNode;
  goodWhen?: "up" | "down";
  /** Top-right slot: period switch, menu, "View data" link */
  action?: React.ReactNode;
  /** Rendered below the KPI, above the chart (e.g. legend) */
  legend?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** Mebius-style chart card: title row, KPI header (label, big number + unit, delta badge), chart, optional legend/footer. */
export function KpiChartCard({
  title,
  icon,
  description,
  label,
  value,
  unit,
  delta,
  deltaSuffix = "%",
  deltaLabel,
  goodWhen,
  action,
  legend,
  footer,
  children,
  className,
}: KpiChartCardProps) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border bg-card p-5 text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            {icon && (
              <span className="grid size-7 place-items-center rounded-lg border bg-subtle text-muted-foreground [&_svg]:size-4">
                {icon}
              </span>
            )}
            {title}
          </div>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {value != null && (
        <div className="mt-4">
          {label && <div className="mb-1.5 text-[13px] text-muted-foreground">{label}</div>}
          <div className="flex flex-wrap items-center gap-2.5">
            <KpiValue value={value} unit={unit} />
            {delta != null && <DeltaBadge value={delta} suffix={deltaSuffix} goodWhen={goodWhen} />}
            {deltaLabel && (
              <span className="text-[12.5px] text-muted-foreground">{deltaLabel}</span>
            )}
          </div>
        </div>
      )}
      {legend && <div className="mt-4">{legend}</div>}
      <div className="mt-4">{children}</div>
      {footer && (
        <div className="mt-4 border-t pt-3 text-[12.5px] text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}
