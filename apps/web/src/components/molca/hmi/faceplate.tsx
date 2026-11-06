"use client";

import * as React from "react";
import { Lock, LockOpen, RotateCcw } from "lucide-react";
import type { AlarmPriority } from "@/components/molca/alarm-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { ALARM_COLOR, HmiStyle, hmi } from "./hmi-theme";
import { AnalogIndicator, type AnalogLimits } from "./analog-indicator";
import {
  PriorityIcon,
  EQUIPMENT_STATE_LABEL,
  HmiCanvas,
  Instrument,
  Motor,
  Pump,
  Valve,
  type EquipmentState,
} from "./equipment-symbols";

export type ControlMode = "auto" | "manual" | "cascade";
export type FaceplateKind = "pump" | "motor" | "valve" | "controller" | "indicator";
export type FaceplateCommand = "start" | "stop" | "open" | "close" | "reset";

export const CONTROL_MODE_LABEL: Record<ControlMode, string> = {
  auto: "Auto",
  manual: "Man",
  cascade: "Cas",
};

export type FaceplatePV = {
  value: number;
  unit: string;
  min: number;
  max: number;
  normal?: [number, number];
  limits?: AnalogLimits;
  decimals?: number;
  /** e.g. "Flow", "Temperature" */
  label?: string;
  /** Measurement tag when different from the faceplate tag, e.g. FT-102 on FV-102 */
  tag?: string;
};

export type FaceplateData = {
  tag: string;
  description: string;
  kind: FaceplateKind;
  state?: EquipmentState;
  mode?: ControlMode;
  /** Modes the operator may select (default auto+manual; controllers add cascade) */
  modes?: ControlMode[];
  pv?: FaceplatePV;
  /** Setpoint (controllers / control valves), same unit as PV */
  sp?: number;
  /** Output 0–100 % */
  op?: number;
  interlocks?: { label: string; active: boolean }[];
  alarm?: { priority: AlarmPriority; text: string; unack?: boolean };
  /** Extra read-only rows: run hours, starts, last maintenance … */
  details?: { label: string; value: string }[];
};

export type FaceplateProps = FaceplateData & {
  onCommand?: (cmd: FaceplateCommand) => void;
  onModeChange?: (mode: ControlMode) => void;
  onSetpointChange?: (sp: number) => void;
  onOutputChange?: (op: number) => void;
  onAcknowledge?: () => void;
  /** Ask for confirmation before commands and SP/OP writes (default true) */
  confirm?: boolean;
  className?: string;
};

type Pending = { title: string; body: string; action: () => void; label: string } | null;

function MiniSymbol({
  kind,
  state,
  tag,
}: {
  kind: FaceplateKind;
  state: EquipmentState;
  tag: string;
}) {
  return (
    <div className="w-11 shrink-0 overflow-hidden rounded-md border">
      <HmiCanvas width={50} height={50} title={`${tag} symbol`}>
        {kind === "pump" && <Pump x={25} y={27} state={state} tagPosition="none" scale={0.95} />}
        {kind === "motor" && <Motor x={25} y={25} state={state} tagPosition="none" scale={1.2} />}
        {kind === "valve" && <Valve x={25} y={24} state={state} tagPosition="none" />}
        {(kind === "controller" || kind === "indicator") && <Instrument x={25} y={25} tag={tag} />}
      </HmiCanvas>
    </div>
  );
}

/**
 * ISA-101 faceplate (Level 3 detail): identity, state, PV/SP/OP, mode and commands.
 * Commands are only enabled in Manual, blocked by active interlocks, and confirmed before they are sent.
 */
