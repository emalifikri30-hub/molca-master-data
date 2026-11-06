"use client";

import { BellOff, Bell, CheckCheck, ListTree } from "lucide-react";
import {
  AlarmStateBadge,
  formatDuration,
  sortAlarms,
  type Alarm,
  type AlarmPriority,
} from "@/components/molca/alarm-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALARM_COLOR, HmiStyle, hmi } from "./hmi-theme";
import { PriorityIcon } from "./equipment-symbols";

export type HmiAlarmBannerProps = {
  alarms: Alarm[];
  /** Reference time for “time active” */
  now: Date;
  /** Number of alarm rows (fixed height — no layout shift). Default 3 */
  rows?: number;
  /** Acknowledge the alarms currently shown in the banner (ISA-18.2: ack only what the operator can see) */
  onAcknowledge?: (ids: string[]) => void;
  /** Silence the horn — does not acknowledge */
  onSilence?: () => void;
  silenced?: boolean;
  /** Open the alarm summary display */
  onShowSummary?: () => void;
  /** Jump to the display that owns this alarm */
  onSelect?: (alarm: Alarm) => void;
  className?: string;
};

const PRIORITIES: AlarmPriority[] = ["critical", "high", "medium", "low"];
const hhmmss = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Top-of-display alarm banner for ISA-101 operator screens:
 * the highest-priority unacknowledged alarms, counts per priority, acknowledge visible and silence horn.
 */
export function HmiAlarmBanner({
  alarms,
  now,
  rows = 3,
  onAcknowledge,
  onSilence,
  silenced = false,
  onShowSummary,
  onSelect,
  className,
}: HmiAlarmBannerProps) {
  const standing = sortAlarms(
    alarms.filter(
      (a) => a.state === "unack-active" || a.state === "ack-active" || a.state === "unack-rtn",
    ),
  );
  const shown = standing.slice(0, rows);
  const visibleUnack = shown.filter((a) => a.state !== "ack-active");
  const totalUnack = standing.filter((a) => a.state !== "ack-active").length;
  const hidden = standing.length - shown.length;

  return (
    <div className={cn("@container w-full", className)}>
      <section
        aria-label="Alarm banner"
        className="molca-hmi grid overflow-hidden rounded-xl border text-[var(--hmi-text)] @3xl:grid-cols-[minmax(0,1fr)_auto]"
        style={{ background: hmi.surface }}
      >
        <HmiStyle />
        <ol className="min-w-0 divide-y" aria-live="polite">
          {shown.map((a) => {
            const unack = a.state === "unack-active";
            const rtn = a.state === "unack-rtn";
            return (
              <li
                key={a.id}
                className="flex h-9 items-center"
                style={{
                  boxShadow: rtn ? undefined : `inset 4px 0 0 ${ALARM_COLOR[a.priority].fill}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(a)}
                  disabled={!onSelect}
                  className={cn(
                    "flex h-full min-w-0 flex-1 items-center gap-2.5 pr-2 pl-3 text-left text-[12.5px] outline-none focus-visible:bg-[var(--hmi-track)] enabled:hover:bg-[var(--hmi-track)]",
                    unack && "font-semibold",
                    rtn && "text-[var(--hmi-text-muted)]",
                  )}
                  aria-label={`${ALARM_COLOR[a.priority].label} ${a.tag} ${a.description}${unack ? ", unacknowledged" : ""}`}
                >
                  <PriorityIcon
                    priority={a.priority}
                    unack={unack}
                    size={18}
                    className={cn(rtn && "opacity-45")}
                  />
                  <span className="w-16 shrink-0 font-mono text-[11.5px] font-normal tabular-nums">
                    {hhmmss(a.activeSince)}
                  </span>
                  <span className="w-28 shrink-0 truncate font-mono @xl:w-36 text-[12px]">
                    {a.tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {a.description}
                    {a.value && (
                      <span className="font-normal tabular-nums">
                        {" "}
                        · {a.value}
                        {a.limit && (
                          <span className="text-[var(--hmi-text-muted)]"> ({a.limit})</span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] font-normal text-[var(--hmi-text-muted)] tabular-nums @lg:block">
                    {rtn
                      ? "RTN"
                      : formatDuration(now.getTime() - new Date(a.activeSince).getTime())}
                  </span>
                </button>
                <span className="hidden w-24 shrink-0 pr-3 @5xl:block">
                  <AlarmStateBadge state={a.state} />
                </span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, rows - shown.length) }).map((_, i) => (
            <li
              key={`empty-${i}`}
              className="flex h-9 items-center px-3 text-[12px] text-[var(--hmi-text-muted)]"
            >
              {shown.length === 0 && i === 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCheck className="size-4" /> No standing alarms
                </span>
              ) : (
                "—"
              )}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 @3xl:flex-col @3xl:items-end @3xl:justify-center @3xl:gap-2 @3xl:border-t-0 @3xl:border-l">
          <div className="flex items-center gap-2.5" aria-label="Standing alarms per priority">
            {PRIORITIES.map((p) => {
              const all = standing.filter((a) => a.priority === p);
              const un = all.filter((a) => a.state !== "ack-active").length;
              return (
                <div
                  key={p}
                  className={cn("flex items-center gap-1", !all.length && "opacity-40")}
                  title={`${ALARM_COLOR[p].label}: ${all.length} standing, ${un} unacknowledged`}
                >
                  <PriorityIcon
                    priority={p}
                    size={18}
                    unack={all.some((a) => a.state === "unack-active")}
                  />
                  <span className="grid leading-none">
                    <span className="text-[14px] font-semibold tabular-nums">{all.length}</span>
                    <span className="text-[9.5px] text-[var(--hmi-text-muted)] tabular-nums">
                      {un} un
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {onAcknowledge && (
              <Button
                size="sm"
                disabled={!visibleUnack.length}
                onClick={() => onAcknowledge(visibleUnack.map((a) => a.id))}
              >
                <CheckCheck /> Ack {visibleUnack.length || ""}
              </Button>
            )}
            {onSilence && (
              <Button size="sm" variant="outline" onClick={onSilence} aria-pressed={silenced}>
                {silenced ? <BellOff /> : <Bell />} {silenced ? "Silenced" : "Silence"}
              </Button>
            )}
            {onShowSummary && (
              <Button size="sm" variant="ghost" onClick={onShowSummary}>
                <ListTree /> Summary{hidden > 0 ? ` (+${hidden})` : ""}
              </Button>
            )}
          </div>
          <span className="sr-only">{totalUnack} unacknowledged alarms</span>
        </div>
      </section>
    </div>
  );
}
