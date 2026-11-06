import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** OEE loss / machine-state categories. Colors are universal codes — never brand colors. */
export const STATE_META = {
  run: { label: "Run time", className: "bg-st-run" },
  planned: { label: "Schedule loss (planned DT)", className: "bg-st-planned" },
  unplanned: { label: "Availability loss (unplanned DT)", className: "bg-st-unplanned" },
  small: { label: "Small stop", className: "bg-st-small" },
  off: { label: "No data", className: "bg-st-off" },
} as const;

export type StateKind = keyof typeof STATE_META;
/** A segment: state, start (minutes from shift start), duration (minutes). */
export type StateSegment = { state: StateKind; start: number; duration: number; note?: string };

const fmt = (startHour: number, m: number) => {
  const h = startHour + Math.floor(m / 60);
  return `${String(h % 24).padStart(2, "0")}.${String(Math.round(m % 60)).padStart(2, "0")}`;
};

export type StateTimelineProps = {
  segments: StateSegment[];
  /** Shift start hour, e.g. 7 for 07.00 */
  startHour?: number;
  /** Shift length in hours */
  hours?: number;
  /** Show an hour label every n hours (0 hides ticks) */
  tickEvery?: number;
  size?: "sm" | "md" | "lg";
  showLegend?: boolean;
  className?: string;
};

/** One shift as a rounded bar of state segments with hourly ticks and an optional legend. */
export function StateTimeline({
  segments,
  startHour = 7,
  hours = 8,
  tickEvery = 1,
  size = "md",
  showLegend = false,
  className,
}: StateTimelineProps) {
  const total = hours * 60;
  const used = [...new Set(segments.map((s) => s.state))];
  const order: StateKind[] = ["planned", "unplanned", "small", "run", "off"];
  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-muted",
          { sm: "h-2", md: "h-4", lg: "h-6" }[size],
        )}
      >
        {segments.map((s, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "h-full shrink-0 transition-opacity hover:opacity-80",
                  STATE_META[s.state].className,
                )}
                style={{ width: `${(s.duration / total) * 100}%` }}
                aria-label={`${STATE_META[s.state].label}, ${fmt(startHour, s.start)}, ${Math.round(s.duration)} min`}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="font-medium">{STATE_META[s.state].label}</div>
              <div className="opacity-70">
                {fmt(startHour, s.start)} – {fmt(startHour, s.start + s.duration)} ·{" "}
                {Math.round(s.duration)} min
              </div>
              {s.note && <div className="opacity-70">{s.note}</div>}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {tickEvery > 0 && (
        <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
          {Array.from({ length: hours + 1 }, (_, i) => i)
            .filter((i) => i % tickEvery === 0)
            .map((i) => (
              <span
                key={i}
                className="absolute top-0 tabular-nums"
                style={{
                  left: `${(i / hours) * 100}%`,
                  transform:
                    i === 0 ? "none" : i === hours ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {fmt(startHour, i * 60)}
              </span>
            ))}
        </div>
      )}
      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          {order
            .filter((k) => used.includes(k))
            .map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[3px]", STATE_META[k].className)} />
                {STATE_META[k].label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Deterministic demo data for one shift: a realistic mix of states.
 * - Planned DT (schedule loss): start-up/handover, short break, lunch — every shift has them.
 * - Minor stoppages (small stops, 1–6 min) scattered through run time.
 * - Unplanned DT (availability loss, 8–30 min) — more events as OEE drops.
 * Loss minutes scale with (100 − oee); even a ~99% line shows a few minor stops; 100% shows planned DT only.
 */
export function demoSegments(seed: number, oee = 90, minutes = 480): StateSegment[] {
  let s = (seed * 2654435761) >>> 0;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const slots: StateKind[] = Array(minutes).fill("run");
  const fill = (from: number, len: number, k: StateKind) => {
    for (let m = Math.max(0, Math.floor(from)); m < Math.min(minutes, Math.floor(from + len)); m++)
      slots[m] = k;
  };
  const isFree = (from: number, len: number) => {
    for (let m = Math.floor(from); m < Math.floor(from + len); m++)
      if (m >= minutes || slots[m] !== "run") return false;
    return true;
  };
  const place = (len: number, k: StateKind, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const at = 15 + r() * (minutes - 30 - len);
      if (isFree(at - 4, len + 8)) return fill(at, len, k);
    }
  };

  // planned downtime: start-up / handover, short break, lunch (slightly varied per line)
  fill(0, 8 + Math.round(r() * 10), "planned");
  fill(150 + Math.round(r() * 20), 10, "planned");
  fill(290 + Math.round(r() * 20), 30, "planned");
  if (r() > 0.6) fill(minutes - 10, 10, "planned"); // end-of-shift cleaning

  const perfect = oee >= 99.95;
  const lossMin = perfect ? 0 : Math.max(4, ((100 - oee) / 100) * minutes);
  // unplanned downtime: ~40% of the loss, in 1–3 events
  const unplannedEvents = perfect
    ? 0
    : oee >= 97
      ? r() > 0.5
        ? 1
        : 0
      : oee >= 90
        ? 1 + Math.round(r())
        : 2 + Math.round(r());
  let unplanned = unplannedEvents ? Math.max(8, lossMin * 0.4) : 0;
  for (let i = 0; i < unplannedEvents && unplanned > 0; i++) {
    const len = Math.min(30, Math.max(8, Math.round(unplanned / (unplannedEvents - i))));
    place(len, "unplanned");
    unplanned -= len;
  }
  // minor stoppages: the rest of the loss, 1–6 min each
  let small = perfect ? 0 : Math.max(3, lossMin * (unplannedEvents ? 0.6 : 1));
  while (small > 0) {
    const len = 1 + Math.round(r() * 5);
    place(len, "small", 12);
    small -= len;
  }

  // compress minute slots into segments
  const out: StateSegment[] = [];
  for (let m = 0; m < minutes; m++) {
    const last = out[out.length - 1];
    if (last && last.state === slots[m]) last.duration++;
    else out.push({ state: slots[m], start: m, duration: 1 });
  }
  return out;
}