export function Faceplate({
  tag,
  description,
  kind,
  state = "stopped",
  mode = "auto",
  modes,
  pv,
  sp,
  op,
  interlocks = [],
  alarm,
  details = [],
  onCommand,
  onModeChange,
  onSetpointChange,
  onOutputChange,
  onAcknowledge,
  confirm = true,
  className,
}: FaceplateProps) {
  const [pending, setPending] = React.useState<Pending>(null);
  const [spDraft, setSpDraft] = React.useState(sp?.toString() ?? "");
  const [opDraft, setOpDraft] = React.useState(op?.toString() ?? "");
  React.useEffect(() => setSpDraft(sp?.toString() ?? ""), [sp]);
  React.useEffect(() => setOpDraft(op?.toString() ?? ""), [op]);

  const blocked = interlocks.filter((i) => i.active);
  const isMotor = kind === "pump" || kind === "motor";
  const isValve = kind === "valve";
  const hasCommands = isMotor || isValve;
  const modeList =
    modes ??
    (kind === "controller"
      ? (["auto", "manual", "cascade"] as ControlMode[])
      : kind === "indicator"
        ? []
        : (["auto", "manual"] as ControlMode[]));
  const canOperate = mode === "manual" && blocked.length === 0 && state !== "fault";
  const d = pv?.decimals ?? 1;

  const ask = (p: NonNullable<Pending>) => (confirm ? setPending(p) : p.action());
  const cmd = (c: FaceplateCommand, verb: string, effect: string) =>
    ask({
      title: `${verb} ${tag}?`,
      body: `${description}. ${effect}`,
      label: verb,
      action: () => onCommand?.(c),
    });

  const on = state === "running" || state === "open";
  const c = alarm ? ALARM_COLOR[alarm.priority] : null;

  return (
    <div
      className={cn(
        "molca-hmi w-full max-w-[340px] overflow-hidden rounded-xl border text-[var(--hmi-text)]",
        className,
      )}
      style={{ background: hmi.surface }}
      aria-label={`Faceplate ${tag}`}
      role="group"
    >
      <HmiStyle />
      {/* identity */}
      <div className="flex items-center gap-3 border-b p-3">
        <MiniSymbol kind={kind} state={state} tag={tag} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[14px] font-semibold">{tag}</div>
          <div className="truncate text-[12px] text-[var(--hmi-text-muted)]">{description}</div>
        </div>
        <div className="grid justify-items-end gap-1">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold",
              on && "border-transparent bg-[var(--hmi-fill)] text-[var(--hmi-bg)]",
            )}
          >
            {EQUIPMENT_STATE_LABEL[state]}
          </span>
          {kind !== "indicator" && (
            <span className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold">
              {CONTROL_MODE_LABEL[mode]}
            </span>
          )}
        </div>
      </div>

      {/* alarm */}
      {alarm && c && (
        <div
          className="flex items-center gap-2 border-b px-3 py-2 text-[12.5px]"
          style={{ boxShadow: `inset 4px 0 0 ${c.fill}` }}
          role="alert"
        >
          <PriorityIcon priority={alarm.priority} unack={alarm.unack} />
          <span className={cn("min-w-0 flex-1", alarm.unack && "font-semibold")}>
            <span className="sr-only">{c.label} priority alarm: </span>
            {alarm.text}
          </span>
          {alarm.unack && onAcknowledge && (
            <Button size="xs" onClick={onAcknowledge} aria-label={`Acknowledge alarm on ${tag}`}>
              Ack
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-3 p-3">
        {/* PV */}
        {pv && (
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between text-[11.5px] text-[var(--hmi-text-muted)]">
              <span>
                PV{pv.label ? ` · ${pv.label}` : ""}
                {pv.tag ? ` · ${pv.tag}` : ""}
              </span>
            </div>
            <AnalogIndicator
              compact
              value={pv.value}
              min={pv.min}
              max={pv.max}
              unit={pv.unit}
              normal={pv.normal}
              limits={pv.limits}
              setpoint={sp}
              decimals={d}
              alarmUnack={alarm?.unack}
            />
          </div>
        )}

        {/* SP / OP */}
        {(sp !== undefined || op !== undefined) && (
          <div className="grid grid-cols-2 items-start gap-3">
            {sp !== undefined && (
              <form
                className="grid content-start gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(spDraft);
                  if (!Number.isFinite(v) || v === sp) return;
                  ask({
                    title: `Change setpoint of ${tag}?`,
                    body: `${sp.toFixed(d)} → ${v.toFixed(d)} ${pv?.unit ?? ""}`,
                    label: "Write SP",
                    action: () => onSetpointChange?.(v),
                  });
                }}
              >
                <label htmlFor={`${tag}-sp`} className="text-[11.5px] text-[var(--hmi-text-muted)]">
                  SP {pv?.unit && `(${pv.unit})`}
                </label>
                <div className="flex gap-1">
                  <Input
                    id={`${tag}-sp`}
                    inputMode="decimal"
                    value={spDraft}
                    onChange={(e) => setSpDraft(e.target.value)}
                    disabled={mode !== "auto" || !onSetpointChange}
                    className="h-7 font-mono tabular-nums"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={mode !== "auto" || !onSetpointChange}
                  >
                    Set
                  </Button>
                </div>
                {mode === "cascade" && (
                  <span className="text-[11px] text-[var(--hmi-text-muted)]">From master loop</span>
                )}
              </form>
            )}
            {op !== undefined && (
              <form
                className="grid content-start gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Math.max(0, Math.min(100, Number(opDraft)));
                  if (!Number.isFinite(v) || v === op) return;
                  ask({
                    title: `Change output of ${tag}?`,
                    body: `${op.toFixed(0)} % → ${v.toFixed(0)} %`,
                    label: "Write OP",
                    action: () => onOutputChange?.(v),
                  });
                }}
              >
                <label htmlFor={`${tag}-op`} className="text-[11.5px] text-[var(--hmi-text-muted)]">
                  OP (%)
                </label>
                <div className="flex gap-1">
                  <Input
                    id={`${tag}-op`}
                    inputMode="decimal"
                    value={opDraft}
                    onChange={(e) => setOpDraft(e.target.value)}
                    disabled={mode !== "manual" || !onOutputChange}
                    className="h-7 font-mono tabular-nums"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={mode !== "manual" || !onOutputChange}
                  >
                    Set
                  </Button>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: hmi.track }}
                  aria-hidden
                >
                  <div className="h-full" style={{ width: `${op}%`, background: hmi.fill }} />
                </div>
              </form>
            )}
          </div>
        )}

        {/* mode */}
        {modeList.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[var(--hmi-text-muted)]">Mode</span>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              value={mode}
              onValueChange={(v) => v && onModeChange?.(v as ControlMode)}
              aria-label={`Control mode of ${tag}`}
            >
              {modeList.map((m) => (
                <ToggleGroupItem
                  key={m}
                  value={m}
                  className="px-3 font-mono text-[12px] data-[state=on]:bg-[var(--hmi-fill)] data-[state=on]:text-[var(--hmi-bg)] data-[state=on]:font-semibold"
                  disabled={!onModeChange}
                >
                  {CONTROL_MODE_LABEL[m]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {/* commands */}
        {hasCommands && (
          <div className="grid gap-1.5">
            <div className="grid grid-cols-2 gap-2">
              {isMotor ? (
                <>
                  <Button
                    variant={on ? "outline" : "default"}
                    disabled={!canOperate || on || state === "transition"}
                    onClick={() => cmd("start", "Start", "The motor starts immediately.")}
                  >
                    Start
                  </Button>
                  <Button
                    variant={on ? "default" : "outline"}
                    disabled={!canOperate || !on}
                    onClick={() => cmd("stop", "Stop", "Flow through this line stops.")}
                  >
                    Stop
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={on ? "outline" : "default"}
                    disabled={!canOperate || on || state === "transition"}
                    onClick={() => cmd("open", "Open", "The valve travels to 100 %.")}
                  >
                    Open
                  </Button>
                  <Button
                    variant={on ? "default" : "outline"}
                    disabled={!canOperate || state === "closed"}
                    onClick={() => cmd("close", "Close", "The valve travels to 0 %.")}
                  >
                    Close
                  </Button>
                </>
              )}
            </div>
            {state === "fault" && (
              <Button
                variant="outline"
                size="sm"
                disabled={!onCommand}
                onClick={() =>
                  cmd("reset", "Reset", "Clears the latched trip if the cause is gone.")
                }
              >
                <RotateCcw /> Reset fault
              </Button>
            )}
            <p className="text-[11.5px] text-[var(--hmi-text-muted)]">
              {state === "fault"
                ? "Reset the fault before operating."
                : blocked.length
                  ? "Commands blocked by interlock."
                  : mode !== "manual"
                    ? "Switch to Man to operate."
                    : "Commands are confirmed before sending."}
            </p>
          </div>
        )}

        {/* interlocks */}
        {interlocks.length > 0 && (
          <div className="grid gap-1 border-t pt-2.5">
            <div className="text-[11.5px] text-[var(--hmi-text-muted)]">Interlocks</div>
            {interlocks.map((i) => (
              <div
                key={i.label}
                className={cn(
                  "flex items-center gap-2 text-[12.5px]",
                  i.active ? "font-semibold" : "text-[var(--hmi-text-muted)]",
                )}
              >
                {i.active ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                <span className="flex-1">{i.label}</span>
                <span
                  className={cn(
                    "rounded px-1 font-mono text-[10.5px]",
                    i.active && "border border-current",
                  )}
                >
                  {i.active ? "ACTIVE" : "OK"}
                </span>
              </div>
            ))}
          </div>
        )}

        {details.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2.5 text-[12px]">
            {details.map((r) => (
              <React.Fragment key={r.label}>
                <dt className="text-[var(--hmi-text-muted)]">{r.label}</dt>
                <dd className="text-right tabular-nums">{r.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>{pending?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              autoFocus
              onClick={() => {
                pending?.action();
                setPending(null);
              }}
            >
              {pending?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
