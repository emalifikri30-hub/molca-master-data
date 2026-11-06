"use client";

import * as React from "react";
import { Camera, Check, CircleAlert, CircleHelp, Radio, TriangleAlert, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { resizeImage } from "@/components/molca/photo-gallery";
import { conditionGrade } from "@/components/molca/asset-health";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Condition monitoring (ISO 17359): a monitoring point is one parameter of one asset, read on an inspection
 * route (manual) or streamed from a PLC / SCADA tag. Each reading is judged against warning and alarm limits —
 * for vibration velocity, the ISO 20816 zones A–D of the machine group.
 */
export type ConditionStatus = "unknown" | "normal" | "warning" | "alarm" | "stale";
export type ConditionLimits = {
  lowAlarm?: number | null;
  lowWarn?: number | null;
  highWarn?: number | null;
  highAlarm?: number | null;
};
export type IsoClass = "I" | "II" | "III" | "IV";

export const CONDITION_STATUS: Record<
  ConditionStatus,
  { label: string; color: string; Icon: typeof Check }
> = {
  normal: { label: "Normal", color: "var(--sys-green)", Icon: Check },
  warning: { label: "Warning", color: "var(--sys-orange)", Icon: TriangleAlert },
  alarm: { label: "Alarm", color: "var(--sys-red)", Icon: CircleAlert },
  stale: { label: "Stale", color: "var(--sys-gray)", Icon: Unplug },
  unknown: { label: "No data", color: "var(--muted-foreground)", Icon: CircleHelp },
};

/** ISO 20816-1 zone boundaries, mm/s RMS: A/B, B/C, C/D per machine group. */
export const ISO20816: Record<IsoClass, [number, number, number]> = {
  I: [0.71, 1.8, 4.5],
  II: [1.12, 2.8, 7.1],
  III: [1.8, 4.5, 11.2],
  IV: [2.8, 7.1, 18],
};
export const ISO_ZONE: Record<"A" | "B" | "C" | "D", { label: string; color: string }> = {
  A: { label: "A · new", color: "var(--sys-green)" },
  B: {
    label: "B · unrestricted",
    color: "color-mix(in oklab, var(--sys-green) 55%, var(--sys-yellow, #e8c547))",
  },
  C: { label: "C · restricted", color: "var(--sys-orange)" },
  D: { label: "D · damage", color: "var(--sys-red)" },
};
/** Judges a reading on the device (offline): ISO 20816 zone C = warning, D = alarm; else the hand-set limits. */
export function judgeReading(
  value: number,
  limits: ConditionLimits,
  isoClass?: IsoClass | null,
): ConditionStatus {
  if (isoClass)
    return ({ A: "normal", B: "normal", C: "warning", D: "alarm" } as const)[
      isoZone(value, isoClass)
    ];
  if (
    (limits.highAlarm != null && value >= limits.highAlarm) ||
    (limits.lowAlarm != null && value <= limits.lowAlarm)
  )
    return "alarm";
  if (
    (limits.highWarn != null && value >= limits.highWarn) ||
    (limits.lowWarn != null && value <= limits.lowWarn)
  )
    return "warning";
  return "normal";
}

export function isoZone(v: number, cls: IsoClass) {
  const [ab, bc, cd] = ISO20816[cls];
  return v < ab ? "A" : v < bc ? "B" : v < cd ? "C" : "D";
}

/* ------------------------------------------------------------------ */
/* Atoms                                                               */
/* ------------------------------------------------------------------ */

export function ConditionStatusBadge({
  status,
  label,
  className,
}: {
  status: ConditionStatus;
  label?: string;
  className?: string;
}) {
  const m = CONDITION_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium",
        className,
      )}
      style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}
    >
      <m.Icon className="size-3.5" />
      {label ?? m.label}
    </span>
  );
}

