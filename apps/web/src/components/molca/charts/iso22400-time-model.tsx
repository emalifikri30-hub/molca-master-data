"use client";

import { HoverTip, TipBody, useHoverTip } from "./hover-tip";
import { cn } from "@/lib/utils";
import { inkOn } from "@/lib/ink";

/**
 * ISO 22400-2 time model for a work unit.
 *
 *   POT  = PBT + PDOT                    planned operation time
 *   PBT  = AUBT + AUDT                   planned busy time
 *   AUBT = AUPT + ADET                   actual unit busy time
 *   AUPT = APT + AUST                    actual unit processing time
 *
 * Leaf times (the ones you record) are APT, AUST, ADET, AUDT and PDOT. Colors follow the Molca status tokens:
 * APT = st-run, AUST = st-planned, ADET = st-small, AUDT = st-unplanned, PDOT = st-planned (hatched).
 */
export type TimeModelTimes = {
  /** Actual production time — value-adding run time */
  apt: number;
  /** Actual unit setup time — changeover / setup */
  aust: number;
  /** Actual unit delay time — minor stoppages, waiting, slow running interruptions */
  adet: number;
  /** Actual unit down time — breakdowns / malfunctions */
  audt: number;
  /** Planned down time — breaks, planned maintenance, no order scheduled */
  pdot: number;
};

export type TimeModelCounts = {
  /** Produced quantity */
  pq: number;
  /** Good quantity */
  gq: number;
  /** Planned runtime per item (same time unit as times) */
  pri: number;
};

export type TimeElement = {
  key: string;
  abbr: string;
  name: string;
  color?: string;
  hatch?: boolean;
  value: number;
};

export const TIME_ELEMENTS = {
  apt: { abbr: "APT", name: "Actual production time", color: "var(--st-run)" },
  aust: { abbr: "AUST", name: "Actual unit setup time", color: "var(--st-planned)" },
  adet: { abbr: "ADET", name: "Actual unit delay time", color: "var(--st-small)" },
  audt: { abbr: "AUDT", name: "Actual unit down time", color: "var(--st-unplanned)" },
  pdot: { abbr: "PDOT", name: "Planned down time", color: "var(--st-planned)", hatch: true },
} as const;

/** Derived times + the ISO 22400-2 KPIs that depend only on the time model and quantities. Ratios are 0–1. */
export function iso22400Kpis(t: TimeModelTimes, c?: TimeModelCounts) {
  const aupt = t.apt + t.aust;
  const aubt = aupt + t.adet;
  const pbt = aubt + t.audt;
  const pot = pbt + t.pdot;
  const availability = pbt ? t.apt / pbt : 0;
  const effectiveness = c && t.apt ? (c.pri * c.pq) / t.apt : undefined;
  const qualityRatio = c && c.pq ? c.gq / c.pq : undefined;
  const oee =
    effectiveness != null && qualityRatio != null
      ? availability * effectiveness * qualityRatio
      : undefined;
  return {
    aupt,
    aubt,
    pbt,
    pot,
    availability,
    effectiveness,
    qualityRatio,
    oee,
    technicalEfficiency: t.apt + t.adet ? t.apt / (t.apt + t.adet) : 0,
    setupRate: aupt ? t.aust / aupt : 0,
    utilizationEfficiency: aubt ? t.apt / aubt : 0,
  };
}

const hatchBg = (color: string) =>
  `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 55%, transparent) 0 4px, color-mix(in srgb, ${color} 22%, transparent) 4px 8px)`;

function fmtMin(v: number, unit: string) {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
}

/* ------------------------------------------------------------------ */

export type TimeModelBarProps = {
  times: TimeModelTimes;
  unit?: string;
  height?: number;
  className?: string;
};

