"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Weekly maintenance schedule against crew capacity (MaintainX "Workload", SAP PM capacity leveling):
 * rows are technicians, columns working days, each cell the hours booked over the hours available.
 * Work is dragged from the unscheduled backlog (or another cell) onto a person and a day.
 */
export type CapacityJob = {
  id: string;
  number: string;
  title: string;
  asset?: string;
  /** 1 = emergency … 4 = low */
  priority: 1 | 2 | 3 | 4;
  type?: "corrective" | "emergency" | "preventive" | "inspection" | "improvement";
  hours: number;
  /** person ids */
  assignees: string[];
  /** YYYY-MM-DD or null when not on the calendar */
  date: string | null;
  done?: boolean;
};
export type CapacityPerson = {
  id: string;
  name: string;
  craft?: string;
  shift?: string;
  hoursPerDay: number;
};
export type CapacityDay = { date: string; label: string; sub?: string; today?: boolean };

export type LoadLevel = "free" | "ok" | "full" | "over";
export const LOAD_META: Record<LoadLevel, { label: string; color: string }> = {
  free: { label: "Free", color: "var(--muted-foreground)" },
  ok: { label: "Loaded", color: "var(--sys-green)" },
  full: { label: "Full", color: "var(--sys-orange)" },
  over: { label: "Overbooked", color: "var(--sys-red)" },
};
export function loadLevel(load: number, capacity: number): LoadLevel {
  if (load <= 0) return "free";
  if (capacity <= 0 || load > capacity + 0.01) return "over";
  return load / capacity >= 0.85 ? "full" : "ok";
}

const PRIORITY_COLOR: Record<number, string> = {
  1: "var(--sys-red)",
  2: "var(--sys-orange)",
  3: "var(--sys-indigo)",
  4: "var(--muted-foreground)",
};

/** Hours of a job booked to one person: the estimate split over its assignees. */
export const shareOf = (job: CapacityJob) => job.hours / Math.max(1, job.assignees.length);

/* ------------------------------------------------------------------ */
/* Atoms                                                               */
/* ------------------------------------------------------------------ */

export function LoadBar({
  load,
  capacity,
  className,
}: {
  load: number;
  capacity: number;
  className?: string;
}) {
  const level = loadLevel(load, capacity);
  const pct = capacity > 0 ? Math.min(100, (load / capacity) * 100) : load > 0 ? 100 : 0;
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={`${load.toFixed(1)} / ${capacity} h`}
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: LOAD_META[level].color }}
        />
      </div>
      <span
        className="shrink-0 text-[11px] tabular-nums"
        style={{ color: level === "over" ? LOAD_META.over.color : undefined }}
      >
        {load.toFixed(1)}/{capacity}
      </span>
    </div>
  );
}

