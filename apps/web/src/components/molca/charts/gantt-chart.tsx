"use client";

import * as React from "react";
import { CircleCheck, TriangleAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type GanttStatus = "running" | "planned" | "delayed" | "done" | "downtime";

export type GanttRow = { id: string; label: string; sub?: string };

export type GanttItem = {
  id: string;
  row: string;
  /** Hours from the schedule origin (e.g. Monday 00:00) */
  start: number;
  end: number;
  /** Work order number or downtime title */
  label: string;
  /** Product / description, second line */
  detail?: string;
  status: GanttStatus;
  /** 0–1, drawn as a fill on running orders */
  progress?: number;
};

export type GanttZoom = "day" | "week";

export type GanttChartProps = {
  rows: GanttRow[];
  items: GanttItem[];
  zoom?: GanttZoom;
  /** Day index shown in "day" zoom (0 = first day) */
  day?: number;
  /** Number of days in the schedule (week zoom) */
  days?: number;
  /** Day labels, e.g. ["Mon 3", "Tue 4", …] */
  dayLabels?: string[];
  /** Current time in hours from origin — draws the now-line */
  now?: number;
  /** Selected item id (outlined in blue) */
  selected?: string;
  onSelect?: (id: string) => void;
  /** Enables horizontal drag of work orders (snaps to `snap` hours). Downtime blocks stay fixed. */
  onItemMove?: (id: string, start: number) => void;
  snap?: number;
  /** Width of the row label column in px */
  labelWidth?: number;
  rowHeight?: number;
  className?: string;
};

const STATUS: Record<GanttStatus, { label: string; color: string }> = {
  running: { label: "Running", color: "var(--st-run)" },
  planned: { label: "Planned", color: "var(--muted-foreground)" },
  delayed: { label: "Delayed", color: "var(--st-unplanned)" },
  done: { label: "Done", color: "var(--st-off)" },
  downtime: { label: "Planned downtime", color: "var(--st-planned)" },
};

/** Legend entries matching the bar styles. */
export const ganttLegend = (Object.keys(STATUS) as GanttStatus[]).map((s) => ({
  label: STATUS[s].label,
  color: STATUS[s].color,
}));

/** Overlapping intervals on the same row (work orders that collide with each other or with planned downtime). */
export function ganttConflicts(items: GanttItem[]) {
  const out: { row: string; start: number; end: number; ids: [string, string] }[] = [];
  const byRow = new Map<string, GanttItem[]>();
  items.forEach((i) => byRow.set(i.row, [...(byRow.get(i.row) ?? []), i]));
  byRow.forEach((list, row) => {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let a = 0; a < sorted.length; a++)
      for (let b = a + 1; b < sorted.length; b++) {
        const s = Math.max(sorted[a].start, sorted[b].start);
        const e = Math.min(sorted[a].end, sorted[b].end);
        if (e > s + 1e-6) out.push({ row, start: s, end: e, ids: [sorted[a].id, sorted[b].id] });
      }
  });
  return out;
}

export const formatHour = (h: number) => {
  const d = ((h % 24) + 24) % 24;
  const hh = Math.floor(d);
  const mm = Math.round((d - hh) * 60);
  return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
};

