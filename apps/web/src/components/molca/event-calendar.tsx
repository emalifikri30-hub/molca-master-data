import * as React from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Maintenance types. Chips stay neutral; only the small marker carries color. */
export const MAINTENANCE_META = {
  preventive: { label: "Preventive", marker: "bg-st-planned" },
  corrective: { label: "Corrective", marker: "bg-st-unplanned" },
  shutdown: { label: "Shutdown", marker: "bg-foreground" },
  recurrent: { label: "Recurrent", marker: "bg-highlight" },
} as const;
export type MaintenanceType = keyof typeof MAINTENANCE_META;

export type CalendarEvent = {
  id: string;
  title: string;
  type: MaintenanceType;
  /** Start date (and time if `allDay` is false) */
  start: Date;
  /** End (inclusive day for all-day events). Defaults to start + 1 h. */
  end?: Date;
  allDay?: boolean;
  /** Asset / machine, shown in the tooltip and week view */
  asset?: string;
};

export type EventCalendarProps = {
  events: CalendarEvent[];
  view?: "month" | "week";
  defaultView?: "month" | "week";
  onViewChange?: (v: "month" | "week") => void;
  /** Initially displayed date */
  defaultDate?: Date;
  /** "Today" — pass a fixed date for SSR-stable rendering */
  today?: Date;
  /** First day of the week, 1 = Monday */
  weekStartsOn?: 0 | 1;
  /** Hours shown in week view */
  dayStartHour?: number;
  dayEndHour?: number;
  /** Max chips per month cell before “+n more” */
  maxPerDay?: number;
  onEventClick?: (e: CalendarEvent) => void;
  onDateClick?: (d: Date) => void;
  showLegend?: boolean;
  className?: string;
};

const hhmm = (d: Date) => format(d, "HH.mm");
const endOf = (e: CalendarEvent) => e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000);
const occursOn = (e: CalendarEvent, day: Date) =>
  isWithinInterval(startOfDay(day), { start: startOfDay(e.start), end: startOfDay(endOf(e)) });

export function MaintenanceLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {(Object.keys(MAINTENANCE_META) as MaintenanceType[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-1 rounded-full", MAINTENANCE_META[k].marker)} />
          {MAINTENANCE_META[k].label}
        </span>
      ))}
    </div>
  );
}

/** Neutral event chip with a colored marker on the left. */
export function EventChip({
  event,
  onClick,
  showTime = true,
  className,
}: {
  event: CalendarEvent;
  onClick?: (e: CalendarEvent) => void;
  showTime?: boolean;
  className?: string;
}) {
  const m = MAINTENANCE_META[event.type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onClick?.(event);
          }}
          className={cn(
            "@container flex w-full min-w-0 items-center gap-1.5 rounded-md border bg-card px-1.5 py-0.5 text-left text-[11.5px] leading-4 shadow-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
          aria-label={`${m.label}: ${event.title}${event.asset ? `, ${event.asset}` : ""}${event.allDay ? ", all day" : `, ${hhmm(event.start)}`}`}
        >
          <span className={cn("h-3 w-1 shrink-0 rounded-full", m.marker)} />
          {showTime && !event.allDay && (
            <span className="hidden shrink-0 tabular-nums text-muted-foreground @[10rem]:inline">
              {hhmm(event.start)}
            </span>
          )}
          <span className="truncate font-medium">{event.title}</span>
          {event.type === "recurrent" && (
            <Repeat className="ml-auto size-3 shrink-0 text-muted-foreground" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-0.5">
        <span className="font-medium">{event.title}</span>
        <span className="opacity-70">
          {m.label}
          {event.asset ? ` · ${event.asset}` : ""}
        </span>
        <span className="opacity-70 tabular-nums">
          {event.allDay
            ? isSameDay(event.start, endOf(event))
              ? `${format(event.start, "d MMM")} · all day`
              : `${format(event.start, "d MMM")} – ${format(endOf(event), "d MMM")}`
            : `${format(event.start, "d MMM")} · ${hhmm(event.start)}–${hhmm(endOf(event))}`}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Month / week maintenance calendar. */
export function EventCalendar({
  events,
  view: viewProp,
  defaultView = "month",
  onViewChange,
  defaultDate,
  today: todayProp,
  weekStartsOn = 1,
  dayStartHour = 6,
  dayEndHour = 22,
  maxPerDay = 3,
  onEventClick,
  onDateClick,
  showLegend = true,
  className,
}: EventCalendarProps) {
  const [today] = React.useState(() => todayProp ?? new Date());
  const [cursor, setCursor] = React.useState(() => defaultDate ?? today);
  const [innerView, setInnerView] = React.useState(defaultView);
  const view = viewProp ?? innerView;
  const setView = (v: "month" | "week") => {
    setInnerView(v);
    onViewChange?.(v);
  };

  const step = (dir: 1 | -1) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)));
  const weekStart = startOfWeek(cursor, { weekStartsOn });
  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : isSameMonth(weekStart, addDays(weekStart, 6))
        ? `${format(weekStart, "d")} – ${format(addDays(weekStart, 6), "d MMMM yyyy")}`
        : `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM yyyy")}`;

  const sorted = React.useMemo(
    () =>
      [...events].sort(
        (a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.getTime() - b.start.getTime(),
      ),
    [events],
  );

  return (
    <div className={cn("w-full overflow-hidden rounded-2xl border bg-card", className)}>
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h3
          className="min-w-44 text-[16px] font-semibold tracking-[-0.01em] tabular-nums"
          aria-live="polite"
        >
          {title}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(today)}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={view === "month" ? "Next month" : "Next week"}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div
          role="radiogroup"
          aria-label="Calendar view"
          className="ml-auto inline-flex gap-0.5 rounded-lg bg-muted p-0.5"
        >
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                view === v
                  ? "bg-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid
          cursor={cursor}
          today={today}
          weekStartsOn={weekStartsOn}
          events={sorted}
          maxPerDay={maxPerDay}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
        />
      ) : (
        <WeekGrid
          weekStart={weekStart}
          today={today}
          events={sorted}
          startHour={dayStartHour}
          endHour={dayEndHour}
          onEventClick={onEventClick}
        />
      )}

      {showLegend && <MaintenanceLegend className="border-t px-4 py-2.5" />}
    </div>
  );
}

