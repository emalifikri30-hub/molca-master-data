"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { inkOn } from "@/lib/ink";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";

export type SqdcpLetterKey = "S" | "Q" | "D" | "C" | "P";
export type SqdcpShape = "cross" | SqdcpLetterKey | "grid";
/** good = green, warn = amber, bad = red, none = no production / not tracked (grey) */
export type SqdcpDayStatus = "good" | "warn" | "bad" | "none";
export type SqdcpDay = { status: SqdcpDayStatus; note?: string };

/**
 * 7 × 7 pixel glyphs, each made of exactly 31 day cells. Day 1…n fills the "#" cells in reading order,
 * so every letter shares the same footprint and lines up with the others. In shorter months the last cells are simply not drawn.
 * "cross" is the traditional safety cross (33 cells, the two last never used).
 */
const GLYPHS: Record<Exclude<SqdcpShape, "grid">, string[]> = {
  S: [".######", "##.....", "######.", ".######", ".....##", "#....##", "######."],
  Q: [".#####.", "##...##", "##...##", "##...##", "##...##", "##..###", ".###.##"],
  D: ["######.", "##...##", "##...##", "##...##", "##...##", "##..##.", "#####.."],
  C: [".######", "###..##", "###....", "###....", "###....", "###..##", ".######"],
  P: ["######.", "##...##", "##...##", "#######", "######.", "##.....", "##....."],
  cross: ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
};

export const SQDCP_STATUS_COLOR: Record<SqdcpDayStatus, string> = {
  good: "var(--st-run)",
  warn: "var(--st-small)",
  bad: "var(--st-unplanned)",
  none: "var(--chart-base)",
};

/** Default meaning of each color per letter (shown in tooltips and the legend). */
export const SQDCP_MEANING: Record<
  SqdcpLetterKey,
  Record<Exclude<SqdcpDayStatus, "none">, string> & { title: string }