function barStyle(status: GanttStatus): React.CSSProperties {
  const c = STATUS[status].color;
  if (status === "downtime")
    return {
      background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 22%, var(--card)) 0 6px, color-mix(in srgb, ${c} 12%, var(--card)) 6px 12px)`,
      borderColor: `color-mix(in srgb, ${c} 55%, transparent)`,
    };
  if (status === "planned") return { background: "var(--card)", borderColor: "var(--input)" };
  if (status === "done") return { background: "var(--muted)", borderColor: "var(--border)" };
  return {
    background: `color-mix(in srgb, ${c} 14%, var(--card))`,
    borderColor: `color-mix(in srgb, ${c} 60%, transparent)`,
  };
}

/**
 * Production schedule Gantt for the Job Schedule module: lines / machines as rows, work orders as bars
 * colored by status, planned downtime as indigo hatched blocks, a now-line, conflict markers and day / week zoom.
 */
export function GanttChart({
  rows,
  items,
  zoom = "week",
  day = 0,
  days = 7,
  dayLabels,
  now,
  selected,
  onSelect,
  onItemMove,
  snap = 0.25,
  labelWidth = 132,
  rowHeight = 52,
  className,
}: GanttChartProps) {
  const from = zoom === "day" ? day * 24 : 0;
  const to = zoom === "day" ? from + 24 : days * 24;
  const span = to - from;
  const pct = (h: number) => ((Math.min(Math.max(h, from), to) - from) / span) * 100;
  const ticks =
    zoom === "day"
      ? Array.from({ length: 13 }, (_, i) => from + i * 2)
      : Array.from({ length: days + 1 }, (_, i) => i * 24);
  const minor =
    zoom === "week"
      ? Array.from({ length: days * 2 }, (_, i) => i * 12 + 12).filter((h) => h % 24 !== 0)
      : [];
  const conflicts = React.useMemo(() => ganttConflicts(items), [items]);

  const track = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<{
    id: string;
    x0: number;
    start0: number;
    delta: number;
  } | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(560);
  React.useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTrackWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent, it: GanttItem) => {
    onSelect?.(it.id);
    if (!onItemMove || it.status === "downtime" || it.status === "done") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: it.id, x0: e.clientX, start0: it.start, delta: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !track.current) return;
    const hPerPx = span / track.current.clientWidth;
    const delta = Math.round(((e.clientX - drag.x0) * hPerPx) / snap) * snap;
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const onPointerUp = () => {
    if (drag && drag.delta !== 0) onItemMove?.(drag.id, drag.start0 + drag.delta);
    setDrag(null);
  };
  const onKeyDown = (e: React.KeyboardEvent, it: GanttItem) => {
    if (!onItemMove || it.status === "downtime" || it.status === "done") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onItemMove(it.id, it.start + (e.key === "ArrowLeft" ? -snap : snap) * (e.shiftKey ? 4 : 1));
    }
  };

  const tickLabel = (h: number) =>
    zoom === "day" ? formatHour(h) : (dayLabels?.[h / 24] ?? `Day ${h / 24 + 1}`);
  const showNow = now != null && now >= from && now <= to;

  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border bg-card", className)}>
      <div className="min-w-[640px]">
        {/* time axis */}
        <div className="flex border-b text-[11.5px] text-muted-foreground">
          <div className="shrink-0 border-r px-3 py-2 font-medium" style={{ width: labelWidth }}>
            {zoom === "day" ? (dayLabels?.[day] ?? `Day ${day + 1}`) : "Line / machine"}
          </div>
          <div className="relative h-8 flex-1">
            {ticks.slice(0, -1).map((h) => (
              <span
                key={h}
                className="absolute top-1/2 -translate-y-1/2 pl-1.5 tabular-nums"
                style={{ left: `${pct(h)}%` }}
              >
                {tickLabel(h)}
              </span>
            ))}
            {showNow && (
              <span
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-highlight px-1.5 py-0.5 text-[10.5px] font-semibold text-highlight-foreground tabular-nums"
                style={{ left: `${pct(now!)}%` }}
              >
                {formatHour(now!)}
              </span>
            )}
          </div>
        </div>

        <div className="flex">
          {/* row labels */}
          <div className="shrink-0 border-r" style={{ width: labelWidth }}>
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-center border-b px-3 last:border-b-0"
                style={{ height: rowHeight }}
              >
                <div className="truncate text-[13px] font-medium">{r.label}</div>
                {r.sub && (
                  <div className="truncate text-[11.5px] text-muted-foreground">{r.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* track */}
          <div
            ref={track}
            className="relative flex-1"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {/* grid */}
            {ticks.slice(1, -1).map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-y-0 border-l"
                style={{ left: `${pct(h)}%` }}
              />
            ))}
            {minor.map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-y-0 border-l border-dashed border-border/60"
                style={{ left: `${pct(h)}%` }}
              />
            ))}

            {rows.map((r) => (
              <div
                key={r.id}
                className="relative border-b last:border-b-0"
                style={{ height: rowHeight }}
              >
                {items
                  .filter((it) => it.row === r.id)
                  .map((it) => {
                    const d = drag?.id === it.id ? drag.delta : 0;
                    const s = it.start + d;
                    const e = it.end + d;
                    if (e <= from || s >= to) return null;
                    const left = pct(s);
                    const width = Math.max(pct(e) - left, 0.6);
                    const st = STATUS[it.status];
                    const draggable =
                      !!onItemMove && it.status !== "downtime" && it.status !== "done";
                    const px = (width / 100) * trackWidth;
                    const narrow = px < 40;
                    const short = px < 110;
                    // in tight bars show only the WO sequence ("00485") and drop the detail line
                    const text =
                      short && it.label.startsWith("WO-") ? it.label.split("-").at(-1) : it.label;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onPointerDown={(ev) => onPointerDown(ev, it)}
                        onKeyDown={(ev) => onKeyDown(ev, it)}
                        aria-label={`${it.label}${it.detail ? `, ${it.detail}` : ""}, ${st.label}, ${tickLabel(Math.floor(s / 24) * 24) ?? ""} ${formatHour(s)}–${formatHour(e)}`}
                        aria-pressed={selected === it.id}
                        title={`${it.label}${it.detail ? ` · ${it.detail}` : ""}\n${st.label} · ${formatHour(s)}–${formatHour(e)}`}
                        className={cn(
                          "absolute inset-y-1.5 flex items-center gap-1.5 overflow-hidden rounded-md border pl-2.5 pr-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                          it.status === "done" && "text-muted-foreground",
                          draggable && "cursor-grab active:cursor-grabbing touch-none",
                          drag?.id === it.id && "z-20 shadow-lg",
                          selected === it.id && "ring-2 ring-highlight",
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, ...barStyle(it.status) }}
                      >
                        <span
                          className="absolute inset-y-0 left-0 w-[3px]"
                          style={{ background: st.color }}
                          aria-hidden
                        />
                        {it.status === "running" && it.progress != null && (
                          <span
                            className="absolute inset-y-0 left-0 opacity-25"
                            style={{ width: `${it.progress * 100}%`, background: st.color }}
                            aria-hidden
                          />
                        )}
                        {!narrow && (
                          <span className="relative min-w-0 flex-1 leading-tight">
                            <span className="flex items-center gap-1 truncate text-[12px] font-semibold">
                              {it.status === "downtime" && (
                                <Wrench className="size-3 shrink-0" style={{ color: st.color }} />
                              )}
                              {it.status === "done" && <CircleCheck className="size-3 shrink-0" />}
                              {it.status === "delayed" && (
                                <TriangleAlert
                                  className="size-3 shrink-0"
                                  style={{ color: st.color }}
                                />
                              )}
                              <span className="truncate">{text}</span>
                            </span>
                            {it.detail && !short && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {it.detail}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}

                {/* conflict markers */}
                {conflicts
                  .filter((c) => c.row === r.id && c.end > from && c.start < to)
                  .map((c) => (
                    <div
                      key={c.ids.join("-")}
                      className="pointer-events-none absolute inset-y-0 z-10 border-x-2 border-danger"
                      style={{
                        left: `${pct(c.start)}%`,
                        width: `${Math.max(pct(c.end) - pct(c.start), 0.4)}%`,
                        background: "color-mix(in srgb, var(--danger) 16%, transparent)",
                      }}
                    >
                      <span
                        className="absolute -top-0.5 left-1/2 grid size-4 -translate-x-1/2 place-items-center rounded-full bg-danger text-background"
                        role="img"
                        aria-label="Schedule conflict"
                      >
                        <TriangleAlert className="size-2.5" />
                      </span>
                    </div>
                  ))}
              </div>
            ))}

            {showNow && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-highlight"
                style={{ left: `${pct(now!)}%` }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