function MonthGrid({
  cursor,
  today,
  weekStartsOn,
  events,
  maxPerDay,
  onEventClick,
  onDateClick,
}: {
  cursor: Date;
  today: Date;
  weekStartsOn: 0 | 1;
  events: CalendarEvent[];
  maxPerDay: number;
  onEventClick?: (e: CalendarEvent) => void;
  onDateClick?: (d: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <div role="grid" aria-label={format(cursor, "MMMM yyyy")}>
      <div role="row" className="grid grid-cols-7 border-b bg-subtle">
        {days.slice(0, 7).map((d) => (
          <div
            role="columnheader"
            key={d.toISOString()}
            className="px-2 py-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {format(d, "EEE")}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const dayEvents = events.filter((e) => occursOn(e, d));
          const isToday = isSameDay(d, today);
          const inMonth = isSameMonth(d, cursor);
          const extra = dayEvents.length - maxPerDay;
          return (
            <div
              role="gridcell"
              key={d.toISOString()}
              aria-label={`${format(d, "EEEE d MMMM")}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
              onClick={() => onDateClick?.(d)}
              className={cn(
                "min-h-28 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0",
                i >= days.length - 7 && "border-b-0",
                !inMonth && "bg-subtle/60",
                onDateClick && "cursor-pointer hover:bg-subtle",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[12px] tabular-nums",
                    isToday
                      ? "bg-highlight font-semibold text-highlight-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                  )}
                  aria-current={isToday ? "date" : undefined}
                >
                  {format(d, "d")}
                </span>
              </div>
              <div className="grid gap-1">
                {dayEvents.slice(0, maxPerDay).map((e) => (
                  <EventChip
                    key={e.id}
                    event={e}
                    onClick={onEventClick}
                    className={cn(!inMonth && "opacity-60")}
                  />
                ))}
                {extra > 0 && (
                  <span className="px-1.5 text-[11.5px] font-medium text-muted-foreground">
                    +{extra} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  weekStart,
  today,
  events,
  startHour,
  endHour,
  onEventClick,
}: {
  weekStart: Date;
  today: Date;
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  onEventClick?: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const rowH = 40;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {/* day headers */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b bg-subtle">
          <div />
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            return (
              <div key={d.toISOString()} className="flex items-center gap-1.5 border-l px-2 py-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                  {format(d, "EEE")}
                </span>
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[12px] tabular-nums",
                    isToday && "bg-highlight font-semibold text-highlight-foreground",
                  )}
                  aria-current={isToday ? "date" : undefined}
                >
                  {format(d, "d")}
                </span>
              </div>
            );
          })}
        </div>
        {/* all-day row */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b">
          <div className="px-2 py-1.5 text-right text-[11px] text-muted-foreground">All day</div>
          {days.map((d) => (
            <div key={d.toISOString()} className="grid content-start gap-1 border-l p-1">
              {events
                .filter((e) => e.allDay && occursOn(e, d))
                .map((e) => (
                  <EventChip key={e.id} event={e} onClick={onEventClick} />
                ))}
            </div>
          ))}
        </div>
        {/* hour grid */}
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
          <div>
            {hours.map((h) => (
              <div
                key={h}
                className="relative pr-2 text-right text-[11px] tabular-nums text-muted-foreground"
                style={{ height: rowH }}
              >
                <span className={cn("relative", h > startHour && "-top-2")}>
                  {String(h).padStart(2, "0")}.00
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const timed = events.filter((e) => !e.allDay && isSameDay(e.start, d));
            const isToday = isSameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                className={cn("relative border-l", isToday && "bg-highlight-soft/40")}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b border-dashed last:border-b-0"
                    style={{ height: rowH }}
                  />
                ))}
                {timed.map((e) => {
                  const s = e.start.getHours() * 60 + e.start.getMinutes();
                  const en = endOf(e).getHours() * 60 + endOf(e).getMinutes();
                  const top = ((Math.max(s, startHour * 60) - startHour * 60) / 60) * rowH;
                  const height = Math.max(
                    22,
                    ((Math.min(en, endHour * 60) - Math.max(s, startHour * 60)) / 60) * rowH - 2,
                  );
                  const m = MAINTENANCE_META[e.type];
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEventClick?.(e)}
                      className="absolute inset-x-1 flex overflow-hidden rounded-md border bg-card text-left text-[11.5px] shadow-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                      style={{ top: top + 1, height }}
                      aria-label={`${m.label}: ${e.title}, ${hhmm(e.start)} to ${hhmm(endOf(e))}`}
                    >
                      <span className={cn("w-1 shrink-0", m.marker)} />
                      <span className="min-w-0 px-1.5 py-1">
                        <span className="block truncate font-medium">{e.title}</span>
                        <span className="block truncate tabular-nums text-muted-foreground">
                          {hhmm(e.start)}–{hhmm(endOf(e))}
                          {e.asset ? ` · ${e.asset}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {isToday && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-highlight"
                    style={{ top: ((nowMin - startHour * 60) / 60) * rowH }}
                  >
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-highlight" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
