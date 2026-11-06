"use client";

import * as React from "react";
import { ArrowRight, Cog, PackageCheck, Trash2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Rotables: repairable parts tracked by serial number (gearbox, servo drive, motor, pump). A unit cycles
 * in store → installed on an asset → removed to repair → back in store; it is scrapped when repair no longer pays.
 * Repair count and time in each state are what the reliability engineer watches.
 */
export type RotableStatus = "in_store" | "installed" | "in_repair" | "scrapped";
export type RotableUnit = {
  id: string;
  serial: string;
  itemCode: string;
  itemName: string;
  status: RotableStatus;
  assetTag?: string;
  storeCode?: string | null;
  repairCount: number;
  movedAt: string | Date;
  note?: string;
};
export type RotableEvent = {
  action: string;
  fromStatus: RotableStatus | null;
  toStatus: RotableStatus;
  assetTag?: string;
  at: string | Date;
  byName?: string;
  note?: string;
};

export const ROTABLE_STATUS: Record<
  RotableStatus,
  { label: string; color: string; Icon: typeof Cog }
> = {
  in_store: { label: "In store", color: "var(--sys-green)", Icon: PackageCheck },
  installed: { label: "Installed", color: "var(--sys-indigo)", Icon: Cog },
  in_repair: { label: "In repair", color: "var(--sys-orange)", Icon: Wrench },
  scrapped: { label: "Scrapped", color: "var(--sys-gray)", Icon: Trash2 },
};
export const ROTABLE_CYCLE: RotableStatus[] = ["in_store", "installed", "in_repair"];

/** The next moves a unit may make (install needs an asset). */
export const ROTABLE_MOVES: Record<
  RotableStatus,
  { action: "install" | "remove" | "repaired" | "scrap"; label: string }[]
> = {
  in_store: [
    { action: "install", label: "Install" },
    { action: "scrap", label: "Scrap" },
  ],
  installed: [{ action: "remove", label: "Remove to repair" }],
  in_repair: [
    { action: "repaired", label: "Repaired, to store" },
    { action: "scrap", label: "Scrap" },
  ],
  scrapped: [],
};

const days = (at: string | Date) =>
  Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86_400_000));

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

export function RotableStatusBadge({
  status,
  className,
}: {
  status: RotableStatus;
  className?: string;
}) {
  const m = ROTABLE_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
        className,
      )}
      style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}
    >
      <m.Icon className="size-3.5" />
      {m.label}
    </span>
  );
}

/** The cycle with how many units sit in each state; click a state to filter. */
export function RotableCycle({
  units,
  value,
  onSelect,
  className,
}: {
  units: Pick<RotableUnit, "status">[];
  value?: RotableStatus | null;
  onSelect?: (s: RotableStatus | null) => void;
  className?: string;
}) {
  const count = (s: RotableStatus) => units.filter((u) => u.status === s).length;
  const box = (s: RotableStatus) => {
    const m = ROTABLE_STATUS[s];
    const on = value === s;
    return (
      <button
        type="button"
        onClick={() => onSelect?.(on ? null : s)}
        className="flex min-w-28 flex-1 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-left"
        style={on ? { boxShadow: `0 0 0 2px ${m.color}` } : undefined}
      >
        <span
          className="grid size-8 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}
        >
          <m.Icon className="size-4" />
        </span>
        <span>
          <span className="block text-[20px] leading-none font-semibold tabular-nums">
            {count(s)}
          </span>
          <span className="text-[12px] text-muted-foreground">{m.label}</span>
        </span>
      </button>
    );
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {ROTABLE_CYCLE.map((s, i) => (
        <React.Fragment key={s}>
          {box(s)}
          {i < ROTABLE_CYCLE.length - 1 && (
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </React.Fragment>
      ))}
      <span className="mx-1 h-8 w-px bg-border" />
      {box("scrapped")}
    </div>
  );
}

export function RotableUnitRow({
  unit,
  selected,
  onSelect,
  actions,
}: {
  unit: RotableUnit;
  selected?: boolean;
  onSelect?: (u: RotableUnit) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        selected && "bg-primary/5",
        onSelect && "cursor-pointer hover:bg-subtle",
      )}
      onClick={() => onSelect?.(unit)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12.5px] font-medium">{unit.serial}</span>
          {unit.repairCount > 0 && (
            <span className="text-[11px] text-muted-foreground">{unit.repairCount}× repaired</span>
          )}
        </div>
        <div className="truncate text-[12px] text-muted-foreground">
          {unit.itemName}
          {unit.status === "installed" && unit.assetTag
            ? ` · on ${unit.assetTag}`
            : unit.status === "in_store" && unit.storeCode
              ? ` · ${unit.storeCode}`
              : ""}
          {` · ${days(unit.movedAt)} d`}
        </div>
      </div>
      <RotableStatusBadge status={unit.status} />
      {actions}
    </div>
  );
}

export function RotableHistory({
  events,
  className,
}: {
  events: RotableEvent[];
  className?: string;
}) {
  return (
    <ol className={cn("relative ml-2 border-l pl-4", className)}>
      {events.map((e, i) => {
        const m = ROTABLE_STATUS[e.toStatus];
        return (
          <li key={i} className="relative pb-3 last:pb-0">
            <span
              className="absolute top-1 -left-[21px] size-2.5 rounded-full ring-2 ring-card"
              style={{ background: m.color }}
            />
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="font-medium">{m.label}</span>
              {e.assetTag && (
                <span className="font-mono text-[11.5px] text-muted-foreground">{e.assetTag}</span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {new Date(e.at).toLocaleDateString()}
              </span>
            </div>
            {(e.note || e.byName) && (
              <div className="text-[12px] text-muted-foreground">
                {e.note}
                {e.note && e.byName ? " · " : ""}
                {e.byName}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