export function CapacityJobChip({
  job,
  draggable,
  onOpen,
  compact,
  className,
}: {
  job: CapacityJob;
  draggable?: boolean;
  onOpen?: (job: CapacityJob) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-capacity-job", job.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen?.(job)}
      title={`${job.number} · ${job.title}${job.asset ? ` · ${job.asset}` : ""} · ${job.hours} h`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md border bg-card px-1.5 py-1 text-left text-[11.5px] shadow-xs hover:bg-subtle",
        draggable && "cursor-grab active:cursor-grabbing",
        job.done && "opacity-55",
        className,
      )}
    >
      <span
        className="h-3.5 w-1 shrink-0 rounded-full"
        style={{ background: PRIORITY_COLOR[job.priority] }}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {job.asset ?? job.number}
        </span>
        {!compact && <span> {job.title}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {shareOf(job).toFixed(1)}h
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export type CapacityBoardProps = {
  people: CapacityPerson[];
  days: CapacityDay[];
  jobs: CapacityJob[];
  /** drop a job on a person and a day (null person = keep its assignees, only move the date) */
  onSchedule?: (jobId: string, personId: string | null, date: string) => void;
  /** drop a job back onto the backlog */
  onUnschedule?: (jobId: string) => void;
  onOpen?: (job: CapacityJob) => void;
  /** rows grouped by craft */
  groupByCraft?: boolean;
  /** jobs shown per cell before "+n" */
  maxPerCell?: number;
  className?: string;
};

export function CapacityBoard({
  people,
  days,
  jobs,
  onSchedule,
  onUnschedule,
  onOpen,
  groupByCraft = true,
  maxPerCell = 3,
  className,
}: CapacityBoardProps) {
  const [over, setOver] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const editable = !!onSchedule;
  const cell = (personId: string, date: string) =>
    jobs.filter((j) => j.date === date && j.assignees.includes(personId));
  const load = (personId: string, date: string) =>
    cell(personId, date).reduce((s, j) => s + shareOf(j), 0);
  const backlog = jobs.filter((j) => !j.date);
  const crafts = groupByCraft ? [...new Set(people.map((p) => p.craft ?? ""))] : [""];
  const drop = (e: React.DragEvent, personId: string | null, date: string | null) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/x-capacity-job");
    if (!id) return;
    if (date) onSchedule?.(id, personId, date);
    else onUnschedule?.(id);
  };
  const target = (key: string, personId: string | null, date: string | null) =>
    editable
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setOver(key);
          },
          onDragLeave: () => setOver((o) => (o === key ? null : o)),
          onDrop: (e: React.DragEvent) => drop(e, personId, date),
        }
      : {};
  const cols = `minmax(9.5rem, 12rem) repeat(${days.length}, minmax(8.5rem, 1fr))`;

  return (
    <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]", className)}>
      <div className="min-w-0 overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-max" style={{ gridTemplateColumns: cols }}>
          <div className="sticky left-0 z-10 border-b bg-subtle px-3 py-2 text-[12px] font-medium text-muted-foreground">
            Crew
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              className={cn(
                "border-b border-l px-2 py-2 text-[12px]",
                d.today ? "bg-primary/5" : "bg-subtle",
              )}
            >
              <div className={cn("font-medium", d.today && "text-primary")}>{d.label}</div>
              {d.sub && <div className="text-[11px] text-muted-foreground">{d.sub}</div>}
            </div>
          ))}
          {crafts.map((craft) => (
            <React.Fragment key={craft || "all"}>
              {groupByCraft && craft && (
                <div className="col-span-full border-b bg-muted/40 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {craft}
                </div>
              )}
              {people
                .filter((p) => !groupByCraft || (p.craft ?? "") === craft)
                .map((p) => {
                  const week = days.reduce((s, d) => s + load(p.id, d.date), 0);
                  return (
                    <React.Fragment key={p.id}>
                      <div className="sticky left-0 z-10 border-b bg-card px-3 py-2">
                        <div className="truncate text-[13px] font-medium">{p.name}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {p.shift && <span>{p.shift}</span>}
                          <LoadBar
                            load={week}
                            capacity={p.hoursPerDay * days.length}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      {days.map((d) => {
                        const key = `${p.id}|${d.date}`;
                        const list = cell(p.id, d.date);
                        const open = expanded === key;
                        const shown = open ? list : list.slice(0, maxPerCell);
                        return (
                          <div
                            key={key}
                            {...target(key, p.id, d.date)}
                            className={cn(
                              "flex min-h-[5.25rem] flex-col gap-1 border-b border-l p-1.5",
                              d.today && "bg-primary/[0.03]",
                              over === key && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
                            )}
                          >
                            <LoadBar load={load(p.id, d.date)} capacity={p.hoursPerDay} />
                            {shown.map((j) => (
                              <CapacityJobChip
                                key={j.id}
                                job={j}
                                draggable={editable && !j.done}
                                onOpen={onOpen}
                                compact
                              />
                            ))}
                            {list.length > maxPerCell && (
                              <button
                                type="button"
                                className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => setExpanded(open ? null : key)}
                              >
                                {open ? "Less" : `+${list.length - maxPerCell} more`}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div
        {...target("backlog", null, null)}
        className={cn(
          "flex max-h-[36rem] min-h-40 flex-col rounded-xl border bg-card",
          over === "backlog" && "ring-2 ring-primary/40",
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[13px] font-medium">Unscheduled</span>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {backlog.length} · {backlog.reduce((s, j) => s + j.hours, 0).toFixed(1)} h
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {backlog.length === 0 && (
            <div className="p-3 text-center text-[12px] text-muted-foreground">
              Everything is on the calendar
            </div>
          )}
          {backlog.map((j) => (
            <CapacityJobChip key={j.id} job={j} draggable={editable} onOpen={onOpen} />
          ))}
        </div>
        {editable && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            Drag a job onto a person and a day
          </div>
        )}
      </div>
    </div>
  );
}

export function CapacityLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground",
        className,
      )}
    >
      {(Object.keys(LOAD_META) as LoadLevel[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: LOAD_META[k].color }} />
          {LOAD_META[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-1 rounded-full" style={{ background: PRIORITY_COLOR[1] }} />
        Priority
      </span>
    </div>
  );
}
