import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight hover/focus tooltip for grid and SVG charts that are not built on Recharts
 * (heatmap, bullet, skill matrix, sankey, X-matrix…). Same dark, theme-inverted look as ChartTooltipPanel.
 *
 *   const tip = useHoverTip()
 *   <div ref={tip.ref} className="relative">
 *     <span onMouseEnter={(e) => tip.show(e, <TipBody … />)} onMouseLeave={tip.hide} />
 *     <HoverTip state={tip.state} />
 *   </div>
 */
export type HoverTipState = {
  x: number;
  y: number;
  below?: boolean;
  content: React.ReactNode;
} | null;

export function useHoverTip<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T>(null);
  const [state, setState] = React.useState<HoverTipState>(null);
  const show = React.useCallback(
    (
      e: React.MouseEvent | React.FocusEvent,
      content: React.ReactNode,
      opts?: { pointer?: boolean },
    ) => {
      const host = ref.current;
      if (!host) return;
      const h = host.getBoundingClientRect();
      let x: number;
      let y: number;
      if (opts?.pointer && "clientX" in e) {
        x = e.clientX - h.left;
        y = e.clientY - h.top - 6;
      } else {
        const t = (e.currentTarget as Element).getBoundingClientRect();
        x = t.left + t.width / 2 - h.left;
        y = t.top - h.top;
      }
      // keep the panel inside the host horizontally
      x = Math.max(80, Math.min(h.width - 80, x));
      setState({ x, y, below: y < 70, content });
    },
    [],
  );
  const hide = React.useCallback(() => setState(null), []);
  return { ref, state, show, hide };
}

export function HoverTip({ state, className }: { state: HoverTipState; className?: string }) {
  if (!state) return null;
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-30 min-w-32 max-w-64 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg",
        state.below ? "translate-y-6" : "-translate-y-full",
        className,
      )}
      style={{ left: state.x, top: state.below ? state.y : state.y - 8 }}
    >
      {state.content}
    </div>
  );
}

/** Standard tooltip body: muted title, optional rows (swatch · label · value), optional footer note. */
export function TipBody({
  title,
  value,
  unit,
  rows,
  note,
  color,
}: {
  title?: React.ReactNode;
  value?: React.ReactNode;
  unit?: React.ReactNode;
  color?: string;
  rows?: { label: React.ReactNode; value: React.ReactNode; color?: string }[];
  note?: React.ReactNode;
}) {
  return (
    <>
      {title != null && <div className="mb-1 text-[11.5px] opacity-65">{title}</div>}
      {value != null && (
        <div className="flex items-center gap-2 text-[14px] font-semibold tabular-nums">
          {color && (
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
          )}
          {value}
          {unit && <span className="-ml-1 text-xs font-normal opacity-65">{unit}</span>}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div
          className={cn(
            "grid gap-1",
            value != null && "mt-1.5 border-t border-background/15 pt-1.5",
          )}
        >
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              {r.color && (
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
              )}
              <span className="opacity-65">{r.label}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {note && <div className="mt-1.5 border-t border-background/15 pt-1.5 opacity-80">{note}</div>}
    </>
  );
}
