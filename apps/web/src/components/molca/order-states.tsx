import * as React from "react";
import {
  CircleCheck,
  CircleDot,
  Eraser,
  Hourglass,
  Lock,
  OctagonX,
  Pause,
  Play,
  RotateCcw,
  Square,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Tones — Molca status tokens, IEC 60073 meaning                       */
/* ------------------------------------------------------------------ */

/** run = green normal · small = amber abnormal · unplanned = red fault · planned = blue mandatory action · off = grey neutral */
export type StateTone = "run" | "small" | "unplanned" | "planned" | "off";

export const TONE_COLOR: Record<StateTone, string> = {
  run: "var(--st-run)",
  small: "var(--st-small)",
  unplanned: "var(--st-unplanned)",
  planned: "var(--st-planned)",
  off: "var(--st-off)",
};

export type StateMeta = {
  label: string;
  tone: StateTone;
  icon: LucideIcon;
  acting?: boolean;
  description: string;
};

/* ------------------------------------------------------------------ */
/* ISA-95 job order states                                              */
/* ------------------------------------------------------------------ */

export type JobOrderState =
  | "waiting"
  | "ready"
  | "running"
  | "held"
  | "suspended"
  | "completed"
  | "aborted"
  | "closed";

export const JOB_ORDER_STATES: Record<JobOrderState, StateMeta> = {
  waiting: {
    label: "Waiting",
    tone: "off",
    icon: Hourglass,
    description: "Released but not yet dispatchable (material, resources or predecessors missing).",
  },
  ready: {
    label: "Ready",
    tone: "planned",
    icon: CircleDot,
    description: "Dispatched to the work center, all prerequisites met — waiting for start.",
  },
  running: {
    label: "Running",
    tone: "run",
    icon: Play,
    description: "Being executed on the equipment.",
  },
  held: {
    label: "Held",
    tone: "small",
    icon: Pause,
    description: "Paused by a hold command (e.g. quality hold); resumes with Restart.",
  },
  suspended: {
    label: "Suspended",
    tone: "small",
    icon: Clock,
    description:
      "Paused by an external condition (e.g. upstream starved); resumes automatically or on command.",
  },
  completed: {
    label: "Completed",
    tone: "run",
    icon: CircleCheck,
    description: "Execution finished; actuals reported.",
  },
  aborted: {
    label: "Aborted",
    tone: "unplanned",
    icon: OctagonX,
    description: "Terminated before completion.",
  },
  closed: {
    label: "Closed",
    tone: "off",
    icon: Lock,
    description: "Archived; no further changes.",
  },
};

/* ------------------------------------------------------------------ */
/* ISA-TR88.00.02 (PackML) machine states                               */
/* ------------------------------------------------------------------ */

export type PackMLState =
  | "idle"
  | "starting"
  | "execute"
  | "completing"
  | "complete"
  | "resetting"
  | "holding"
  | "held"
  | "unholding"
  | "suspending"
  | "suspended"
  | "unsuspending"
  | "stopping"
  | "stopped"
  | "aborting"
  | "aborted"
  | "clearing";

export const PACKML_STATES: Record<PackMLState, StateMeta> = {
  idle: {
    label: "Idle",
    tone: "planned",
    icon: CircleDot,
    description: "Reset and ready — waiting for a Start command.",
  },
  starting: {
    label: "Starting",
    tone: "run",
    icon: Play,
    acting: true,
    description: "Running the start-up sequence.",
  },
  execute: { label: "Execute", tone: "run", icon: Play, description: "Producing." },
  completing: {
    label: "Completing",
    tone: "planned",
    icon: CircleCheck,
    acting: true,
    description: "Finishing the order (e.g. target count reached).",
  },
  complete: {
    label: "Complete",
    tone: "planned",
    icon: CircleCheck,
    description: "Order done — waiting for Reset.",
  },
  resetting: {
    label: "Resetting",
    tone: "planned",
    icon: RotateCcw,
    acting: true,
    description: "Returning to Idle.",
  },
  holding: {
    label: "Holding",
    tone: "small",
    icon: Pause,
    acting: true,
    description: "Going to Held after an internal condition (e.g. material jam, operator hold).",
  },
  held: {
    label: "Held",
    tone: "small",
    icon: Pause,
    description: "Paused for an internal reason — needs operator action, then Unhold.",
  },
  unholding: {
    label: "Unholding",
    tone: "run",
    icon: Play,
    acting: true,
    description: "Returning to Execute from Held.",
  },
  suspending: {
    label: "Suspending",
    tone: "small",
    icon: Hourglass,
    acting: true,
    description: "Going to Suspended after an external condition (starved / blocked).",
  },
  suspended: {
    label: "Suspended",
    tone: "small",
    icon: Hourglass,
    description: "Waiting for upstream / downstream — no operator action needed.",
  },
  unsuspending: {
    label: "Unsuspending",
    tone: "run",
    icon: Play,
    acting: true,
    description: "Returning to Execute from Suspended.",
  },
  stopping: {
    label: "Stopping",
    tone: "off",
    icon: Square,
    acting: true,
    description: "Controlled stop sequence.",
  },
  stopped: {
    label: "Stopped",
    tone: "off",
    icon: Square,
    description: "Powered, stopped — waiting for Reset.",
  },
  aborting: {
    label: "Aborting",
    tone: "unplanned",
    icon: OctagonX,
    acting: true,
    description: "Quick, safe stop (e-stop, fault).",
  },
  aborted: {
    label: "Aborted",
    tone: "unplanned",
    icon: OctagonX,
    description: "Stopped by a fault or e-stop — needs Clear.",
  },
  clearing: {
    label: "Clearing",
    tone: "off",
    icon: Eraser,
    acting: true,
    description: "Clearing faults, going to Stopped.",
  },
};

/* ------------------------------------------------------------------ */
/* Badges                                                               */
/* ------------------------------------------------------------------ */

/** Neutral pill: tone lives in the icon; acting (transient “-ing”) states get a dashed border. */
export function StateBadge({
  meta,
  size = "md",
  className,
}: {
  meta: StateMeta;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = meta.icon;
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card font-medium whitespace-nowrap text-foreground",
        size === "sm" ? "h-5 px-1.5 text-[11.5px]" : "h-6 px-2 text-[12.5px]",
        meta.acting && "border-dashed border-foreground/40",
        className,
      )}
    >
      <Icon
        className={size === "sm" ? "size-3" : "size-3.5"}
        style={{ color: TONE_COLOR[meta.tone] }}
        strokeWidth={2.5}
      />
      {meta.label}
    </span>
  );
}

