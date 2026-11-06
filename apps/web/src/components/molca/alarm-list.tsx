"use client";

import * as React from "react";
import { Archive, Ban, Check, CheckCheck, ChevronDown, EyeOff, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* ISA-18.2 model                                                      */
/* ------------------------------------------------------------------ */

export type AlarmPriority = "critical" | "high" | "medium" | "low" | "info";

/**
 * ISA-18.2 alarm states (state transition diagram, letters A–H; E “latched” omitted).
 * A normal · B unack active · C ack active · D unack RTN · F shelved · G suppressed by design · H out of service
 */
export type AlarmState =
  | "unack-active"
  | "ack-active"
  | "unack-rtn"
  | "normal"
  | "shelved"
  | "suppressed"
  | "out-of-service";

export type Alarm = {
  id: string;
  /** Instrument / point tag, e.g. "L3-FIL-PT101.HI" */
  tag: string;
  description: string;
  /** Plant area / unit (ISA-95 equipment hierarchy) */
  area: string;
  priority: AlarmPriority;
  state: AlarmState;
  /** ISO timestamp the alarm became active */
  activeSince: string;
  /** Process value and limit, e.g. "6.8 bar" / "HI 6.5 bar" */
  value?: string;
  limit?: string;
  /** Shelved until (ISO) */
  shelvedUntil?: string;
};

export const ALARM_PRIORITY_META: Record<
  AlarmPriority,
  { label: string; short: string; color: string; ink: string }
> = {
  critical: {
    label: "Critical",
    short: "1",
    color: "var(--alarm-critical)",
    ink: "var(--ink-on-bright)",
  },
  high: { label: "High", short: "2", color: "var(--alarm-high)", ink: "var(--ink-on-bright)" },
  medium: {
    label: "Medium",
    short: "3",
    color: "var(--alarm-medium)",
    ink: "var(--ink-on-bright)",
  },
  low: { label: "Low", short: "4", color: "var(--alarm-low)", ink: "var(--ink-on-bright)" },
  info: {
    label: "Diagnostic",
    short: "i",
    color: "var(--alarm-info)",
    ink: "var(--ink-on-bright)",
  },
};

export const ALARM_STATE_META: Record<
  AlarmState,
  { label: string; code: string; description: string }
> = {
  normal: { label: "Normal", code: "A", description: "Not active, acknowledged" },
  "unack-active": {
    label: "Unack",
    code: "B",
    description: "Active, not acknowledged — needs attention",
  },
  "ack-active": { label: "Ack", code: "C", description: "Active, acknowledged — being handled" },
  "unack-rtn": {
    label: "RTN unack",
    code: "D",
    description: "Returned to normal, not yet acknowledged",
  },
  shelved: { label: "Shelved", code: "F", description: "Temporarily removed by the operator" },
  suppressed: {
    label: "Suppressed",
    code: "G",
    description: "Suppressed by design (e.g. equipment stopped)",
  },
  "out-of-service": { label: "Out of service", code: "H", description: "Removed for maintenance" },
};

const PRIORITY_ORDER: AlarmPriority[] = ["critical", "high", "medium", "low", "info"];
const STATE_ORDER: AlarmState[] = [
  "unack-active",
  "ack-active",
  "unack-rtn",
  "shelved",
  "suppressed",
  "out-of-service",
  "normal",
];

/** ISA-18.2 sort: unacknowledged first, then priority, then newest. */
export function sortAlarms(alarms: Alarm[]) {
  return [...alarms].sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      b.activeSince.localeCompare(a.activeSince),
  );
}

/** “1h 12m” / “4m 05s” */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/* ------------------------------------------------------------------ */
/* Priority icon — color + shape + number (never color alone)          */
/* ------------------------------------------------------------------ */

const shapes: Record<AlarmPriority, React.ReactNode> = {
  critical: <path d="M6.5 1h7L19 6.5v7L13.5 19h-7L1 13.5v-7z" />, // octagon
  high: <path d="M10 1.5 19 18H1z" />, // triangle
  medium: <path d="M10 1 19 10 10 19 1 10z" />, // diamond
  low: <circle cx="10" cy="10" r="8.5" />, // circle
  info: <rect x="2" y="2" width="16" height="16" rx="2" />, // square
};

