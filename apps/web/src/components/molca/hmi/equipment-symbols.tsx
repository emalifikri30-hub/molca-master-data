"use client";

import * as React from "react";
import type { AlarmPriority } from "@/components/molca/alarm-list";
import { cn } from "@/lib/utils";
import { ALARM_COLOR, HmiStyle, hmi, useSvgId } from "./hmi-theme";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * Equipment state (ISA-101): running/open = filled dark grey, stopped/closed = outline,
 * transition = half-tone + dashed outline, fault = outline in alarm colour + priority marker.
 */
export type EquipmentState = "running" | "stopped" | "open" | "closed" | "transition" | "fault";

export const EQUIPMENT_STATE_LABEL: Record<EquipmentState, string> = {
  running: "Running",
  stopped: "Stopped",
  open: "Open",
  closed: "Closed",
  transition: "In transition",
  fault: "Fault",
};

export type EquipmentProps = {
  /** Centre of the symbol in the parent SVG's user units */
  x: number;
  y: number;
  /** ISA-5.1 tag, e.g. "P-101" */
  tag?: string;
  /** Short description for the accessible name, e.g. "Syrup feed pump" */
  label?: string;
  state?: EquipmentState;
  /** Active alarm on this equipment — priority colour + shape + number */
  alarm?: AlarmPriority;
  /** Alarm is unacknowledged (marker blinks at 1 Hz, stops under reduced motion) */
  alarmUnack?: boolean;
  /** Operator has taken manual control (shows an “M” box) */
  manual?: boolean;
  /** A permissive / trip interlock is active (shows an “I” box) */
  interlocked?: boolean;
  /** Where the tag text sits */
  tagPosition?: "top" | "bottom" | "left" | "right" | "none";
  scale?: number;
  /** Rotation of the body in degrees (tag text stays upright) */
  rotate?: number;
  selected?: boolean;
  /** Makes the symbol a button (click / Enter / Space) — e.g. open its faceplate */
  onSelect?: () => void;
};