> = {
  S: {
    title: "Safety",
    good: "No incident",
    warn: "Near miss or first aid",
    bad: "Recordable injury",
  },
  Q: {
    title: "Quality",
    good: "FPY ≥ 98%, no complaint",
    warn: "FPY 96 – 98%",
    bad: "FPY < 96% or customer complaint",
  },
  D: {
    title: "Delivery",
    good: "All orders on time",
    warn: "Order late < 24 h",
    bad: "Order missed",
  },
  C: {
    title: "Cost",
    good: "Within daily budget",
    warn: "Overtime or scrap above plan",
    bad: "Cost overrun > 5%",
  },
  P: {
    title: "People",
    good: "Fully staffed, plan on track",
    warn: "Absenteeism > 3%",
    bad: "Line understaffed",
  },
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthInfo(month: string) {
  const y = +month.slice(0, 4),
    m = +month.slice(5, 7) - 1;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return { y, m, days, first };
}

export type SqdcpLetterProps = {
  shape: SqdcpShape;
  /** "YYYY-MM" */
  month: string;
  /** index 0 = day 1. Missing days count as "none". */
  days: SqdcpDay[];
  /** Day of month ringed in blue; later days render as empty, upcoming cells */
  today?: number;
  /** Letter used for tooltip meanings */
  letter?: SqdcpLetterKey;
  className?: string;
};

/** The month as a letter (or safety cross, or plain calendar grid) with one colored cell per day. */
export function SqdcpLetter({ shape, month, days, today, letter, className }: SqdcpLetterProps) {
  const tip = useHoverTip();
  const { m, days: n, first } = monthInfo(month);
  type Cell = { day: number | null; key: string; col?: number; row?: number };
  const cells: Cell[] = [];
  if (shape === "grid") {
    // Mon-first calendar
    const offset = (first + 6) % 7;
    for (let i = 0; i < offset; i++) cells.push({ day: null, key: `o${i}` });
    for (let d = 1; d <= n; d++) cells.push({ day: d, key: `d${d}` });
  } else {
    let d = 1;
    GLYPHS[shape].forEach((row, r) =>
      row.split("").forEach((ch, c) => {
        if (ch === "#")
          (cells.push({ day: d <= n ? d : null, key: `${r}-${c}`, col: c + 1, row: r + 1 }), d++);
        else cells.push({ day: null, key: `${r}-${c}`, col: c + 1, row: r + 1 });
      }),
    );
  }
  const meaning = letter ? SQDCP_MEANING[letter] : undefined;

  return (
    <div ref={tip.ref} className={cn("relative", className)}>
      {shape === "grid" && (
        <div className="mb-1 grid grid-cols-7 gap-[3px] text-center text-[10.5px] text-muted-foreground">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((c) => {
          if (c.day === null)
            return (
              <span
                key={c.key}
                aria-hidden
                className="aspect-square"
                style={{ gridColumn: c.col, gridRow: c.row }}
              />
            );
          const day = c.day;
          const future = today != null && day > today;
          const st = days[day - 1]?.status ?? "none";
          const wd = DOW[(first + day - 1) % 7];
          const label = `${wd} ${day} ${MONTHS[m]}`;
          const text = future
            ? "Upcoming"
            : (days[day - 1]?.note ?? (st === "none" ? "No production" : meaning?.[st]));
          return (
            <span
              key={c.key}
              tabIndex={-1}
              aria-label={`${label}: ${text ?? st}`}
              onMouseEnter={(e) =>
                tip.show(
                  e,
                  <TipBody
                    title={label}
                    value={
                      future
                        ? undefined
                        : st === "none"
                          ? "—"
                          : { good: "Green", warn: "Amber", bad: "Red" }[st]
                    }
                    color={future ? undefined : SQDCP_STATUS_COLOR[st]}
                    note={text}
                  />,
                )
              }
              onMouseLeave={tip.hide}
              className={cn(
                "grid aspect-square place-items-center rounded-[4px] text-[10.5px] font-semibold tabular-nums transition-[filter] hover:brightness-90",
                future
                  ? "border border-dashed border-muted-foreground/35 text-muted-foreground"
                  : st === "none"
                    ? "text-muted-foreground"
                    : inkOn(SQDCP_STATUS_COLOR[st]),
                today === day && "ring-2 ring-highlight ring-offset-2 ring-offset-card",
              )}
              style={{
                gridColumn: c.col,
                gridRow: c.row,
                background: future ? undefined : SQDCP_STATUS_COLOR[st],
              }}
            >
              {day}
            </span>
          );
        })}
      </div>
      <HoverTip state={tip.state} />
    </div>
  );
}

export type SqdcpTileData = {
  letter: SqdcpLetterKey;
  /** Defaults to the letter glyph (S, Q, D, C, P). "cross" = traditional safety cross, "grid" = calendar. */
  shape?: SqdcpShape;
  days: SqdcpDay[];
  kpi: {
    label: string;
    value: React.ReactNode;
    unit?: string;
    target?: React.ReactNode;
    status?: Exclude<SqdcpDayStatus, "none">;
  };
  issue?: { text: string; owner?: string; due?: string };
};

const TONE = {
  good: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
};

/** One SQDCP letter as a card: header with counts, the letter calendar, KPI and top issue. */
export function SqdcpTile({
  data,
  month,
  today,
  className,
}: {
  data: SqdcpTileData;
  month: string;
  today?: number;
  className?: string;
}) {
  const meaning = SQDCP_MEANING[data.letter];
  const upto = data.days.slice(0, today ?? data.days.length);
  const count = (s: SqdcpDayStatus) => upto.filter((d) => d.status === s).length;
  const shape = data.shape ?? data.letter;
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-4 text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-foreground text-[15px] font-bold text-background">
          {data.letter}
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">{meaning.title}</div>
          <div className="text-[11.5px] text-muted-foreground tabular-nums">
            {count("good")} green · {count("warn")} amber · {count("bad")} red
          </div>
        </div>
      </div>
      <SqdcpLetter
        shape={shape}
        month={month}
        days={data.days}
        today={today}
        letter={data.letter}
        className="mx-auto mt-4 w-full max-w-[220px]"
      />
      <div className="mt-4 flex items-end justify-between gap-2 border-t pt-3">
        <div>
          <div className="text-[12px] text-muted-foreground">{data.kpi.label}</div>
          <div className="flex items-baseline gap-1 text-[20px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
            {data.kpi.value}
            {data.kpi.unit && (
              <span className="text-[12px] font-medium tracking-normal text-muted-foreground">
                {data.kpi.unit}
              </span>
            )}
          </div>
        </div>
        {data.kpi.target != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11.5px] font-medium tabular-nums",
              data.kpi.status ? TONE[data.kpi.status] : "bg-muted text-muted-foreground",
            )}
          >
            Target {data.kpi.target}
          </span>
        )}
      </div>
      {data.issue && (
        <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-[12px]">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Top issue
          </div>
          <div className="mt-0.5 leading-snug">{data.issue.text}</div>
          {(data.issue.owner || data.issue.due) && (
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              {data.issue.owner}
              {data.issue.owner && data.issue.due && " · "}
              {data.issue.due && `due ${data.issue.due}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Legend: green / amber / red / no production / today. */
export function SqdcpLegend({ className }: { className?: string }) {
  const items = [
    { label: "On target", c: SQDCP_STATUS_COLOR.good },
    { label: "Warning", c: SQDCP_STATUS_COLOR.warn },
    { label: "Off target", c: SQDCP_STATUS_COLOR.bad },
    { label: "No production", c: SQDCP_STATUS_COLOR.none },
  ];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.c }} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] ring-2 ring-highlight ring-offset-1 ring-offset-card" />
        Today
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] border border-dashed border-muted-foreground/50" />
        Upcoming
      </span>
    </div>
  );
}

/**
 * The full tier board: five letter tiles side by side (wrapping to 2–3 per row on narrow screens).
 * `aside` adds one more cell after the tiles (e.g. the meeting's action list) so a 3 + 2 wrap has no empty slot.
 */
export function SqdcpBoard({
  tiles,
  month,
  today,
  aside,
  className,
}: {
  tiles: SqdcpTileData[];
  month: string;
  today?: number;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]",
        className,
      )}
    >
      {tiles.map((t) => (
        <SqdcpTile key={t.letter} data={t} month={month} today={today} />
      ))}
      {aside}
    </div>
  );
}

/** Build a day list from a compact string: g = good, w = warn, b = bad, n = none. */
export function sqdcpDays(code: string, notes: Record<number, string> = {}): SqdcpDay[] {
  const map: Record<string, SqdcpDayStatus> = { g: "good", w: "warn", b: "bad", n: "none" };
  return code.split("").map((ch, i) => ({ status: map[ch] ?? "none", note: notes[i + 1] }));
}
