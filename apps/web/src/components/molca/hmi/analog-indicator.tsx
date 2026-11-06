"use client";

import type { AlarmPriority } from "@/components/molca/alarm-list";
import { cn } from "@/lib/utils";
import { ALARM_COLOR, HmiStyle, hmi } from "./hmi-theme";
import { AlarmMarker, PriorityIcon } from "./equipment-symbols";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export type LimitKey = "hh" | "h" | "l" | "ll";
export type AnalogLimits = Partial<Record<LimitKey, number>>;

export const DEFAULT_LIMIT_PRIORITY: Record<LimitKey, AlarmPriority> = {
  hh: "high",
  h: "medium",
  l: "medium",
  ll: "high",
};

/** Which alarm limit (if any) the value violates, most severe first. */
export function evaluateLimits(
  value: number,
  limits: AnalogLimits = {},
  priority: Partial<Record<LimitKey, AlarmPriority>> = {},
) {
  const pr = { ...DEFAULT_LIMIT_PRIORITY, ...priority };
  const hit: LimitKey | null =
    limits.hh !== undefined && value >= limits.hh
      ? "hh"
      : limits.ll !== undefined && value <= limits.ll
        ? "ll"
        : limits.h !== undefined && value >= limits.h
          ? "h"
          : limits.l !== undefined && value <= limits.l
            ? "l"
            : null;
  return { limit: hit, priority: hit ? pr[hit] : null };
}

export type AnalogIndicatorProps = {
  value: number;
  min: number;
  max: number;
  unit?: string;
  /** ISA-5.1 tag, e.g. "TT-201" */
  tag?: string;
  /** Description, e.g. "Mixing tank temperature" */
  label?: string;
  /** Normal operating range — drawn as a darker band */
  normal?: [number, number];
  /** Alarm limits — drawn as ticks; HH/LL thicker */
  limits?: AnalogLimits;
  /** Priority per limit (default HH/LL high, H/L medium) */
  limitPriority?: Partial<Record<LimitKey, AlarmPriority>>;
  /** Alarm is unacknowledged (marker blinks) */
  alarmUnack?: boolean;
  /** Setpoint — hollow marker + deviation readout */
  setpoint?: number;
  orientation?: "horizontal" | "vertical";
  /** Vertical: track height in px (default 160) */
  length?: number;
  decimals?: number;
  /** Hide the tag/label header (e.g. inside a faceplate) */
  compact?: boolean;
  className?: string;
};