export function AlarmPriorityIcon({
  priority,
  blink = false,
  size = 20,
  className,
}: {
  priority: AlarmPriority;
  blink?: boolean;
  size?: number;
  className?: string;
}) {
  const m = ALARM_PRIORITY_META[priority];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={cn(
        "shrink-0",
        blink && "motion-safe:animate-[alarm-blink_1s_steps(2,start)_infinite]",
        className,
      )}
      role="img"
      aria-label={`${m.label} priority`}
    >
      <g fill={m.color} stroke="var(--card)" strokeWidth={0.75}>
        {shapes[priority]}
      </g>
      <text
        x="10"
        y={priority === "high" ? 14.5 : 13.6}
        fontSize={priority === "high" ? 8.5 : 9.5}
        fontWeight={700}
        textAnchor="middle"
        fill={m.ink}
      >
        {m.short}
      </text>
    </svg>
  );
}

/** Keyframes for the unack blink (kept local so no global CSS change is needed). */
function BlinkStyle() {
  return <style>{`@keyframes alarm-blink{to{visibility:hidden}}`}</style>;
}

/* ------------------------------------------------------------------ */
/* State badge                                                          */
/* ------------------------------------------------------------------ */

export function AlarmStateBadge({ state, className }: { state: AlarmState; className?: string }) {
  const m = ALARM_STATE_META[state];
  const Icon =
    state === "shelved"
      ? Archive
      : state === "suppressed"
        ? EyeOff
        : state === "out-of-service"
          ? Ban
          : state === "ack-active"
            ? Check
            : state === "normal"
              ? CheckCheck
              : null;
  return (
    <span
      title={`${m.code} · ${m.description}`}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium whitespace-nowrap",
        state === "unack-active" && "border-foreground bg-foreground text-background",
        state === "unack-rtn" && "border-dashed border-foreground/60 text-foreground",
        (state === "ack-active" || state === "normal") && "text-muted-foreground",
        (state === "shelved" || state === "suppressed" || state === "out-of-service") &&
          "bg-muted text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {m.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Alarm list                                                           */
/* ------------------------------------------------------------------ */

export type AlarmListProps = {
  alarms: Alarm[];
  /** Reference time for “time active” (pass a ticking Date in apps) */
  now: Date;
  onAcknowledge?: (ids: string[]) => void;
  onShelve?: (id: string, minutes: number) => void;
  /** Show shelved / suppressed / out-of-service rows */
  showInhibited?: boolean;
  className?: string;
};

export function AlarmList({
  alarms,
  now,
  onAcknowledge,
  onShelve,
  showInhibited = true,
  className,
}: AlarmListProps) {
  const rows = sortAlarms(
    alarms.filter(
      (a) =>
        a.state !== "normal" &&
        (showInhibited || !["shelved", "suppressed", "out-of-service"].includes(a.state)),
    ),
  );
  const unack = rows.filter((a) => a.state === "unack-active" || a.state === "unack-rtn");
  return (
    <div className={cn("w-full overflow-hidden rounded-2xl border bg-card", className)}>
      <BlinkStyle />
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="text-[13px] text-muted-foreground">
          <b className="font-semibold text-foreground tabular-nums">{rows.length}</b> alarms ·{" "}
          <b className="font-semibold text-foreground tabular-nums">{unack.length}</b>{" "}
          unacknowledged
        </div>
        {onAcknowledge && (
          <Button
            size="sm"
            variant="outline"
            disabled={!unack.length}
            onClick={() => onAcknowledge(unack.map((a) => a.id))}
          >
            <CheckCheck /> Ack page
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-subtle text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-1 p-0" aria-hidden />
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Time active</th>
              <th className="w-full px-3 py-2 font-medium">Tag · description · area</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const p = ALARM_PRIORITY_META[a.priority];
              const unackActive = a.state === "unack-active";
              const inhibited =
                a.state === "shelved" || a.state === "suppressed" || a.state === "out-of-service";
              const rtn = a.state === "unack-rtn";
              return (
                <tr
                  key={a.id}
                  className={cn(
                    "border-t",
                    inhibited && "text-muted-foreground",
                    unackActive && "font-semibold",
                  )}
                >
                  <td
                    className="w-1 p-0"
                    style={{ background: inhibited || rtn ? "transparent" : p.color }}
                    aria-hidden
                  />
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <AlarmPriorityIcon
                        priority={a.priority}
                        blink={unackActive}
                        className={cn((inhibited || rtn) && "opacity-45")}
                      />
                      <span
                        className={cn(
                          "text-[12.5px] whitespace-nowrap",
                          !unackActive && "font-medium",
                        )}
                      >
                        {p.label}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap tabular-nums">
                    {rtn ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatDuration(now.getTime() - new Date(a.activeSince).getTime())
                    )}
                    <div className="font-sans text-[11px] font-normal text-muted-foreground">
                      {new Date(a.activeSince).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="min-w-56 px-3 py-2">
                    <div className="font-mono text-[12px] whitespace-nowrap">{a.tag}</div>
                    <div
                      className={cn(
                        "text-[12.5px]",
                        unackActive ? "text-foreground" : "font-normal text-muted-foreground",
                      )}
                    >
                      {a.description}
                      {a.value && (
                        <span className="tabular-nums">
                          {" "}
                          · {a.value}
                          {a.limit && <span className="text-muted-foreground"> ({a.limit})</span>}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] font-normal text-muted-foreground">{a.area}</div>
                  </td>
                  <td className="px-3 py-2">
                    <AlarmStateBadge state={a.state} />
                    {a.state === "shelved" && a.shelvedUntil && (
                      <div className="mt-0.5 text-[11px] font-normal">
                        until{" "}
                        {new Date(a.shelvedUntil).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {(unackActive || rtn) && onAcknowledge && (
                        <Button
                          size="xs"
                          variant={unackActive ? "default" : "outline"}
                          onClick={() => onAcknowledge([a.id])}
                          aria-label={`Acknowledge ${a.tag}`}
                        >
                          <Check /> Ack
                        </Button>
                      )}
                      {!inhibited && !rtn && onShelve && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="xs" variant="ghost" aria-label={`Shelve ${a.tag}`}>
                              Shelve <ChevronDown />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Shelve for</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {[15, 60, 480].map((m) => (
                              <DropdownMenuItem key={m} onSelect={() => onShelve(a.id, m)}>
                                {m < 60 ? `${m} min` : `${m / 60} h`}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No standing alarms.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary + banner                                                    */
/* ------------------------------------------------------------------ */

/** Counts per priority: unacknowledged / total standing (inhibited alarms counted separately). */
export function AlarmSummary({ alarms, className }: { alarms: Alarm[]; className?: string }) {
  const standing = alarms.filter(
    (a) => a.state === "unack-active" || a.state === "ack-active" || a.state === "unack-rtn",
  );
  const inhibited = alarms.filter(
    (a) => a.state === "shelved" || a.state === "suppressed" || a.state === "out-of-service",
  ).length;
  return (
    <div className={cn("flex flex-wrap items-stretch gap-2", className)}>
      <BlinkStyle />
      {PRIORITY_ORDER.slice(0, 4).map((p) => {
        const all = standing.filter((a) => a.priority === p);
        const un = all.filter((a) => a.state !== "ack-active").length;
        return (
          <div
            key={p}
            className="flex min-w-28 items-center gap-2.5 rounded-xl border bg-card px-3 py-2"
          >
            <AlarmPriorityIcon
              priority={p}
              size={22}
              blink={all.some((a) => a.state === "unack-active")}
            />
            <div>
              <div className="text-[11.5px] text-muted-foreground">
                {ALARM_PRIORITY_META[p].label}
              </div>
              <div className="text-[15px] font-semibold tabular-nums">
                {all.length}
                {un > 0 && (
                  <span className="ml-1 text-[11.5px] font-medium text-muted-foreground">
                    {un} unack
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex min-w-28 items-center gap-2.5 rounded-xl border border-dashed px-3 py-2 text-muted-foreground">
        <Archive className="size-4" />
        <div>
          <div className="text-[11.5px]">Shelved / suppressed</div>
          <div className="text-[15px] font-semibold text-foreground tabular-nums">{inhibited}</div>
        </div>
      </div>
    </div>
  );
}

/** One-line banner for the app shell: newest highest-priority unacknowledged alarm + counts. */
export function AlarmBanner({
  alarms,
  now,
  onAcknowledge,
  onOpen,
  className,
}: {
  alarms: Alarm[];
  now: Date;
  onAcknowledge?: (id: string) => void;
  onOpen?: () => void;
  className?: string;
}) {
  const unack = sortAlarms(alarms.filter((a) => a.state === "unack-active"));
  const top = unack[0];
  if (!top) {
    return (
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] text-muted-foreground",
          className,
        )}
      >
        <CheckCheck className="size-4 text-success" /> No unacknowledged alarms
      </div>
    );
  }
  const p = ALARM_PRIORITY_META[top.priority];
  return (
    <div
      role="alert"
      className={cn(
        "flex h-11 items-center gap-3 overflow-hidden rounded-xl border bg-card pr-1.5 text-[13px]",
        className,
      )}
      style={{ boxShadow: `inset 4px 0 0 ${p.color}` }}
    >
      <BlinkStyle />
      <span className="pl-3">
        <AlarmPriorityIcon priority={top.priority} blink />
      </span>
      <span className="font-semibold">{p.label}</span>
      <span className="font-mono text-[12px]">{top.tag}</span>
      <span className="min-w-0 truncate text-muted-foreground">{top.description}</span>
      <span className="ml-auto font-mono text-[12px] whitespace-nowrap tabular-nums text-muted-foreground">
        {formatDuration(now.getTime() - new Date(top.activeSince).getTime())}
      </span>
      {unack.length > 1 && (
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium whitespace-nowrap hover:bg-accent"
        >
          +{unack.length - 1} unack
        </button>
      )}
      {onAcknowledge && (
        <Button size="sm" onClick={() => onAcknowledge(top.id)}>
          <Check /> Ack
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flood indicator                                                      */
/* ------------------------------------------------------------------ */

export type AlarmFloodMeterProps = {
  /** Annunciated alarms per 10-minute bucket, oldest first */
  buckets: number[];
  /** Labels per bucket, e.g. "13:10" */
  labels?: string[];
  /** Target alarms per 10 min per operator (ISA-18.2 “very likely acceptable” ≈ 1) */
  target?: number;
  /** Flood threshold (ISA-18.2: > 10 alarms in 10 min per operator) */
  flood?: number;
  className?: string;
};

/** Alarm rate per 10 min vs target and flood threshold. Red scale: more alarms = redder. */
export function AlarmFloodMeter({
  buckets,
  labels,
  target = 1,
  flood = 10,
  className,
}: AlarmFloodMeterProps) {
  const max = Math.max(flood + 2, ...buckets);
  const current = buckets[buckets.length - 1] ?? 0;
  const inFlood = current > flood;
  const floodBuckets = buckets.filter((b) => b > flood).length;
  const color = (v: number) =>
    v <= target
      ? "var(--chart-base)"
      : v <= 2 * target
        ? "color-mix(in srgb, var(--sys-red) 35%, var(--card))"
        : v <= flood
          ? "color-mix(in srgb, var(--sys-red) 60%, var(--card))"
          : "var(--sys-red)";
  const y = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Last 10 min</span>
        <span className="text-[22px] leading-none font-semibold tabular-nums">{current}</span>
        <span className="text-[13px] text-muted-foreground">alarms</span>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
            inFlood
              ? "bg-danger text-ink-on-bright"
              : current > target
                ? "bg-warning-soft text-[color-mix(in_oklab,var(--warning)_75%,black)] dark:text-warning"
                : "bg-success-soft text-success",
          )}
        >
          <Waves className="size-3.5" />
          {inFlood ? "Alarm flood" : current > target ? "Above target" : "Within target"}
        </span>
        <span className="ml-auto text-[12px] text-muted-foreground">
          {floodBuckets} of {buckets.length} periods in flood
        </span>
      </div>
      <div
        className="relative mt-4 h-28"
        role="img"
        aria-label={`Alarm rate per 10 minutes: ${buckets.join(", ")}. Target ${target}, flood above ${flood}.`}
      >
        <div
          className="absolute inset-x-0 border-t border-dashed border-danger"
          style={{ bottom: y(flood) }}
        >
          <span className="absolute -top-4 right-0 text-[11px] text-danger">
            Flood &gt; {flood}
          </span>
        </div>
        <div
          className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
          style={{ bottom: y(target) }}
        >
          <span className="absolute -top-4 left-0 text-[11px] text-muted-foreground">
            Target ≤ {target}
          </span>
        </div>
        <div className="absolute inset-0 flex items-end gap-1">
          {buckets.map((b, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${labels?.[i] ?? `#${i + 1}`}: ${b} alarms`}
            >
              <div
                className={cn(
                  "rounded-t-[4px]",
                  i === buckets.length - 1 &&
                    "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                )}
                style={{ height: y(Math.max(b, 0.15)), background: color(b) }}
              />
            </div>
          ))}
        </div>
      </div>
      {labels && (
        <div className="mt-1.5 flex gap-1 text-[10.5px] text-muted-foreground">
          {labels.map((l, i) => (
            <span key={i} className="flex-1 text-center tabular-nums">
              {i % 2 === 0 || i === labels.length - 1 ? l : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