export function JobOrderStateBadge({
  state,
  size,
  className,
}: {
  state: JobOrderState;
  size?: "sm" | "md";
  className?: string;
}) {
  return <StateBadge meta={JOB_ORDER_STATES[state]} size={size} className={className} />;
}

export function PackMLStateBadge({
  state,
  size,
  className,
}: {
  state: PackMLState;
  size?: "sm" | "md";
  className?: string;
}) {
  return <StateBadge meta={PACKML_STATES[state]} size={size} className={className} />;
}

/* ------------------------------------------------------------------ */
/* State-model diagram                                                  */
/* ------------------------------------------------------------------ */

type Node<S extends string> = { id: S; col: number; row: number };
type Edge<S extends string> = { from: S; to: S; label?: string; both?: boolean; route?: "top" };

const COL = 112;
const ROW = 54;
const BW = 98;
const BH = 30;
const PAD_X = 10;
const PAD_TOP = 26;

function center(col: number, row: number) {
  return { x: PAD_X + col * COL + BW / 2, y: PAD_TOP + row * ROW + BH / 2 };
}
function clip(dx: number, dy: number) {
  const tx = dx ? BW / 2 / Math.abs(dx) : Infinity;
  const ty = dy ? BH / 2 / Math.abs(dy) : Infinity;
  return Math.min(tx, ty);
}