/** The reading on a horizontal scale with the warning (amber) and alarm (red) regions shaded. */
export function LimitGauge({
  value,
  limits,
  unit,
  decimals = 1,
  className,
}: {
  value: number | null;
  limits: ConditionLimits;
  unit?: string;
  decimals?: number;
  className?: string;
}) {
  const marks = [limits.lowAlarm, limits.lowWarn, limits.highWarn, limits.highAlarm].filter(
    (x): x is number => x != null,
  );
  const lo = Math.min(...marks, value ?? marks[0] ?? 0);
  const hi = Math.max(...marks, value ?? marks[0] ?? 1);
  const pad = (hi - lo) * 0.18 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const band = (from: number, to: number, color: string, key: string) => (
    <div
      key={key}
      className="absolute inset-y-0"
      style={{ left: x(from), width: `calc(${x(to)} - ${x(from)})`, background: color }}
    />
  );
  const amber = "color-mix(in oklab, var(--sys-orange) 30%, transparent)";
  const red = "color-mix(in oklab, var(--sys-red) 32%, transparent)";
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        {limits.lowAlarm != null && band(min, limits.lowAlarm, red, "la")}
        {limits.lowWarn != null && band(limits.lowAlarm ?? min, limits.lowWarn, amber, "lw")}
        {limits.highWarn != null && band(limits.highWarn, limits.highAlarm ?? max, amber, "hw")}
        {limits.highAlarm != null && band(limits.highAlarm, max, red, "ha")}
      </div>
      {value != null && (
        <div className="relative h-0">
          <div
            className="absolute -top-[15px] h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: x(Math.max(min, Math.min(max, value))) }}
          />
        </div>
      )}
      <div className="relative h-3.5 text-[10.5px] text-muted-foreground tabular-nums">
        {marks.map((m, i) => (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: x(m) }}>
            {m.toFixed(decimals)}
          </span>
        ))}
        {unit && <span className="absolute right-0">{unit}</span>}
      </div>
    </div>
  );
}