/** Flat stacked bar of the five leaf times across planned operation time (POT). */
export function TimeModelBar({ times, unit = "min", height = 28, className }: TimeModelBarProps) {
  const tip = useHoverTip();
  const k = iso22400Kpis(times);
  const order = ["apt", "aust", "adet", "audt", "pdot"] as const;
  return (
    <div ref={tip.ref} className={cn("relative w-full", className)}>
      <div
        className="flex w-full gap-0.5 overflow-hidden rounded-lg"
        style={{ height }}
        role="img"
        aria-label={`Planned operation time ${fmtMin(k.pot, unit)}: ${order.map((o) => `${TIME_ELEMENTS[o].abbr} ${fmtMin(times[o], unit)}`).join(", ")}`}
      >
        {order.map((o) => {
          const e = TIME_ELEMENTS[o];
          const pct = (times[o] / k.pot) * 100;
          return (
            <div
              key={o}
              className={cn(
                "flex h-full items-center justify-center overflow-hidden text-[11px] font-semibold",
                "hatch" in e ? "" : inkOn(e.color),
              )}
              style={{
                width: `${pct}%`,
                background: "hatch" in e ? hatchBg(e.color) : e.color,
                color: "hatch" in e ? "var(--foreground)" : undefined,
              }}
              onMouseEnter={(ev) =>
                tip.show(
                  ev,
                  <TipBody
                    title={e.name}
                    value={fmtMin(times[o], unit)}
                    color={e.color}
                    note={`${pct.toFixed(1)}% of POT`}
                  />,
                )
              }
              onMouseLeave={tip.hide}
            >
              {pct > 7 && e.abbr}
            </div>
          );
        })}
      </div>
      <HoverTip state={tip.state} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Row = {
  abbr: string;
  name: string;
  total: number;
  parts: {
    key: string;
    abbr: string;
    name: string;
    value: number;
    color?: string;
    hatch?: boolean;
  }[];
};

export type TimeModelTreeProps = {
  times: TimeModelTimes;
  unit?: string;
  /** Highlight one element by abbreviation (e.g. "APT") with a ring */
  highlight?: string;
  className?: string;
};

/**
 * ISO 22400-2 time model as aligned, nested bars: each row splits the container time above it.
 * Containers are neutral; recorded leaf times carry status colors.
 */
export function TimeModelTree({ times, unit = "min", highlight, className }: TimeModelTreeProps) {
  const tip = useHoverTip();
  const k = iso22400Kpis(times);
  const E = TIME_ELEMENTS;
  const rows: Row[] = [
    {
      abbr: "POT",
      name: "Planned operation time",
      total: k.pot,
      parts: [
        { key: "pbt", abbr: "PBT", name: "Planned busy time", value: k.pbt },
        { key: "pdot", ...E.pdot, value: times.pdot },
      ],
    },
    {
      abbr: "PBT",
      name: "Planned busy time",
      total: k.pbt,
      parts: [
        { key: "aubt", abbr: "AUBT", name: "Actual unit busy time", value: k.aubt },
        { key: "audt", ...E.audt, value: times.audt },
      ],
    },
    {
      abbr: "AUBT",
      name: "Actual unit busy time",
      total: k.aubt,
      parts: [
        { key: "aupt", abbr: "AUPT", name: "Actual unit processing time", value: k.aupt },
        { key: "adet", ...E.adet, value: times.adet },
      ],
    },
    {
      abbr: "AUPT",
      name: "Actual unit processing time",
      total: k.aupt,
      parts: [
        { key: "apt", ...E.apt, value: times.apt },
        { key: "aust", ...E.aust, value: times.aust },
      ],
    },
  ];
  const pct = (v: number) => (v / k.pot) * 100;
  return (
    <div ref={tip.ref} className={cn("relative grid gap-2", className)}>
      {rows.map((r) => (
        <div key={r.abbr} className="grid grid-cols-[52px_1fr] items-center gap-3">
          <span className="font-mono text-[12px] font-medium text-muted-foreground" title={r.name}>
            {r.abbr}
          </span>
          <div className="flex h-10 gap-0.5">
            {r.parts.map((p) => {
              const leaf = !!p.color;
              const w = pct(p.value);
              return (
                <div
                  key={p.key}
                  tabIndex={0}
                  className={cn(
                    "flex h-full min-w-0 flex-col justify-center overflow-hidden rounded-md px-2 text-[11.5px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    leaf
                      ? p.hatch
                        ? "text-foreground"
                        : inkOn(p.color!)
                      : "border border-dashed border-foreground/25 bg-muted text-foreground",
                    highlight === p.abbr && "ring-2 ring-highlight ring-offset-2 ring-offset-card",
                  )}
                  style={{
                    width: `${w}%`,
                    background: leaf ? (p.hatch ? hatchBg(p.color!) : p.color) : undefined,
                  }}
                  onMouseEnter={(ev) =>
                    tip.show(
                      ev,
                      <TipBody
                        title={`${p.abbr} · ${p.name}`}
                        value={fmtMin(p.value, unit)}
                        color={p.color}
                        note={`${((p.value / r.total) * 100).toFixed(1)}% of ${r.abbr}`}
                      />,
                    )
                  }
                  onFocus={(ev) =>
                    tip.show(
                      ev,
                      <TipBody
                        title={`${p.abbr} · ${p.name}`}
                        value={fmtMin(p.value, unit)}
                        color={p.color}
                        note={`${((p.value / r.total) * 100).toFixed(1)}% of ${r.abbr}`}
                      />,
                    )
                  }
                  onMouseLeave={tip.hide}
                  onBlur={tip.hide}
                  aria-label={`${p.abbr}, ${p.name}: ${fmtMin(p.value, unit)}`}
                >
                  {w > 6 && <span className="font-semibold">{p.abbr}</span>}
                  {w > 11 && (
                    <span
                      className={cn(
                        "tabular-nums",
                        leaf && !p.hatch ? "opacity-85" : "text-muted-foreground",
                      )}
                    >
                      {fmtMin(p.value, unit)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <HoverTip state={tip.state} />
    </div>
  );
}

/** Legend for the five recorded time elements. */
export function TimeModelLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {(Object.keys(TIME_ELEMENTS) as (keyof typeof TIME_ELEMENTS)[]).map((key) => {
        const e = TIME_ELEMENTS[key];
        return (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: "hatch" in e ? hatchBg(e.color) : e.color }}
            />
            <b className="font-mono text-[11.5px] font-medium text-foreground">{e.abbr}</b> {e.name}
          </span>
        );
      })}
    </div>
  );
}