function StateDiagram<S extends string>({
  nodes,
  edges,
  meta,
  current,
  onSelect,
  stubs = [],
  label,
}: {
  nodes: Node<S>[];
  edges: Edge<S>[];
  meta: Record<S, StateMeta>;
  current?: S;
  onSelect?: (s: S) => void;
  stubs?: { to: S; label: string }[];
  label: string;
}) {
  const id = React.useId().replace(/:/g, "");
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;
  const W = PAD_X * 2 + (cols - 1) * COL + BW;
  const H = PAD_TOP + (rows - 1) * ROW + BH + 12;
  const pos = Object.fromEntries(nodes.map((n) => [n.id, center(n.col, n.row)])) as Record<
    S,
    { x: number; y: number }
  >;
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[560px]"
        role="group"
        aria-label={label}
      >
        <defs>
          <marker
            id={`${id}-a`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 8 4 0 8z" fill="var(--muted-foreground)" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos[e.from];
          const b = pos[e.to];
          if (e.route === "top") {
            const y = 8;
            return (
              <path
                key={i}
                d={`M ${a.x} ${a.y - BH / 2} V ${y} H ${b.x} V ${b.y - BH / 2 - 2}`}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth={1.2}
                markerEnd={`url(#${id}-a)`}
                strokeDasharray="3 3"
              />
            );
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const off = e.both ? 4 : 0;
          const ox = -uy * off;
          const oy = ux * off;
          const t = clip(ux, uy);
          const lines = [
            [
              a.x + ux * t + ox,
              a.y + uy * t + oy,
              b.x - ux * (t + 2) + ox,
              b.y - uy * (t + 2) + oy,
            ],
          ];
          if (e.both)
            lines.push([
              b.x - ux * t - ox,
              b.y - uy * t - oy,
              a.x + ux * (t + 2) - ox,
              a.y + uy * (t + 2) - oy,
            ]);
          return (
            <g key={i}>
              {lines.map(([x1, y1, x2, y2], j) => (
                <line
                  key={j}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.2}
                  markerEnd={`url(#${id}-a)`}
                />
              ))}
            </g>
          );
        })}
        {stubs.map((s) => {
          const b = pos[s.to];
          return (
            <g key={s.label}>
              <line
                x1={b.x + BW / 2 + 40}
                y1={b.y}
                x2={b.x + BW / 2 + 2}
                y2={b.y}
                stroke="var(--muted-foreground)"
                strokeWidth={1.2}
                strokeDasharray="3 3"
                markerEnd={`url(#${id}-a)`}
              />
              <text
                x={b.x + BW / 2 + 44}
                y={b.y + 3.5}
                fontSize={10.5}
                fill="var(--muted-foreground)"
              >
                {s.label}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const m = meta[n.id];
          const c = pos[n.id];
          const on = current === n.id;
          const color = TONE_COLOR[m.tone];
          return (
            <g
              key={n.id}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-pressed={onSelect ? on : undefined}
              aria-label={`${m.label}${m.acting ? " (acting state)" : ""}${on ? ", current" : ""}`}
              onClick={() => onSelect?.(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(n.id);
                }
              }}
              className={cn(
                onSelect &&
                  "cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[var(--ring)]",
              )}
            >
              <rect
                x={c.x - BW / 2 - 4}
                y={c.y - BH / 2 - 4}
                width={BW + 8}
                height={BH + 8}
                rx={11}
                fill="none"
                stroke={on ? "var(--ring)" : "transparent"}
                strokeWidth={2}
              />
              <rect
                x={c.x - BW / 2}
                y={c.y - BH / 2}
                width={BW}
                height={BH}
                rx={8}
                fill={
                  on
                    ? `color-mix(in srgb, ${color} 26%, var(--card))`
                    : `color-mix(in srgb, ${color} 10%, var(--card))`
                }
                stroke={color}
                strokeWidth={on ? 1.75 : 1.25}
                strokeDasharray={m.acting ? "4 3" : undefined}
              />
              <text
                x={c.x}
                y={c.y + 4}
                fontSize={11.5}
                fontWeight={on ? 650 : 500}
                textAnchor="middle"
                fill="var(--foreground)"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const JOB_NODES: Node<JobOrderState>[] = [
  { id: "waiting", col: 0, row: 1 },
  { id: "ready", col: 1, row: 1 },
  { id: "running", col: 2, row: 1 },
  { id: "completed", col: 3, row: 1 },
  { id: "closed", col: 4, row: 1 },
  { id: "held", col: 2, row: 0 },
  { id: "suspended", col: 3, row: 0 },
  { id: "aborted", col: 3, row: 2 },
];
const JOB_EDGES: Edge<JobOrderState>[] = [
  { from: "waiting", to: "ready" },
  { from: "ready", to: "running" },
  { from: "running", to: "completed" },
  { from: "completed", to: "closed" },
  { from: "running", to: "held", both: true },
  { from: "running", to: "suspended", both: true },
  { from: "running", to: "aborted" },
  { from: "aborted", to: "closed" },
];

/** ISA-95 job order state model. Click a state to select it. */
export function JobOrderStateDiagram({
  current,
  onSelect,
  className,
}: {
  current?: JobOrderState;
  onSelect?: (s: JobOrderState) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <StateDiagram
        nodes={JOB_NODES}
        edges={JOB_EDGES}
        meta={JOB_ORDER_STATES}
        current={current}
        onSelect={onSelect}
        label="ISA-95 job order state model"
      />
    </div>
  );
}

const PML_NODES: Node<PackMLState>[] = [
  { id: "unholding", col: 2, row: 0 },
  { id: "held", col: 3, row: 0 },
  { id: "holding", col: 4, row: 0 },
  { id: "resetting", col: 0, row: 1 },
  { id: "idle", col: 1, row: 1 },
  { id: "starting", col: 2, row: 1 },
  { id: "execute", col: 3, row: 1 },
  { id: "completing", col: 4, row: 1 },
  { id: "complete", col: 5, row: 1 },
  { id: "unsuspending", col: 2, row: 2 },
  { id: "suspended", col: 3, row: 2 },
  { id: "suspending", col: 4, row: 2 },
  { id: "stopped", col: 0, row: 3 },
  { id: "stopping", col: 1, row: 3 },
  { id: "clearing", col: 0, row: 4 },
  { id: "aborted", col: 1, row: 4 },
  { id: "aborting", col: 2, row: 4 },
];
const PML_EDGES: Edge<PackMLState>[] = [
  { from: "resetting", to: "idle" },
  { from: "idle", to: "starting" },
  { from: "starting", to: "execute" },
  { from: "execute", to: "completing" },
  { from: "completing", to: "complete" },
  { from: "complete", to: "resetting", route: "top" },
  { from: "execute", to: "holding" },
  { from: "holding", to: "held" },
  { from: "held", to: "unholding" },
  { from: "unholding", to: "execute" },
  { from: "execute", to: "suspending" },
  { from: "suspending", to: "suspended" },
  { from: "suspended", to: "unsuspending" },
  { from: "unsuspending", to: "execute" },
  { from: "stopping", to: "stopped" },
  { from: "stopped", to: "resetting" },
  { from: "aborting", to: "aborted" },
  { from: "aborted", to: "clearing" },
  { from: "clearing", to: "stopped" },
];

/** ISA-TR88.00.02 (PackML) machine state model — 17 states. Click a state to select it. */
export function PackMLStateDiagram({
  current,
  onSelect,
  className,
}: {
  current?: PackMLState;
  onSelect?: (s: PackMLState) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <StateDiagram
        nodes={PML_NODES}
        edges={PML_EDGES}
        meta={PACKML_STATES}
        current={current}
        onSelect={onSelect}
        stubs={[
          {
            to: "stopping",
            label: "Stop — from any state except Stopped / Aborting / Aborted / Clearing",
          },
          { to: "aborting", label: "Abort — from any state" },
        ]}
        label="PackML machine state model"
      />
    </div>
  );
}