function look(state: EquipmentState = "stopped", alarm?: AlarmPriority) {
  const on = state === "running" || state === "open";
  const fault = state === "fault";
  return {
    on,
    fill: on ? hmi.fill : state === "transition" ? hmi.fillHalf : hmi.bg,
    inner: on ? hmi.bg : hmi.line,
    stroke: fault ? ALARM_COLOR[alarm ?? "high"].fill : hmi.line,
    strokeWidth: fault ? 2.5 : 1.75,
    dash: state === "transition" ? "4 2.5" : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const MARKER_SHAPES: Record<AlarmPriority, (s: number) => React.ReactNode> = {
  critical: (s) => (
    <path
      d={`M${-s * 0.35},${-s / 2}h${s * 0.7}l${s * 0.15},${s * 0.15}v${s * 0.7}l${-s * 0.15},${s * 0.15}h${-s * 0.7}l${-s * 0.15},${-s * 0.15}v${-s * 0.7}z`}
    />
  ),
  high: (s) => <path d={`M0,${-s / 2}L${s / 2},${s * 0.42}H${-s / 2}z`} />,
  medium: (s) => <path d={`M0,${-s / 2}L${s / 2},0L0,${s / 2}L${-s / 2},0z`} />,
  low: (s) => <circle r={s / 2} />,
  info: (s) => <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.12} />,
};

/** ISA-18.2 priority marker for use inside SVG: colour + shape + number. */
export function AlarmMarker({
  x,
  y,
  priority,
  unack = false,
  size = 16,
}: {
  x: number;
  y: number;
  priority: AlarmPriority;
  unack?: boolean;
  size?: number;
}) {
  const c = ALARM_COLOR[priority];
  return (
    <g transform={`translate(${x},${y})`} className={cn(unack && "hmi-blink")} aria-hidden>
      <g fill={c.fill} stroke={hmi.bg} strokeWidth={1}>
        {MARKER_SHAPES[priority](size)}
      </g>
      <text
        y={priority === "high" ? size * 0.3 : size * 0.22}
        fontSize={size * 0.55}
        fontWeight={700}
        textAnchor="middle"
        fill={c.ink}
      >
        {c.number}
      </text>
    </g>
  );
}

/** Small boxed letter: “M” manual, “I” interlock, “C” cascade … (no colour — text coded). */
export function IndicatorBox({ x, y, text }: { x: number; y: number; text: string }) {
  const w = 8 + text.length * 6;
  return (
    <g transform={`translate(${x},${y})`} aria-hidden>
      <rect
        x={-w / 2}
        y={-7}
        width={w}
        height={14}
        rx={2}
        fill={hmi.surface}
        stroke={hmi.text}
        strokeWidth={1.25}
      />
      <text y={3.6} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={hmi.text}>
        {text}
      </text>
    </g>
  );
}

/**
 * Shared shell: positioning, tag text, indicators, focus/selection ring, keyboard support.
 * `w`/`h` = body extents (centred at 0,0).
 */
function Shell({
  p,
  w,
  h,
  kind,
  children,
  ownAlarm = false,
  extra,
}: {
  p: EquipmentProps;
  w: number;
  h: number;
  kind: string;
  children: React.ReactNode;
  ownAlarm?: boolean;
  extra?: string;
}) {
  const {
    x,
    y,
    tag,
    label,
    state = "stopped",
    alarm,
    alarmUnack,
    manual,
    interlocked,
    tagPosition = "bottom",
    scale = 1,
    rotate = 0,
    selected,
    onSelect,
  } = p;
  const effAlarm = alarm ?? (state === "fault" ? "high" : undefined);
  const interactive = !!onSelect;
  const name = [
    tag,
    label,
    extra ?? EQUIPMENT_STATE_LABEL[state],
    effAlarm && `${ALARM_COLOR[effAlarm].label} alarm${alarmUnack ? " unacknowledged" : ""}`,
    manual && "manual",
    interlocked && "interlock active",
  ]
    .filter(Boolean)
    .join(", ");
  const pad = 5;
  const tagPos = {
    top: { x: 0, y: -h / 2 - 7, anchor: "middle" },
    bottom: { x: 0, y: h / 2 + 14, anchor: "middle" },
    left: { x: -w / 2 - 6, y: 4, anchor: "end" },
    right: { x: w / 2 + 6, y: 4, anchor: "start" },
    none: null,
  }[tagPosition];
  // indicators stack at the top-right corner
  const ind: React.ReactNode[] = [];
  let ix = w / 2 + 4;
  const iy = -h / 2 - 2;
  if (effAlarm && !ownAlarm) {
    ind.push(<AlarmMarker key="a" x={ix + 6} y={iy} priority={effAlarm} unack={alarmUnack} />);
    ix += 18;
  }
  if (manual) {
    ind.push(<IndicatorBox key="m" x={ix + 7} y={iy} text="M" />);
    ix += 18;
  }
  if (interlocked) {
    ind.push(<IndicatorBox key="i" x={ix + 6} y={iy} text="I" />);
  }
  return (
    <g
      transform={`translate(${x},${y}) scale(${scale})`}
      className={cn("hmi-eq", interactive && "cursor-pointer")}
      data-selected={selected ? "true" : undefined}
      data-kind={kind}
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={name}
      aria-pressed={interactive ? !!selected : undefined}
      onClick={onSelect}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      {interactive && (
        <rect
          className="hmi-hover"
          x={-w / 2 - pad}
          y={-h / 2 - pad}
          width={w + pad * 2}
          height={h + pad * 2}
          rx={4}
          fill={hmi.track}
        />
      )}
      <rect
        className="hmi-ring"
        x={-w / 2 - pad}
        y={-h / 2 - pad}
        width={w + pad * 2}
        height={h + pad * 2}
        rx={4}
        fill="none"
        stroke={hmi.focus}
        strokeWidth={2}
      />
      <g transform={rotate ? `rotate(${rotate})` : undefined}>{children}</g>
      {tag && tagPos && (
        <text
          x={tagPos.x}
          y={tagPos.y}
          fontSize={11}
          fontWeight={600}
          textAnchor={tagPos.anchor as "middle"}
          fill={hmi.text}
          className="font-mono"
        >
          {tag}
          {state === "fault" && <tspan fontWeight={700}> FLT</tspan>}
        </text>
      )}
      {ind}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Symbols (ISA-5.1 / ISO 10628, simplified)                           */
/* ------------------------------------------------------------------ */

/** Centrifugal pump: circle with discharge triangle. */
export function Pump(p: EquipmentProps) {
  const l = look(p.state, p.alarm);
  return (
    <Shell p={p} w={34} h={34} kind="pump">
      <path d="M0,-16 H19" stroke={l.stroke} strokeWidth={l.strokeWidth} />
      <circle
        r={16}
        fill={l.fill}
        stroke={l.stroke}
        strokeWidth={l.strokeWidth}
        strokeDasharray={l.dash}
      />
      <path
        d="M-7,-9 L11,0 L-7,9 Z"
        fill={l.on ? hmi.bg : "none"}
        stroke={l.on ? "none" : l.inner}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Shell>
  );
}

/** Electric motor: circle with “M”. */
export function Motor(p: EquipmentProps) {
  const l = look(p.state, p.alarm);
  return (
    <Shell p={p} w={28} h={28} kind="motor">
      <circle
        r={13}
        fill={l.fill}
        stroke={l.stroke}
        strokeWidth={l.strokeWidth}
        strokeDasharray={l.dash}
      />
      <text y={4.5} fontSize={13} fontWeight={700} textAnchor="middle" fill={l.inner}>
        M
      </text>
    </Shell>
  );
}

export type ValveProps = EquipmentProps & {
  /** control = diaphragm actuator (modulating), onoff = square actuator, none = manual valve */
  actuator?: "control" | "onoff" | "none";
  /** Valve position 0–100 % shown under the tag (control valves) */
  position?: number;
};

/** Two-way valve (bow-tie). Open = filled, closed = outline. */
export function Valve({ actuator = "control", position, ...p }: ValveProps) {
  const l = look(p.state, p.alarm);
  const half = p.state === "transition";
  return (
    <Shell
      p={{ ...p, tagPosition: p.tagPosition ?? "bottom" }}
      w={30}
      h={actuator === "none" ? 20 : 34}
      kind="valve"
    >
      <g transform={actuator === "none" ? undefined : "translate(0,7)"}>
        <path
          d="M-14,-9 L0,0 L-14,9 Z"
          fill={half ? hmi.fill : l.fill}
          stroke={l.stroke}
          strokeWidth={l.strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M14,-9 L0,0 L14,9 Z"
          fill={half ? hmi.bg : l.fill}
          stroke={l.stroke}
          strokeWidth={l.strokeWidth}
          strokeLinejoin="round"
        />
        {actuator !== "none" && <path d="M0,0 V-14" stroke={hmi.line} strokeWidth={1.5} />}
        {actuator === "control" && (
          <path d="M-9,-14 A9,9 0 0 1 9,-14 Z" fill={hmi.bg} stroke={hmi.line} strokeWidth={1.5} />
        )}
        {actuator === "onoff" && (
          <rect
            x={-6}
            y={-24}
            width={12}
            height={10}
            fill={hmi.bg}
            stroke={hmi.line}
            strokeWidth={1.5}
          />
        )}
      </g>
      {position !== undefined && (
        <text
          x={0}
          y={actuator === "none" ? 36 : 43}
          fontSize={10.5}
          textAnchor="middle"
          fill={hmi.textMuted}
          className="tabular-nums"
        >
          {Math.round(position)} %
        </text>
      )}
    </Shell>
  );
}

export type TankProps = EquipmentProps & {
  width?: number;
  height?: number;
  /** Liquid level 0–100 % (grey fill — level is not a state colour) */
  level: number;
  /** Optional alarm limit marks in % (drawn as ticks on the wall) */
  limits?: { hh?: number; h?: number; l?: number; ll?: number };
  /** Draw an agitator with this motor state */
  agitator?: EquipmentState;
  /** Show the level as text inside the vessel */
  showLevel?: boolean;
};

/** Vertical vessel with elliptical heads, level fill, optional agitator. */
export function Tank({
  width = 120,
  height = 200,
  level,
  limits,
  agitator,
  showLevel = true,
  ...p
}: TankProps) {
  const id = useSvgId("tank");
  const l = look(p.state === "fault" ? "fault" : "stopped", p.alarm);
  const top = -height / 2;
  const lv = Math.max(0, Math.min(100, level));
  const ly = height / 2 - (height * lv) / 100;
  const ry = Math.min(22, width / 4);
  const mark = (v: number | undefined, t: string) =>
    v === undefined ? null : (
      <g key={t}>
        <path
          d={`M${width / 2},${height / 2 - (height * v) / 100} h7`}
          stroke={hmi.line}
          strokeWidth={t.length === 2 ? 2 : 1.25}
        />
        <text
          x={width / 2 + 10}
          y={height / 2 - (height * v) / 100 + 3.5}
          fontSize={9}
          fill={hmi.textMuted}
        >
          {t.toUpperCase()}
        </text>
      </g>
    );
  const ag = agitator ? look(agitator) : null;
  return (
    <Shell p={{ ...p, tagPosition: p.tagPosition ?? "bottom" }} w={width} h={height} kind="tank">
      <defs>
        <clipPath id={id}>
          <rect x={-width / 2} y={top} width={width} height={height} rx={width / 2} ry={ry} />
        </clipPath>
      </defs>
      <rect
        x={-width / 2}
        y={top}
        width={width}
        height={height}
        rx={width / 2}
        ry={ry}
        fill={hmi.bg}
      />
      <rect
        x={-width / 2}
        y={ly}
        width={width}
        height={height - (height * lv) / 100}
        fill={hmi.liquid}
        clipPath={`url(#${id})`}
      />
      <path
        d={`M${-width / 2},${ly} H${width / 2}`}
        stroke={hmi.line}
        strokeWidth={1}
        clipPath={`url(#${id})`}
      />
      <rect
        x={-width / 2}
        y={top}
        width={width}
        height={height}
        rx={width / 2}
        ry={ry}
        fill="none"
        stroke={l.stroke}
        strokeWidth={l.strokeWidth + 0.25}
      />
      {limits && [
        mark(limits.hh, "hh"),
        mark(limits.h, "h"),
        mark(limits.l, "l"),
        mark(limits.ll, "ll"),
      ]}
      {ag && (
        <g>
          <path d={`M0,${top - 14} V${height * 0.22}`} stroke={hmi.line} strokeWidth={2} />
          <path
            d={`M-18,${height * 0.22 - 5} L18,${height * 0.22 + 5} M-18,${height * 0.22 + 5} L18,${height * 0.22 - 5}`}
            stroke={hmi.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle
            cy={top - 26}
            r={12}
            fill={ag.fill}
            stroke={ag.stroke}
            strokeWidth={ag.strokeWidth}
            strokeDasharray={ag.dash}
          />
          <text y={top - 21.5} fontSize={12} fontWeight={700} textAnchor="middle" fill={ag.inner}>
            M
          </text>
        </g>
      )}
      {showLevel && (
        <text
          y={ag ? height * 0.22 + 26 : 4}
          fontSize={13}
          fontWeight={600}
          textAnchor="middle"
          fill={hmi.text}
          className="tabular-nums"
        >
          {lv.toFixed(1)} %
        </text>
      )}
    </Shell>
  );
}

/** Shell-and-tube heat exchanger (circle with tube pass). Passive — stays grey unless faulted. */
export function HeatExchanger(p: EquipmentProps) {
  const l = look(p.state === "fault" ? "fault" : "stopped", p.alarm);
  return (
    <Shell p={p} w={40} h={40} kind="heat-exchanger">
      <circle r={19} fill={hmi.bg} stroke={l.stroke} strokeWidth={l.strokeWidth} />
      <path
        d="M-19,5 H-10 L-5,-7 L1,7 L7,-7 L11,5 H19"
        fill="none"
        stroke={hmi.line}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Shell>
  );
}

export type ConveyorProps = EquipmentProps & { length?: number };

/** Belt conveyor: belt + head/tail pulleys. Running = filled belt. */
export function Conveyor({ length = 160, ...p }: ConveyorProps) {
  const l = look(p.state, p.alarm);
  const hl = length / 2;
  return (
    <Shell p={p} w={length} h={18} kind="conveyor">
      <rect
        x={-hl}
        y={-8}
        width={length}
        height={16}
        rx={8}
        fill={l.fill}
        stroke={l.stroke}
        strokeWidth={l.strokeWidth}
        strokeDasharray={l.dash}
      />
      <circle cx={-hl + 8} r={4.5} fill={hmi.bg} stroke={hmi.line} strokeWidth={1.25} />
      <circle cx={hl - 8} r={4.5} fill={hmi.bg} stroke={hmi.line} strokeWidth={1.25} />
      <path
        d={`M-10,0 H8 M3,-4 L8,0 L3,4`}
        fill="none"
        stroke={l.inner}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Shell>
  );
}

export type InstrumentProps = Omit<EquipmentProps, "state" | "rotate"> & {
  /** ISA-5.1 tag, e.g. "TT-101" — letters on top, loop number below */
  tag: string;
  /** field = plain circle, panel = line through (control room), dcs = circle in square (shared display) */
  location?: "field" | "panel" | "dcs";
  value?: number;
  unit?: string;
  decimals?: number;
  /** Side for the value readout */
  valueSide?: "right" | "left" | "bottom";
};

/** Instrument bubble with optional value readout. In alarm the readout gets a priority-coloured frame + marker. */
export function Instrument({
  location = "dcs",
  value,
  unit,
  decimals = 1,
  valueSide = "right",
  ...p
}: InstrumentProps) {
  const [fn, loop] = p.tag.split("-");
  const r = 16;
  const c = p.alarm ? ALARM_COLOR[p.alarm] : null;
  const txt = value === undefined ? null : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  const tw = txt ? txt.length * 6.6 + 12 : 0;
  const vx = valueSide === "right" ? r + 6 : valueSide === "left" ? -r - 6 - tw : -tw / 2;
  const vy = valueSide === "bottom" ? r + 5 : -10;
  return (
    <Shell
      p={{ ...p, tagPosition: "none" }}
      w={r * 2}
      h={r * 2}
      kind="instrument"
      ownAlarm
      extra={txt ?? "instrument"}
    >
      {location === "dcs" && (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          fill={hmi.bg}
          stroke={hmi.line}
          strokeWidth={1.25}
        />
      )}
      <circle r={r} fill={hmi.bg} stroke={hmi.line} strokeWidth={1.5} />
      {location === "panel" && <path d={`M${-r},0 H${r}`} stroke={hmi.line} strokeWidth={1.25} />}
      <text y={-2} fontSize={10} fontWeight={700} textAnchor="middle" fill={hmi.text}>
        {fn}
      </text>
      <text y={10} fontSize={9.5} textAnchor="middle" fill={hmi.text} className="tabular-nums">
        {loop}
      </text>
      {txt && (
        <g transform={`translate(${vx},${vy})`}>
          <rect
            width={tw}
            height={20}
            rx={3}
            fill={hmi.surface}
            stroke={c ? c.fill : hmi.pipeIdle}
            strokeWidth={c ? 2.25 : 1}
          />
          <text
            x={tw / 2}
            y={14}
            fontSize={11.5}
            fontWeight={c ? 700 : 600}
            textAnchor="middle"
            fill={hmi.text}
            className="tabular-nums"
          >
            {txt}
          </text>
          {p.alarm && (
            <AlarmMarker x={tw + 2} y={0} priority={p.alarm} unack={p.alarmUnack} size={15} />
          )}
        </g>
      )}
      {!txt && p.alarm && (
        <AlarmMarker x={r + 2} y={-r} priority={p.alarm} unack={p.alarmUnack} size={15} />
      )}
    </Shell>
  );
}

export type PipeProps = {
  /** Polyline points [[x,y], …] */
  points: [number, number][];
  /** flow = normal process line, idle = no flow (lighter, thinner), signal = dashed instrument signal */
  variant?: "flow" | "idle" | "signal";
  /** Draw a flow arrow at the end */
  arrow?: boolean;
};

/** Process line. Static (no animated flow — ISA-101 avoids gratuitous animation). */
export function Pipe({ points, variant = "flow", arrow = false }: PipeProps) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const stroke = variant === "flow" ? hmi.pipe : variant === "idle" ? hmi.pipeIdle : hmi.signal;
  const w = variant === "signal" ? 1 : variant === "idle" ? 2.5 : 3.5;
  let head: React.ReactNode = null;
  if (arrow && points.length > 1) {
    const [x1, y1] = points[points.length - 2];
    const [x2, y2] = points[points.length - 1];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = 9;
    const p1 = [x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)];
    const p2 = [x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)];
    head = <path d={`M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z`} fill={stroke} />;
  }
  return (
    <g aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={w}
        strokeLinejoin="round"
        strokeDasharray={variant === "signal" ? "4 3" : undefined}
      />
      {head}
    </g>
  );
}

/** Plain text label inside an HMI graphic (equipment names, destinations). */
export function HmiLabel({
  x,
  y,
  children,
  anchor = "start",
  muted = true,
  size = 11,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
  muted?: boolean;
  size?: number;
}) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={muted ? hmi.textMuted : hmi.text}>
      {children}
    </text>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export type HmiCanvasProps = {
  width: number;
  height: number;
  /** Accessible title of the display */
  title: string;
  /** Draw the ISA-101 grey background (default true) */
  background?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** SVG root for HMI graphics: grey background, HMI palette, scales to its container width. */
export function HmiCanvas({
  width,
  height,
  title,
  background = true,
  className,
  children,
}: HmiCanvasProps) {
  const id = useSvgId("hmi-title");
  return (
    <>
      <HmiStyle />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("molca-hmi block h-auto w-full font-sans select-none", className)}
        role="group"
        aria-labelledby={id}
      >
        <title id={id}>{title}</title>
        {background && <rect width={width} height={height} fill={hmi.bg} />}
        {children}
      </svg>
    </>
  );
}

/** HTML-level priority icon (inline SVG) using the HMI marker: colour + shape + number, blinks when unack. */
export function PriorityIcon({
  priority,
  unack = false,
  size = 18,
  className,
}: {
  priority: AlarmPriority;
  unack?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-9 -9 18 18"
      className={cn("molca-hmi shrink-0 overflow-visible", className)}
      role="img"
      aria-label={`${ALARM_COLOR[priority].label} priority`}
    >
      <AlarmMarker x={0} y={0} priority={priority} unack={unack} size={17} />
    </svg>
  );
}