/** Vibration velocity on the ISO 20816 zones of its machine group. */
export function IsoZoneBar({
  value,
  isoClass,
  className,
}: {
  value: number | null;
  isoClass: IsoClass;
  className?: string;
}) {
  const [ab, bc, cd] = ISO20816[isoClass];
  const max = cd * 1.5;
  const pct = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  const zones: ["A" | "B" | "C" | "D", number, number][] = [
    ["A", 0, ab],
    ["B", ab, bc],
    ["C", bc, cd],
    ["D", cd, max],
  ];
  const zone = value != null ? isoZone(value, isoClass) : null;
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="relative flex h-2.5 overflow-hidden rounded-full">
        {zones.map(([z, a, b]) => (
          <div
            key={z}
            style={{
              width: `calc(${pct(b)} - ${pct(a)})`,
              background: ISO_ZONE[z].color,
              opacity: zone === z ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      {value != null && (
        <div className="relative h-0">
          <div
            className="absolute -top-[15px] h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: pct(value) }}
          />
        </div>
      )}
      <div className="flex justify-between text-[10.5px] text-muted-foreground">
        <span>ISO 20816 · class {isoClass}</span>
        {zone && (
          <span className="font-medium" style={{ color: ISO_ZONE[zone].color }}>
            Zone {ISO_ZONE[zone].label}
          </span>
        )}
      </div>
    </div>
  );
}

/** A small trend of recent readings with the nearest limits as dashed lines. */
export function ConditionSpark({
  values,
  limits,
  width = 96,
  height = 28,
  className,
}: {
  values: number[];
  limits?: ConditionLimits;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2)
    return (
      <span
        className={cn("inline-block text-[11px] text-muted-foreground", className)}
        style={{ width }}
      >
        —
      </span>
    );
  const lines = [limits?.highAlarm, limits?.highWarn, limits?.lowWarn, limits?.lowAlarm].filter(
    (x): x is number => x != null,
  );
  const lo = Math.min(...values, ...lines);
  const hi = Math.max(...values, ...lines);
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${y(v).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      {limits?.highAlarm != null && (
        <line
          x1={0}
          x2={width}
          y1={y(limits.highAlarm)}
          y2={y(limits.highAlarm)}
          stroke="var(--sys-red)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {limits?.highWarn != null && (
        <line
          x1={0}
          x2={width}
          y1={y(limits.highWarn)}
          y2={y(limits.highWarn)}
          stroke="var(--sys-orange)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {limits?.lowWarn != null && (
        <line
          x1={0}
          x2={width}
          y1={y(limits.lowWarn)}
          y2={y(limits.lowWarn)}
          stroke="var(--sys-orange)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {limits?.lowAlarm != null && (
        <line
          x1={0}
          x2={width}
          y1={y(limits.lowAlarm)}
          y2={y(limits.lowAlarm)}
          stroke="var(--sys-red)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} />
      <circle cx={width} cy={y(values[values.length - 1]!)} r={2.2} fill="var(--chart-1)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Point row                                                           */
/* ------------------------------------------------------------------ */

export type ConditionPoint = {
  id: string;
  code: string;
  name: string;
  asset: string;
  parameter: string;
  unit: string;
  source: "manual" | "tag";
  status: ConditionStatus;
  value: number | null;
  at?: string | Date | null;
  limits: ConditionLimits;
  spark?: number[];
  /** prognosis: days until the trend reaches the alarm limit */
  daysToAlarm?: number | null;
};

export function ConditionPointRow({
  point,
  selected,
  onSelect,
  decimals = 1,
  statusLabel,
}: {
  point: ConditionPoint;
  selected?: boolean;
  onSelect?: (p: ConditionPoint) => void;
  decimals?: number;
  statusLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(point)}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-subtle sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_6.5rem]",
        selected && "bg-primary/5",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{point.name}</span>
          {point.source === "tag" && (
            <Radio className="size-3 shrink-0 text-muted-foreground" aria-label="PLC / SCADA tag" />
          )}
        </span>
        <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
          {point.asset} · {point.code}
        </span>
      </span>
      <ConditionSpark
        values={point.spark ?? []}
        limits={point.limits}
        className="hidden sm:block"
      />
      <span className="hidden text-right tabular-nums sm:block">
        <span className="text-[14px] font-semibold">
          {point.value != null ? point.value.toFixed(decimals) : "—"}
        </span>{" "}
        <span className="text-[11px] text-muted-foreground">{point.unit}</span>
      </span>
      <ConditionStatusBadge
        status={point.status}
        label={statusLabel}
        className="justify-self-end"
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

export type RouteRunStatus = "open" | "done" | "partial" | "missed";
export const ROUTE_RUN_COLOR: Record<RouteRunStatus, string> = {
  done: "var(--sys-green)",
  partial: "var(--sys-orange)",
  missed: "var(--sys-red)",
  open: "var(--muted-foreground)",
};

/** Recent runs of a route as squares (oldest left): done, partial, missed, open. */
export function RouteComplianceStrip({
  runs,
  className,
}: {
  runs: { status: RouteRunStatus; read?: number; total?: number; dueAt?: string | Date }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      {runs.map((r, i) => (
        <span
          key={i}
          title={`${r.dueAt ? new Date(r.dueAt).toLocaleString() : ""} · ${r.status}${r.total ? ` ${r.read}/${r.total}` : ""}`}
          className={cn(
            "size-2.5 rounded-[3px]",
            r.status === "open" && "border border-dashed bg-transparent",
          )}
          style={
            r.status === "open"
              ? { borderColor: ROUTE_RUN_COLOR.open }
              : { background: ROUTE_RUN_COLOR[r.status] }
          }
        />
      ))}
    </div>
  );
}

export type RoutePoint = {
  id: string;
  name: string;
  asset: string;
  unit: string;
  limits: ConditionLimits;
  isoClass?: IsoClass | null;
  /** already read in this run */
  reading?: { value: number; status: ConditionStatus } | null;
};

export type RouteRunnerProps = {
  points: RoutePoint[];
  /** submit one reading (with an optional photo data URL); resolve with the judged status */
  onRead: (
    pointId: string,
    value: number,
    photo?: string,
  ) => Promise<ConditionStatus | void> | void;
  /** offer a camera button per point (gauge or equipment photo, resized to 1280 px) */
  photos?: boolean;
  onComplete?: () => void;
  busy?: boolean;
  labels?: {
    read?: string;
    done?: string;
    complete?: string;
    progress?: (read: number, total: number) => string;
  };
  className?: string;
};

/**
 * Walk a route on a phone: points in walking order, one input each, judged on entry (normal / warning / alarm),
 * progress on top. Values out of limits are flagged at once so the technician can re-read before moving on.
 */
export function RouteRunner({
  points,
  onRead,
  onComplete,
  busy,
  photos,
  labels = {},
  className,
}: RouteRunnerProps) {
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [shot, setShot] = React.useState<Record<string, string>>({});
  const [local, setLocal] = React.useState<
    Record<string, { value: number; status: ConditionStatus }>
  >({});
  const reading = (p: RoutePoint) => local[p.id] ?? p.reading ?? null;
  const read = points.filter((p) => reading(p)).length;
  const next = points.find((p) => !reading(p));
  const submit = async (p: RoutePoint) => {
    const v = Number(String(draft[p.id] ?? "").replace(",", "."));
    if (!Number.isFinite(v) || draft[p.id] === "" || draft[p.id] == null) return;
    const status = (await onRead(p.id, v, shot[p.id])) || "normal";
    setLocal((l) => ({ ...l, [p.id]: { value: v, status } }));
    setDraft((d) => ({ ...d, [p.id]: "" }));
  };
  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3", className)}>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium">
            {labels.progress
              ? labels.progress(read, points.length)
              : `${read} of ${points.length} read`}
          </span>
          {onComplete && (
            <button
              type="button"
              disabled={busy || read === 0}
              onClick={onComplete}
              className="h-8 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-40"
            >
              {labels.complete ?? "Finish route"}
            </button>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(read / Math.max(1, points.length)) * 100}%`,
              background: "var(--sys-green)",
            }}
          />
        </div>
      </div>
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {points.map((p, i) => {
          const r = reading(p);
          const isNext = next?.id === p.id;
          return (
            <li
              key={p.id}
              className={cn("rounded-xl border bg-card p-3", isNext && "ring-2 ring-primary/40")}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-medium tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{p.name}</div>
                  <div className="font-mono text-[11.5px] text-muted-foreground">{p.asset}</div>
                </div>
                {r && <ConditionStatusBadge status={r.status} />}
              </div>
              <div className="mt-2.5">
                {p.isoClass ? (
                  <IsoZoneBar value={r?.value ?? null} isoClass={p.isoClass} />
                ) : (
                  <LimitGauge value={r?.value ?? null} limits={p.limits} unit={p.unit} />
                )}
              </div>
              <form
                className="mt-2.5 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(p);
                }}
              >
                <input
                  inputMode="decimal"
                  aria-label={`${p.name} (${p.unit})`}
                  placeholder={r ? String(r.value) : p.unit}
                  value={draft[p.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-[15px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <span className="w-10 text-[12px] text-muted-foreground">{p.unit}</span>
                {photos && (
                  <label
                    className={cn(
                      "grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg border",
                      shot[p.id] && "border-foreground",
                    )}
                    aria-label="Photo"
                  >
                    {shot[p.id] ? (
                      <img src={shot[p.id]} alt="" className="size-9 rounded-md object-cover" />
                    ) : (
                      <Camera className="size-4 text-muted-foreground" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const url = await resizeImage(f, 1280, 0.8);
                          setShot((s) => ({ ...s, [p.id]: url }));
                        }
                      }}
                    />
                  </label>
                )}
                <button
                  type="submit"
                  disabled={busy || !draft[p.id]}
                  className="h-10 rounded-lg border px-3 text-[13px] font-medium disabled:opacity-40"
                >
                  {r ? (labels.done ?? "Re-read") : (labels.read ?? "Save")}
                </button>
              </form>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per asset                                                           */
/* ------------------------------------------------------------------ */

const STATUS_RANK: Record<ConditionStatus, number> = {
  alarm: 0,
  warning: 1,
  stale: 2,
  unknown: 3,
  normal: 4,
};

/** The worst status of an asset's points: one alarm makes the machine alarm. */
export function worstStatus(statuses: ConditionStatus[]): ConditionStatus {
  return statuses.reduce<ConditionStatus>(
    (w, s) => (STATUS_RANK[s] < STATUS_RANK[w] ? s : w),
    statuses.length ? "normal" : "unknown",
  );
}

export type ConditionAsset = {
  id: string;
  tag: string;
  name: string;
  criticality?: "A" | "B" | "C" | null;
  area?: string;
};

/**
 * One machine on the condition board, kept quiet: a status dot and word, the tag and name, then each point as a
 * plain line (name, value) with a muted note when its trend reaches the alarm limit soon. Trends live in the
 * machine panel, not on the card.
 */
export type ConditionAssetCardLabels = {
  status?: Partial<Record<ConditionStatus, string>>;
  criticality?: (c: string) => string;
  soon?: (days: number) => string;
};

export function ConditionAssetCard({
  asset,
  points,
  alarms = 0,
  selected,
  onSelect,
  labels = {},
  className,
}: {
  asset: ConditionAsset;
  points: ConditionPoint[];
  alarms?: number;
  selected?: boolean;
  onSelect?: (a: ConditionAsset) => void;
  labels?: ConditionAssetCardLabels;
  className?: string;
}) {
  const status = worstStatus(points.map((p) => p.status));
  const m = CONDITION_STATUS[status];
  return (
    <button
      type="button"
      onClick={() => onSelect?.(asset)}
      className={cn(
        "flex h-full w-full flex-col rounded-xl border bg-card p-3 text-left transition-colors hover:bg-subtle/60",
        selected && "border-foreground/40 bg-subtle/60",
        className,
      )}
    >
      <span className="flex items-baseline gap-2">
        <span
          className="size-2 shrink-0 translate-y-[-1px] rounded-full"
          style={{ background: m.color }}
        />
        <span className="font-mono text-[13px] font-semibold">{asset.tag}</span>
        {asset.criticality && (
          <span className="text-[11px] text-muted-foreground">
            {labels.criticality
              ? labels.criticality(asset.criticality)
              : `Class ${asset.criticality}`}
          </span>
        )}
        <span
          className="ml-auto text-[12px] font-medium"
          style={{ color: status === "normal" ? "var(--muted-foreground)" : m.color }}
        >
          {labels.status?.[status] ?? m.label}
          {alarms ? ` · ${alarms}` : ""}
        </span>
      </span>
      <span className="mt-0.5 truncate pl-4 text-[12px] text-muted-foreground" title={asset.name}>
        {asset.name}
      </span>
      <span className="mt-2.5 grid content-start gap-1.5 border-t pt-2.5 pl-4">
        {points.map((p) => (
          <span
            key={p.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-[12.5px]"
          >
            <span
              className="min-w-0 truncate"
              title={p.name}
              style={{
                color:
                  p.status === "normal" || p.status === "unknown"
                    ? undefined
                    : CONDITION_STATUS[p.status].color,
              }}
            >
              {p.name}
            </span>
            <span className="text-right whitespace-nowrap tabular-nums">
              <span className="font-medium">
                {p.value != null
                  ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : "—"}
              </span>{" "}
              <span className="text-[11px] text-muted-foreground">{p.unit}</span>
            </span>
            {p.daysToAlarm != null && p.status !== "alarm" && (
              <span className="col-span-2 -mt-1 truncate text-[11px] text-muted-foreground">
                {labels.soon
                  ? labels.soon(Math.max(1, Math.round(p.daysToAlarm)))
                  : `Trend reaches the alarm limit in ~${Math.max(1, Math.round(p.daysToAlarm))} days`}
              </span>
            )}
          </span>
        ))}
      </span>
    </button>
  );
}

/** Counts of machines by worst status, as filter chips. */
export function ConditionAssetSummary({
  statuses,
  value,
  onSelect,
  className,
}: {
  statuses: ConditionStatus[];
  value?: ConditionStatus | null;
  onSelect?: (s: ConditionStatus | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {(["alarm", "warning", "stale", "normal"] as const).map((s) => {
        const m = CONDITION_STATUS[s];
        const n = statuses.filter((x) => x === s).length;
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSelect?.(on ? null : s)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12.5px]",
              on ? "border-foreground/40 bg-subtle" : "bg-card",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: m.color }} />
            <span className="text-muted-foreground">{m.label}</span>
            <span className="font-semibold tabular-nums">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix: machines × parameter families                               */
/* ------------------------------------------------------------------ */

export type ParameterFamily =
  | "vibration"
  | "temperature"
  | "pressure"
  | "current"
  | "oil"
  | "other";
export const PARAMETER_FAMILY: Record<string, ParameterFamily> = {
  vibration: "vibration",
  temperature: "temperature",
  thermography: "temperature",
  pressure: "pressure",
  current: "current",
  oil: "oil",
  oil_analysis: "oil",
  lubrication: "oil",
  ultrasound: "other",
  flow: "other",
  level: "other",
  other: "other",
};
export const FAMILY_ORDER: ParameterFamily[] = [
  "vibration",
  "temperature",
  "pressure",
  "current",
  "oil",
  "other",
];
const FAMILY_LABEL: Record<ParameterFamily, string> = {
  vibration: "Vibration",
  temperature: "Temperature",
  pressure: "Pressure",
  current: "Current",
  oil: "Oil & lube",
  other: "Other",
};

export type MatrixPoint = ConditionPoint & { assetId: string; planned?: boolean };
export type MatrixAsset = ConditionAsset & { area?: string };

export type ConditionMatrixProps = {
  assets: MatrixAsset[];
  points: MatrixPoint[];
  selectedId?: string | null;
  onSelect?: (asset: MatrixAsset) => void;
  /** area code → heading; rows are grouped in this order */
  areas?: { code: string; label: string }[];
  labels?: {
    machine?: string;
    next?: string;
    family?: Partial<Record<ParameterFamily, string>>;
    planned?: string;
    days?: (n: number) => string;
    status?: Partial<Record<ConditionStatus, string>>;
  };
  className?: string;
};

/**
 * The plant at a glance: one row per machine, one column per parameter family. A cell shows the worst point of
 * that family (dot + value), "+n" when there are more, "planned" for a sensor not installed yet; the last column is
 * the soonest a trend reaches its alarm limit. Rows are compact and aligned, so 60+ machines stay readable.
 */
export function ConditionMatrix({
  assets,
  points,
  selectedId,
  onSelect,
  areas,
  labels = {},
  className,
}: ConditionMatrixProps) {
  const cols = `minmax(11rem,1.7fr) repeat(${FAMILY_ORDER.length}, minmax(4.75rem,1fr)) 5.5rem`;
  const fam = (f: ParameterFamily) => labels.family?.[f] ?? FAMILY_LABEL[f];
  const byAsset = new Map<string, MatrixPoint[]>();
  for (const p of points) byAsset.set(p.assetId, [...(byAsset.get(p.assetId) ?? []), p]);
  const groups =
    areas ?? [...new Set(assets.map((a) => a.area ?? ""))].map((code) => ({ code, label: code }));
  const cell = (list: MatrixPoint[]) => {
    const live = list.filter((p) => !p.planned);
    if (!list.length) return <span className="text-muted-foreground/40">·</span>;
    if (!live.length)
      return (
        <span className="text-[11px] text-muted-foreground italic">
          {labels.planned ?? "planned"}
        </span>
      );
    const worst = [...live].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0]!;
    const color = CONDITION_STATUS[worst.status].color;
    return (
      <span
        className="flex min-w-0 items-baseline gap-1.5"
        title={live.map((p) => `${p.name}: ${p.value ?? "—"} ${p.unit}`).join("\n")}
      >
        <span
          className="size-1.5 shrink-0 translate-y-[-2px] rounded-full"
          style={{ background: color }}
        />
        <span
          className="truncate tabular-nums"
          style={{ color: worst.status === "normal" ? undefined : color }}
        >
          {worst.value != null
            ? worst.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
            : "—"}
          <span className="ml-0.5 text-[10.5px] text-muted-foreground">{worst.unit}</span>
        </span>
        {live.length > 1 && (
          <span className="text-[10.5px] text-muted-foreground">+{live.length - 1}</span>
        )}
      </span>
    );
  };
  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card", className)}>
      <div className="min-w-[46rem] text-[12.5px]">
        <div
          className="sticky top-0 z-[1] grid border-b bg-subtle px-3 py-2 text-[11.5px] font-medium text-muted-foreground"
          style={{ gridTemplateColumns: cols }}
        >
          <span>{labels.machine ?? "Machine"}</span>
          {FAMILY_ORDER.map((f) => (
            <span key={f}>{fam(f)}</span>
          ))}
          <span className="text-right">{labels.next ?? "Next limit"}</span>
        </div>
        {groups.map((g) => {
          const rows = assets.filter((a) => (a.area ?? "") === g.code);
          if (!rows.length) return null;
          return (
            <div key={g.code}>
              <div className="border-b bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {g.label} <span className="tabular-nums">· {rows.length}</span>
              </div>
              {rows.map((a) => {
                const list = byAsset.get(a.id) ?? [];
                const live = list.filter((p) => !p.planned);
                const status = worstStatus(live.map((p) => p.status));
                const soon = live
                  .map((p) => p.daysToAlarm)
                  .filter((d): d is number => d != null && d >= 0);
                const next = soon.length ? Math.min(...soon) : null;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect?.(a)}
                    className={cn(
                      "grid w-full items-baseline border-b px-3 py-2 text-left last:border-b-0 hover:bg-subtle/60",
                      selectedId === a.id && "bg-subtle",
                    )}
                    style={{ gridTemplateColumns: cols }}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span
                        className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                        style={{ background: CONDITION_STATUS[status].color }}
                      />
                      <span className="font-mono text-[12.5px] font-semibold">{a.tag}</span>
                      <span className="truncate text-muted-foreground" title={a.name}>
                        {a.name}
                      </span>
                    </span>
                    {FAMILY_ORDER.map((f) => (
                      <span key={f} className="min-w-0 pr-2">
                        {cell(
                          list.filter(
                            (p) =>
                              PARAMETER_FAMILY[p.parameter] === f ||
                              (!PARAMETER_FAMILY[p.parameter] && f === "other"),
                          ),
                        )}
                      </span>
                    ))}
                    <span className="text-right text-muted-foreground tabular-nums">
                      {status === "alarm" ? (
                        <span style={{ color: CONDITION_STATUS.alarm.color }}>
                          {labels.status?.alarm ?? "Alarm"}
                        </span>
                      ) : next != null ? (
                        labels.days ? (
                          labels.days(Math.max(1, Math.round(next)))
                        ) : (
                          `~${Math.max(1, Math.round(next))} d`
                        )
                      ) : (
                        "—"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Asset list (master of a master–detail)                              */
/* ------------------------------------------------------------------ */

export type ConditionListItem = MatrixAsset & {
  status: ConditionStatus;
  /** active alarms */
  alarms?: number;
  /** soonest days until a trend reaches its alarm limit */
  next?: number | null;
  /** points installed / planned */
  points?: number;
  planned?: number;
  /** health score 0–100 (condition grade colour) */
  score?: number | null;
};

/**
 * One column of machines, grouped by area: status dot, tag, name, and on the right the status word or the days
 * until the next limit. Made to sit left of a wide machine panel; scrolls on its own.
 */
export function ConditionAssetList({
  items,
  selectedId,
  onSelect,
  areas,
  header,
  labels = {},
  className,
}: {
  items: ConditionListItem[];
  selectedId?: string | null;
  onSelect?: (item: ConditionListItem) => void;
  areas?: { code: string; label: string }[];
  /** a pinned first row (e.g. the plant summary) */
  header?: React.ReactNode;
  labels?: {
    status?: Partial<Record<ConditionStatus, string>>;
    days?: (n: number) => string;
    points?: (n: number, planned: number) => string;
    alarms?: (n: number) => string;
    criticality?: (c: string) => string;
    scoreTitle?: string;
  };
  className?: string;
}) {
  const groups =
    areas ?? [...new Set(items.map((a) => a.area ?? ""))].map((code) => ({ code, label: code }));
  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      {header}
      {groups.map((g) => {
        const rows = items.filter((a) => (a.area ?? "") === g.code);
        if (!rows.length) return null;
        return (
          <div key={g.code}>
            <div className="sticky top-0 z-[1] border-b bg-card/95 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground backdrop-blur">
              {g.label} <span className="tabular-nums">· {rows.length}</span>
            </div>
            {rows.map((a) => {
              const m = CONDITION_STATUS[a.status];
              const on = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect?.(a)}
                  className={cn(
                    "grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-subtle/60",
                    on && "bg-subtle",
                  )}
                  style={on ? { boxShadow: `inset 2px 0 0 ${m.color}` } : undefined}
                >
                  <span
                    className="size-2 translate-y-[-1px] rounded-full"
                    style={{ background: m.color }}
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[12.5px] font-semibold">{a.tag}</span>
                      {a.criticality && (
                        <span className="text-[11px] text-muted-foreground">
                          {labels.criticality
                            ? labels.criticality(a.criticality)
                            : `Class ${a.criticality}`}
                        </span>
                      )}
                    </span>
                    <span
                      className="block truncate text-[12px] text-muted-foreground"
                      title={a.name}
                    >
                      {a.name}
                    </span>
                  </span>
                  <span className="grid w-16 justify-items-end gap-1 text-right">
                    {a.score != null ? (
                      <span
                        className="grid w-full gap-1"
                        title={labels.scoreTitle ?? "Health score"}
                      >
                        <span className="text-[13px] leading-none font-semibold tabular-nums">
                          {a.score}
                        </span>
                        <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${a.score}%`,
                              background: conditionGrade(a.score).color,
                            }}
                          />
                        </span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                    <span
                      className="text-[11px] leading-none whitespace-nowrap tabular-nums"
                      style={{ color: a.alarms ? m.color : "var(--muted-foreground)" }}
                    >
                      {a.alarms
                        ? labels.alarms
                          ? labels.alarms(a.alarms)
                          : `${a.alarms} alarm`
                        : a.next != null
                          ? labels.days
                            ? labels.days(Math.max(1, Math.round(a.next)))
                            : `~${Math.max(1, Math.round(a.next))} d`
                          : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vibration spectrum                                                  */
/* ------------------------------------------------------------------ */

export type SpectrumMarker = {
  hz: number;
  label: string;
  kind: "shaft" | "bpfo" | "bpfi" | "bsf" | "ftf";
};
const MARKER_COLOR: Record<SpectrumMarker["kind"], string> = {
  shaft: "var(--muted-foreground)",
  bpfo: "var(--sys-red)",
  bpfi: "var(--sys-orange)",
  bsf: "var(--sys-indigo)",
  ftf: "var(--sys-gray)",
};

/** Defect-frequency markers: 1×–3× running speed and three harmonics of each bearing tone. */
export function spectrumMarkers(
  f: { shaft: number; bpfo: number; bpfi: number; bsf: number; ftf: number } | null,
  shaftHz?: number | null,
): SpectrumMarker[] {
  const out: SpectrumMarker[] = [];
  const s = f?.shaft ?? shaftHz;
  if (s) for (let k = 1; k <= 3; k++) out.push({ hz: k * s, label: `${k}×`, kind: "shaft" });
  if (f)
    for (const [kind, hz, name] of [
      ["bpfo", f.bpfo, "BPFO"],
      ["bpfi", f.bpfi, "BPFI"],
      ["bsf", f.bsf, "BSF"],
    ] as const)
      for (let k = 1; k <= 3; k++)
        out.push({ hz: k * hz, label: k === 1 ? name : `${k}×${name}`, kind });
  return out;
}

/**
 * An FFT as an analyst reads it: amplitude per frequency, with dashed markers at running-speed harmonics and the
 * bearing defect tones of the bearing under the sensor. Hover reads frequency and amplitude.
 */
export function SpectrumChart({
  amplitudes,
  resolutionHz,
  unit = "mm/s",
  markers = [],
  maxHz,
  height = 220,
  className,
}: {
  amplitudes: number[];
  resolutionHz: number;
  unit?: string;
  markers?: SpectrumMarker[];
  maxHz?: number;
  height?: number;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const top = Math.min(
    amplitudes.length,
    Math.round((maxHz ?? amplitudes.length * resolutionHz) / resolutionHz),
  );
  const data = amplitudes.slice(0, top);
  const W = 1000;
  const H = 100;
  const peak = Math.max(...data, 1e-6) * 1.12;
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W;
  const y = (v: number) => H - (v / peak) * H;
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const hzMax = (data.length - 1) * resolutionHz;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * hzMax));
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-baseline justify-between text-[11.5px] text-muted-foreground">
        <span>{unit}</span>
        <span className="tabular-nums">
          {hover != null
            ? `${(hover * resolutionHz).toFixed(1)} Hz · ${data[hover]!.toFixed(3)} ${unit}`
            : `0–${hzMax.toFixed(0)} Hz`}
        </span>
      </div>
      <div
        className="relative rounded-lg border bg-card"
        style={{ height }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-label="Vibration spectrum"
        >
          {markers
            .filter((m) => m.hz <= hzMax)
            .map((m, i) => (
              <line
                key={i}
                x1={(m.hz / hzMax) * W}
                x2={(m.hz / hzMax) * W}
                y1={0}
                y2={H}
                stroke={MARKER_COLOR[m.kind]}
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                opacity={0.75}
              />
            ))}
          <path
            d={d}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={0}
              y2={H}
              stroke="var(--foreground)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              opacity={0.4}
            />
          )}
        </svg>
        {markers
          .filter(
            (m) =>
              m.hz <= hzMax &&
              !m.label.includes("×B") &&
              !m.label.startsWith("2×B") &&
              !m.label.startsWith("3×B"),
          )
          .map((m, i) => (
            <span
              key={i}
              className="absolute top-1 -translate-x-1/2 rounded bg-card/90 px-1 text-[10px] font-medium"
              style={{ left: `${(m.hz / hzMax) * 100}%`, color: MARKER_COLOR[m.kind] }}
            >
              {m.label}
            </span>
          ))}
      </div>
      <div className="relative h-3.5 text-[10.5px] text-muted-foreground tabular-nums">
        {ticks.map((t, i) => (
          <span
            key={i}
            className={cn(
              "absolute",
              i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}
          >
            {t} Hz
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field devices                                                       */
/* ------------------------------------------------------------------ */

export type FieldDevice = {
  id: string;
  kind: "sensor" | "gateway";
  model: string;
  name: string;
  eui: string;
  assetTag?: string;
  battery?: number | null;
  rssi?: number | null;
  snr?: number | null;
  lastSeen?: string | Date | null;
  issues: ("offline" | "battery" | "signal")[];
  detail?: string;
};

/** A sensor or gateway row: health dot, model and name, battery, radio (RSSI / SNR), last seen, issues in words. */
export function FieldDeviceRow({
  device,
  labels = {},
}: {
  device: FieldDevice;
  labels?: {
    issues?: Partial<Record<FieldDevice["issues"][number], string>>;
    ok?: string;
    ago?: (min: number) => string;
  };
}) {
  const color = device.issues.includes("offline")
    ? "var(--sys-red)"
    : device.issues.length
      ? "var(--sys-orange)"
      : "var(--sys-green)";
  const mins = device.lastSeen
    ? Math.max(0, Math.round((Date.now() - new Date(device.lastSeen).getTime()) / 60_000))
    : null;
  const bat = device.battery;
  return (
    <div className="grid grid-cols-[0.5rem_minmax(0,1fr)_7rem_7rem_6rem] items-center gap-x-3 px-3 py-2.5 text-[12.5px]">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="font-medium">{device.name}</span>
          <span className="text-[11.5px] text-muted-foreground">{device.model}</span>
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">
          {device.eui}
          {device.detail ? ` · ${device.detail}` : ""}
        </span>
      </span>
      <span>
        {bat != null ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, bat)}%`,
                  background:
                    bat < 20
                      ? "var(--sys-red)"
                      : bat < 40
                        ? "var(--sys-orange)"
                        : "var(--sys-green)",
                }}
              />
            </span>
            <span className="tabular-nums">{Math.round(bat)}%</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span
        className="tabular-nums"
        style={{ color: device.issues.includes("signal") ? "var(--sys-orange)" : undefined }}
      >
        {device.rssi != null ? `${device.rssi} dBm` : "—"}
        {device.snr != null ? (
          <span className="text-muted-foreground"> · {device.snr} dB</span>
        ) : null}
      </span>
      <span className="text-right">
        {device.issues.length ? (
          <span style={{ color }}>
            {device.issues.map((i) => labels.issues?.[i] ?? i).join(", ")}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {mins != null
              ? labels.ago
                ? labels.ago(mins)
                : `${mins} min ago`
              : (labels.ok ?? "OK")}
          </span>
        )}
      </span>
    </div>
  );
}
