"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LayerItem = {
  label: string;
  /** Second line: technology, version, owner */
  sub?: string;
  /** focus = what this page is about (blue), new = planned/added (dashed), muted = outside scope */
  tone?: "default" | "focus" | "new" | "muted";
  /** Longer text shown on hover/focus */
  note?: string;
};
export type Layer = { label: string; caption?: string; items: LayerItem[] };

export type LayerDiagramProps = {
  /** Top layer first (e.g. clients → apps → services → data → infrastructure) */
  layers: Layer[];
  /** Optional vertical band on the right that cuts across every layer (security, observability, identity) */
  crossCutting?: { label: string; items: string[] };
  className?: string;
};

const toneCls: Record<NonNullable<LayerItem["tone"]>, string> = {
  default: "border-border bg-card",
  focus: "border-chart-1 bg-chart-1/10",
  new: "border-dashed border-chart-1/70 bg-card",
  muted: "border-border bg-muted/50 text-muted-foreground",
};

/**
 * Layered architecture / technology-stack diagram: one row per layer, boxes wrap inside the row, an optional
 * cross-cutting band on the right. Plain HTML, so it reflows on a phone instead of shrinking text.
 */
export function LayerDiagram({ layers, crossCutting, className }: LayerDiagramProps) {
  const [tip, setTip] = React.useState<string | null>(null);
  return (
    <div
      className={cn("grid min-w-0 gap-2", crossCutting && "md:grid-cols-[1fr_9.5rem]", className)}
    >
      <div className="grid min-w-0 gap-2">
        {layers.map((l, i) => (
          <div
            key={l.label}
            className="grid min-w-0 gap-2 rounded-xl border bg-muted/30 p-2.5 sm:grid-cols-[8.5rem_1fr]"
          >
            <div className="flex flex-col justify-center px-1">
              <div className="text-[12px] font-semibold">{l.label}</div>
              {l.caption && (
                <div className="text-[11px] leading-snug text-muted-foreground">{l.caption}</div>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {l.items.map((it) => (
                <div
                  key={it.label}
                  tabIndex={it.note ? 0 : undefined}
                  title={it.note}
                  onMouseEnter={() => it.note && setTip(`${it.label}: ${it.note}`)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={() => it.note && setTip(`${it.label}: ${it.note}`)}
                  onBlur={() => setTip(null)}
                  className={cn(
                    "min-w-[7.5rem] flex-1 rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    toneCls[it.tone ?? "default"],
                  )}
                >
                  <div className="text-[12.5px] font-medium leading-tight">{it.label}</div>
                  {it.sub && (
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {it.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {i < layers.length - 1 && <span className="sr-only">↓</span>}
          </div>
        ))}
      </div>
      {crossCutting && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed p-2.5">
          <div className="text-[12px] font-semibold">{crossCutting.label}</div>
          {crossCutting.items.map((c) => (
            <div key={c} className="rounded-md bg-muted/60 px-2 py-1 text-[11.5px]">
              {c}
            </div>
          ))}
        </div>
      )}
      {tip && (
        <div className="text-[12px] text-muted-foreground md:col-span-2" role="status">
          {tip}
        </div>
      )}
    </div>
  );
}