const fmt = (v: number, d: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function Pointer({ dir, color, alarm }: { dir: "down" | "right"; color: string; alarm?: boolean }) {
  return (
    <svg
      width={12}
      height={10}
      viewBox="0 0 12 10"
      className={cn("block", dir === "right" && "-rotate-90")}
      aria-hidden
    >
      <path
        d="M0.5,0.5 H11.5 L6,9.5 Z"
        fill={color}
        stroke={alarm ? hmi.text : hmi.bg}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpMarker({ dir }: { dir: "up" | "left" }) {
  return (
    <svg
      width={10}
      height={8}
      viewBox="0 0 10 8"
      className={cn("block", dir === "left" && "rotate-90")}
      aria-hidden
    >
      <path
        d="M5,1 L9,7 H1 Z"
        fill={hmi.surface}
        stroke={hmi.text}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * ISA-101 analog indicator: a moving pointer on a grey scale with the normal band and alarm limits.
 * The operator reads “where in the range” at a glance; the number is secondary.
 */
export function AnalogIndicator({
  value,
  min,
  max,
  unit,
  tag,
  label,
  normal,
  limits = {},
  limitPriority,
  alarmUnack,
  setpoint,
  orientation = "horizontal",
  length = 160,
  decimals = 1,
  compact = false,
  className,
}: AnalogIndicatorProps) {
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const { limit, priority } = evaluateLimits(value, limits, limitPriority);
  const c = priority ? ALARM_COLOR[priority] : null;
  const pointerColor = c ? c.fill : hmi.text;
  const dev = setpoint !== undefined ? value - setpoint : undefined;
  const marks = (Object.entries(limits) as [LimitKey, number][]).filter(([, v]) => v !== undefined);
  const valueText = `${fmt(value, decimals)}${unit ? ` ${unit}` : ""}`;
  const aria = [
    tag,
    label,
    valueText,
    limit && `${limit.toUpperCase()} alarm, ${c!.label} priority`,
    setpoint !== undefined && `setpoint ${fmt(setpoint, decimals)}`,
  ]
    .filter(Boolean)
    .join(", ");

  const Value = (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {priority && <PriorityIcon priority={priority} unack={alarmUnack} />}
      <span
        className={cn(
          "rounded px-1 text-[17px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
          c && "font-bold",
        )}
        style={c ? { boxShadow: `inset 0 0 0 2px ${c.fill}` } : undefined}
      >
        {fmt(value, decimals)}
        {unit && (
          <span className="ml-1 text-[12px] font-medium tracking-normal text-[var(--hmi-text-muted)]">
            {unit}
          </span>
        )}
      </span>
      {limit && <span className="text-[11px] font-bold">{limit.toUpperCase()}</span>}
    </div>
  );

  const Header = !compact && (tag || label) && (
    <div className="min-w-0">
      {tag && <div className="font-mono text-[12px] font-semibold">{tag}</div>}
      {label && <div className="truncate text-[11.5px] text-[var(--hmi-text-muted)]">{label}</div>}
    </div>
  );

  const Deviation = dev !== undefined && (
    <div className="text-[11px] text-[var(--hmi-text-muted)] tabular-nums">
      SP {fmt(setpoint!, decimals)} · Δ {dev >= 0 ? "+" : "−"}
      {fmt(Math.abs(dev), decimals)}
    </div>
  );

  if (orientation === "vertical") {
    return (
      <div
        className={cn(
          "molca-hmi inline-grid justify-items-start gap-2 text-[var(--hmi-text)]",
          className,
        )}
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={aria}
      >
        <HmiStyle />
        {Header}
        <div className="relative ml-1" style={{ height: length, width: 64 }}>
          <div
            className="absolute top-0 bottom-0 left-3 w-2.5 rounded-full"
            style={{ background: hmi.track, boxShadow: `inset 0 0 0 1px ${hmi.pipeIdle}` }}
          />
          {normal && (
            <div
              className="absolute left-3 w-2.5"
              style={{
                bottom: `${pct(normal[0])}%`,
                height: `${pct(normal[1]) - pct(normal[0])}%`,
                background: hmi.band,
              }}
            />
          )}
          {marks.map(([k, v]) => (
            <div
              key={k}
              className="absolute left-1.5 flex items-center gap-1"
              style={{ bottom: `${pct(v)}%`, transform: "translateY(50%)" }}
            >
              <span
                className="block w-5"
                style={{ height: k.length === 2 ? 2 : 1, background: hmi.text }}
              />
              <span className="text-[9.5px] font-semibold text-[var(--hmi-text-muted)] tabular-nums">
                {k.toUpperCase()}
              </span>
            </div>
          ))}
          {setpoint !== undefined && (
            <div
              className="absolute left-[23px]"
              style={{ bottom: `${pct(setpoint)}%`, transform: "translateY(50%)" }}
            >
              <SpMarker dir="left" />
            </div>
          )}
          <div
            className="absolute -left-1"
            style={{ bottom: `${pct(value)}%`, transform: "translateY(50%)" }}
          >
            <Pointer dir="right" color={pointerColor} alarm={!!c} />
          </div>
          <span className="absolute right-0 -bottom-1 text-[9.5px] text-[var(--hmi-text-muted)] tabular-nums">
            {min}
          </span>
          <span className="absolute -top-1 right-0 text-[9.5px] text-[var(--hmi-text-muted)] tabular-nums">
            {max}
          </span>
        </div>
        {Value}
        {Deviation}
      </div>
    );
  }

  return (
    <div
      className={cn("molca-hmi grid w-full min-w-48 gap-1 text-[var(--hmi-text)]", className)}
      role="meter"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={aria}
    >
      <HmiStyle />
      <div className="flex items-end justify-between gap-3">
        {Header || <span />}
        {Value}
      </div>
      <div className="relative mx-1.5 mt-1 h-[34px]">
        <div
          className="absolute inset-x-0 top-[12px] h-2.5 rounded-full"
          style={{ background: hmi.track, boxShadow: `inset 0 0 0 1px ${hmi.pipeIdle}` }}
        />
        {normal && (
          <div
            className="absolute top-[12px] h-2.5"
            style={{
              left: `${pct(normal[0])}%`,
              width: `${pct(normal[1]) - pct(normal[0])}%`,
              background: hmi.band,
            }}
          />
        )}
        {marks.map(([k, v]) => (
          <div
            key={k}
            className="absolute top-[8px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${pct(v)}%` }}
          >
            <span
              className="block h-[18px]"
              style={{ width: k.length === 2 ? 2 : 1, background: hmi.text }}
            />
            <span className="text-[9.5px] leading-none font-semibold text-[var(--hmi-text-muted)]">
              {k.toUpperCase()}
            </span>
          </div>
        ))}
        {setpoint !== undefined && (
          <div
            className="absolute top-[22px] -translate-x-1/2"
            style={{ left: `${pct(setpoint)}%` }}
          >
            <SpMarker dir="up" />
          </div>
        )}
        <div className="absolute top-0 -translate-x-1/2" style={{ left: `${pct(value)}%` }}>
          <Pointer dir="down" color={pointerColor} alarm={!!c} />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-[var(--hmi-text-muted)] tabular-nums">
        <span>{min}</span>
        {Deviation || <span />}
        <span>{max}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SVG variant — for embedding in a process graphic                    */
/* ------------------------------------------------------------------ */

export type AnalogBarProps = Omit<AnalogIndicatorProps, "className" | "compact" | "label"> & {
  x: number;
  y: number;
  /** Track length in SVG units */
  length?: number;
  /** Show the value readout next to the bar */
  showValue?: boolean;
};

/** Same encoding as AnalogIndicator, drawn in SVG units (use inside HmiCanvas). */
export function AnalogBar({
  x,
  y,
  value,
  min,
  max,
  unit,
  tag,
  normal,
  limits = {},
  limitPriority,
  alarmUnack,
  setpoint,
  orientation = "horizontal",
  length = 120,
  decimals = 1,
  showValue = false,
}: AnalogBarProps) {
  const f = (v: number) => (Math.max(min, Math.min(max, v)) - min) / (max - min);
  const { limit, priority } = evaluateLimits(value, limits, limitPriority);
  const c = priority ? ALARM_COLOR[priority] : null;
  const vert = orientation === "vertical";
  // position along the track: horizontal → x from left, vertical → y from bottom
  const at = (v: number) => (vert ? length - f(v) * length : f(v) * length);
  const marks = (Object.entries(limits) as [LimitKey, number][]).filter(([, v]) => v !== undefined);
  const T = 8; // track thickness
  return (
    <g
      transform={`translate(${x},${y})`}
      role="meter"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={`${tag ?? ""} ${fmt(value, decimals)} ${unit ?? ""}${limit ? `, ${limit.toUpperCase()} alarm` : ""}`}
    >
      {vert ? (
        <>
          <rect
            x={0}
            y={0}
            width={T}
            height={length}
            rx={T / 2}
            fill={hmi.track}
            stroke={hmi.pipeIdle}
            strokeWidth={0.75}
          />
          {normal && (
            <rect
              x={0}
              y={at(normal[1])}
              width={T}
              height={at(normal[0]) - at(normal[1])}
              fill={hmi.band}
            />
          )}
          {marks.map(([k, v]) => (
            <g key={k}>
              <path
                d={`M-3,${at(v)} H${T + 3}`}
                stroke={hmi.text}
                strokeWidth={k.length === 2 ? 2 : 1}
              />
              <text x={T + 6} y={at(v) + 3.5} fontSize={9} fill={hmi.textMuted}>
                {k.toUpperCase()}
              </text>
            </g>
          ))}
          {setpoint !== undefined && (
            <path
              d={`M${T + 1},${at(setpoint)} l7,-4.5 v9 z`}
              fill={hmi.surface}
              stroke={hmi.text}
              strokeWidth={1.25}
            />
          )}
          <path
            d={`M-1,${at(value)} l-10,-6 v12 z`}
            fill={c ? c.fill : hmi.text}
            stroke={c ? hmi.text : hmi.bg}
            strokeWidth={1}
          />
        </>
      ) : (
        <>
          <rect
            x={0}
            y={0}
            width={length}
            height={T}
            rx={T / 2}
            fill={hmi.track}
            stroke={hmi.pipeIdle}
            strokeWidth={0.75}
          />
          {normal && (
            <rect
              x={at(normal[0])}
              y={0}
              width={at(normal[1]) - at(normal[0])}
              height={T}
              fill={hmi.band}
            />
          )}
          {marks.map(([k, v]) => (
            <g key={k}>
              <path
                d={`M${at(v)},-3 V${T + 3}`}
                stroke={hmi.text}
                strokeWidth={k.length === 2 ? 2 : 1}
              />
              <text x={at(v)} y={T + 18} fontSize={8.5} textAnchor="middle" fill={hmi.textMuted}>
                {k.toUpperCase()}
              </text>
            </g>
          ))}
          {setpoint !== undefined && (
            <path
              d={`M${at(setpoint)},${T + 1} l-4.5,7 h9 z`}
              fill={hmi.surface}
              stroke={hmi.text}
              strokeWidth={1.25}
            />
          )}
          <path
            d={`M${at(value)},-1 l-6,-10 h12 z`}
            fill={c ? c.fill : hmi.text}
            stroke={c ? hmi.text : hmi.bg}
            strokeWidth={1}
          />
        </>
      )}
      {showValue && (
        <text
          x={vert ? -4 : length + 8}
          y={vert ? length + 16 : T - 0.5}
          fontSize={11.5}
          fontWeight={c ? 700 : 600}
          textAnchor={vert ? "start" : "start"}
          fill={hmi.text}
          className="tabular-nums"
        >
          {fmt(value, decimals)} {unit}
        </text>
      )}
      {c && (
        <AlarmMarker
          x={vert ? T + 26 : length + 8}
          y={vert ? at(value) : -12}
          priority={priority!}
          unack={alarmUnack}
          size={14}
        />
      )}
    </g>
  );
}
