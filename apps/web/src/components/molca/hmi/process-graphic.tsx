"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { HmiStyle, hmi } from "./hmi-theme";
import { AnalogBar, evaluateLimits } from "./analog-indicator";
import {
  EQUIPMENT_STATE_LABEL,
  HeatExchanger,
  HmiCanvas,
  HmiLabel,
  Instrument,
  Pipe,
  Pump,
  Tank,
  Valve,
  type EquipmentState,
} from "./equipment-symbols";
import { Faceplate, type FaceplateCommand, type FaceplateData } from "./faceplate";

/* ------------------------------------------------------------------ */
/* Data — Mixing unit T-200 (syrup preparation for Filler Line 3)      */
/* ------------------------------------------------------------------ */

export type MixingUnitData = Record<string, FaceplateData>;

/** Reference data set for the Level-2 mixing unit display. Replace with live tag values in an app. */
export const MIXING_UNIT_DEFAULT: MixingUnitData = {
  "FV-101": {
    tag: "FV-101",
    description: "Process water inlet valve",
    kind: "valve",
    state: "closed",
    mode: "manual",
    op: 0,
    pv: {
      tag: "FT-101",
      label: "Flow",
      value: 0,
      unit: "m³/h",
      min: 0,
      max: 10,
      normal: [3, 6],
      decimals: 1,
    },
    details: [
      { label: "Strokes today", value: "14" },
      { label: "Travel time", value: "4.2 s" },
    ],
  },
  "P-101": {
    tag: "P-101",
    description: "Syrup feed pump",
    kind: "pump",
    state: "running",
    mode: "auto",
    pv: {
      tag: "PT-101",
      label: "Discharge pressure",
      value: 3.4,
      unit: "bar",
      min: 0,
      max: 6,
      normal: [2.5, 4.0],
      limits: { h: 4.5, hh: 5.2, l: 1.5 },
      decimals: 1,
    },
    interlocks: [
      { label: "TK-100 level > LL", active: false },
      { label: "FV-102 not closed", active: false },
    ],
    details: [
      { label: "Run hours", value: "6,412 h" },
      { label: "Starts today", value: "3" },
      { label: "Motor current", value: "18.6 A" },
    ],
  },
  "FV-102": {
    tag: "FV-102",
    description: "Syrup flow control valve",
    kind: "valve",
    state: "open",
    mode: "auto",
    sp: 12.0,
    op: 64,
    pv: {
      tag: "FT-102",
      label: "Flow",
      value: 12.3,
      unit: "m³/h",
      min: 0,
      max: 20,
      normal: [10, 14],
      limits: { h: 16, hh: 18, l: 6 },
      decimals: 1,
    },
    modes: ["auto", "manual", "cascade"],
  },
  "M-201": {
    tag: "M-201",
    description: "Agitator motor T-200",
    kind: "motor",
    state: "running",
    mode: "auto",
    interlocks: [{ label: "LT-201 level > 25 %", active: false }],
    details: [
      { label: "Speed", value: "92 rpm" },
      { label: "Run hours", value: "11,208 h" },
    ],
  },
  "LT-201": {
    tag: "LT-201",
    description: "Mixing tank T-200 level",
    kind: "indicator",
    pv: {
      label: "Level",
      value: 62.4,
      unit: "%",
      min: 0,
      max: 100,
      normal: [30, 80],
      limits: { hh: 92, h: 85, l: 15, ll: 8 },
      decimals: 1,
    },
    details: [{ label: "Volume", value: "7.5 m³ of 12 m³" }],
  },
  "TT-201": {
    tag: "TT-201",
    description: "Mixing tank T-200 temperature",
    kind: "controller",
    mode: "auto",
    sp: 70.0,
    op: 38,
    pv: {
      label: "Temperature",
      value: 71.2,
      unit: "°C",
      min: 20,
      max: 100,
      normal: [65, 75],
      limits: { h: 78, hh: 85, l: 55 },
      decimals: 1,
    },
  },
  "P-202": {
    tag: "P-202",
    description: "Recirculation / transfer pump",
    kind: "pump",
    state: "running",
    mode: "auto",
    pv: {
      tag: "PT-202",
      label: "Discharge pressure",
      value: 2.8,
      unit: "bar",
      min: 0,
      max: 6,
      normal: [2.0, 3.5],
      limits: { h: 4.5, l: 1.0 },
      decimals: 1,
    },
    interlocks: [{ label: "LT-201 level > L", active: false }],
    details: [
      { label: "Run hours", value: "9,877 h" },
      { label: "Motor current", value: "22.1 A" },
    ],
  },
  "TT-203": {
    tag: "TT-203",
    description: "Cooler E-203 outlet temperature",
    kind: "indicator",
    pv: {
      label: "Temperature",
      value: 41.8,
      unit: "°C",
      min: 0,
      max: 80,
      normal: [30, 38],
      limits: { h: 40, hh: 50 },
      decimals: 1,
    },
    alarm: { priority: "medium", text: "Cooler outlet temperature high (H 40.0 °C)", unack: true },
  },
  "XV-204": {
    tag: "XV-204",
    description: "Transfer valve to Filler L3",
    kind: "valve",
    state: "closed",
    mode: "manual",
    interlocks: [
      { label: "Filler L3 ready", active: true },
      { label: "Batch QA released", active: false },
    ],
    details: [{ label: "Destination", value: "Filler Line 3 buffer" }],
  },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type ProcessGraphicProps = {
  /** Live data; defaults to the reference data set */
  data?: MixingUnitData;
  /** Called after a confirmed command (the demo also simulates the result) */
  onCommand?: (tag: string, cmd: FaceplateCommand) => void;
  /** Breadcrumb navigation between display levels */
  onNavigate?: (level: 1 | 2 | 3) => void;
  className?: string;
};

const NEXT_STATE: Record<FaceplateCommand, EquipmentState> = {
  start: "running",
  stop: "stopped",
  open: "open",
  close: "closed",
  reset: "stopped",
};

/**
 * Level-2 unit display (ISA-101): Mixing unit T-200. Grey equipment, colour only for abnormal values,
 * embedded analog indicators, click any equipment to open its faceplate in a side sheet.
 */
export function ProcessGraphic({
  data: initial = MIXING_UNIT_DEFAULT,
  onCommand,
  onNavigate,
  className,
}: ProcessGraphicProps) {
  const [data, setData] = React.useState(initial);
  const [open, setOpen] = React.useState<string | null>(null);
  React.useEffect(() => setData(initial), [initial]);

  const patch = (tag: string, p: Partial<FaceplateData>) =>
    setData((d) => ({ ...d, [tag]: { ...d[tag], ...p } }));
  const command = (tag: string, cmd: FaceplateCommand) => {
    onCommand?.(tag, cmd);
    if (cmd === "reset") return patch(tag, { state: "stopped", alarm: undefined });
    patch(tag, { state: "transition" });
    window.setTimeout(() => {
      const next = NEXT_STATE[cmd];
      setData((d) => {
        const e = d[tag];
        const op =
          e.kind === "valve" ? (next === "open" ? 100 : next === "closed" ? 0 : e.op) : e.op;
        const pv = e.pv && tag === "FV-101" ? { ...e.pv, value: next === "open" ? 4.6 : 0 } : e.pv;
        return { ...d, [tag]: { ...e, state: next, op, pv } };
      });
    }, 1500);
  };

  const g = (tag: string) => data[tag];
  const sel = (tag: string) => ({ selected: open === tag, onSelect: () => setOpen(tag) });
  const flowing = (tag: string) => g(tag).state === "running" || g(tag).state === "open";
  const pvAlarm = (tag: string) => {
    const pv = g(tag).pv;
    if (!pv) return undefined;
    return evaluateLimits(pv.value, pv.limits).priority ?? undefined;
  };
  const unack = (tag: string) => !!g(tag).alarm?.unack;
  const fp = open ? data[open] : null;

  return (
    <div
      className={cn(
        "molca-hmi w-full overflow-hidden rounded-xl border text-[var(--hmi-text)]",
        className,
      )}
      style={{ background: hmi.bg }}
    >
      <HmiStyle />
      {/* display header: hierarchy breadcrumb, title, context */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2"
        style={{ background: hmi.surface }}
      >
        <nav aria-label="Display hierarchy" className="flex items-center gap-1 text-[12px]">
          <button
            type="button"
            className="rounded px-1 text-[var(--hmi-text-muted)] hover:underline"
            onClick={() => onNavigate?.(1)}
          >
            L1 Plant overview
          </button>
          <ChevronRight className="size-3.5 text-[var(--hmi-text-muted)]" />
          <span className="rounded px-1 font-semibold" aria-current="page">
            L2 Mixing unit T-200
          </span>
        </nav>
        <span className="text-[12px] text-[var(--hmi-text-muted)]">
          Batch B-2611-014 · Syrup 65 °Bx · Phase: Mix 2/4
        </span>
        <span className="ml-auto font-mono text-[12px] text-[var(--hmi-text-muted)] tabular-nums">
          13:42:30
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <HmiCanvas width={960} height={500} title="Level 2 display: Mixing unit T-200">
            {/* ---- process lines ---- */}
            {/* Feed A: process water → FV-101 → T-200 top */}
            <Pipe
              points={[
                [24, 80],
                [445, 80],
                [445, 132],
              ]}
              variant={flowing("FV-101") ? "flow" : "idle"}
              arrow
            />
            {/* Feed B: TK-100 → P-101 → FV-102 → T-200 side */}
            <Pipe
              points={[
                [24, 250],
                [411, 250],
              ]}
              variant={flowing("P-101") && flowing("FV-102") ? "flow" : "idle"}
              arrow
            />
            {/* Bottom outlet → P-202 → E-203 → junction */}
            <Pipe
              points={[
                [480, 352],
                [480, 420],
                [780, 420],
              ]}
              variant={flowing("P-202") ? "flow" : "idle"}
            />
            {/* Recirculation back to T-200 top */}
            <Pipe
              points={[
                [780, 420],
                [780, 96],
                [520, 96],
                [520, 132],
              ]}
              variant={flowing("P-202") && !flowing("XV-204") ? "flow" : "idle"}
              arrow
            />
            {/* Transfer to filler */}
            <Pipe
              points={[
                [780, 420],
                [936, 420],
              ]}
              variant={flowing("XV-204") ? "flow" : "idle"}
              arrow
            />
            {/* instrument signal lines */}
            <Pipe
              points={[
                [250, 80],
                [250, 52],
              ]}
              variant="signal"
            />
            <Pipe
              points={[
                [300, 250],
                [300, 212],
              ]}
              variant="signal"
            />
            <Pipe
              points={[
                [700, 420],
                [700, 372],
              ]}
              variant="signal"
            />
            <Pipe
              points={[
                [548, 300],
                [578, 300],
              ]}
              variant="signal"
            />
            <Pipe
              points={[
                [412, 320],
                [380, 320],
              ]}
              variant="signal"
            />

            {/* ---- labels ---- */}
            <HmiLabel x={24} y={70}>
              Process water
            </HmiLabel>
            <HmiLabel x={24} y={222}>
              From TK-100 · Sugar syrup
            </HmiLabel>
            <HmiLabel x={936} y={442} anchor="end">
              To Filler L3
            </HmiLabel>
            <HmiLabel x={790} y={250}>
              Recirculation
            </HmiLabel>
            <HmiLabel x={480} y={478} anchor="middle" muted={false} size={12}>
              T-200 Mixing tank · 12 m³
            </HmiLabel>

            {/* ---- equipment ---- */}
            <Valve
              x={170}
              y={74}
              tag="FV-101"
              label={g("FV-101").description}
              state={g("FV-101").state}
              manual={g("FV-101").mode === "manual"}
              position={g("FV-101").op}
              {...sel("FV-101")}
            />
            <Instrument x={250} y={36} tag="FT-101" value={g("FV-101").pv?.value} unit="m³/h" />

            <Pump
              x={110}
              y={250}
              tag="P-101"
              label={g("P-101").description}
              state={g("P-101").state}
              manual={g("P-101").mode === "manual"}
              interlocked={g("P-101").interlocks?.some((i) => i.active)}
              {...sel("P-101")}
            />
            <Valve
              x={200}
              y={244}
              tag="FV-102"
              label={g("FV-102").description}
              state={g("FV-102").state}
              manual={g("FV-102").mode === "manual"}
              position={g("FV-102").op}
              {...sel("FV-102")}
            />
            <Instrument
              x={300}
              y={196}
              tag="FT-102"
              value={g("FV-102").pv?.value}
              unit="m³/h"
              alarm={pvAlarm("FV-102")}
            />
            <AnalogBar
              x={326}
              y={148}
              length={96}
              value={g("FV-102").pv!.value}
              min={0}
              max={20}
              normal={[10, 14]}
              limits={{ h: 16, hh: 18, l: 6 }}
              setpoint={g("FV-102").sp}
              tag="FT-102"
              unit="m³/h"
            />

            <Tank
              x={480}
              y={242}
              width={136}
              height={220}
              level={g("LT-201").pv!.value}
              agitator={g("M-201").state}
              limits={{ hh: 92, h: 85, l: 15, ll: 8 }}
              tag="T-200"
              tagPosition="none"
              label="Mixing tank"
            />
            {/* agitator motor clickable on its own */}
            <InvisibleHit
              x={480}
              y={106}
              r={16}
              name={`M-201, ${g("M-201").description}, ${EQUIPMENT_STATE_LABEL[g("M-201").state ?? "stopped"]}`}
              onSelect={() => setOpen("M-201")}
              selected={open === "M-201"}
            />
            <HmiLabel x={500} y={110} muted={false}>
              M-201
            </HmiLabel>

            <Instrument
              x={594}
              y={300}
              tag="LT-201"
              value={g("LT-201").pv?.value}
              unit="%"
              alarm={pvAlarm("LT-201")}
              valueSide="bottom"
              {...sel("LT-201")}
            />
            <AnalogBar
              x={650}
              y={140}
              length={190}
              orientation="vertical"
              value={g("LT-201").pv!.value}
              min={0}
              max={100}
              normal={[30, 80]}
              limits={{ hh: 92, h: 85, l: 15, ll: 8 }}
              tag="LT-201"
              unit="%"
            />

            <Instrument
              x={364}
              y={320}
              tag="TT-201"
              value={g("TT-201").pv?.value}
              unit="°C"
              valueSide="bottom"
              alarm={pvAlarm("TT-201")}
              {...sel("TT-201")}
            />
            <AnalogBar
              x={290}
              y={384}
              length={150}
              value={g("TT-201").pv!.value}
              min={20}
              max={100}
              normal={[65, 75]}
              limits={{ h: 78, hh: 85, l: 55 }}
              setpoint={g("TT-201").sp}
              tag="TT-201"
              unit="°C"
            />

            <Pump
              x={600}
              y={420}
              tag="P-202"
              label={g("P-202").description}
              state={g("P-202").state}
              manual={g("P-202").mode === "manual"}
              {...sel("P-202")}
            />
            <HeatExchanger
              x={700}
              y={420}
              tag="E-203"
              label="Product cooler"
              tagPosition="bottom"
            />
            <Instrument
              x={700}
              y={356}
              tag="TT-203"
              value={g("TT-203").pv?.value}
              unit="°C"
              alarm={g("TT-203").alarm?.priority ?? pvAlarm("TT-203")}
              alarmUnack={unack("TT-203")}
              valueSide="left"
              {...sel("TT-203")}
            />
            <Valve
              x={840}
              y={414}
              tag="XV-204"
              label={g("XV-204").description}
              actuator="onoff"
              state={g("XV-204").state}
              manual={g("XV-204").mode === "manual"}
              interlocked={g("XV-204").interlocks?.some((i) => i.active)}
              {...sel("XV-204")}
            />
          </HmiCanvas>
        </div>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[380px] gap-0 overflow-y-auto sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle className="font-mono">{fp?.tag}</SheetTitle>
            <SheetDescription>Level 3 · Faceplate</SheetDescription>
          </SheetHeader>
          {fp && open && (
            <div className="px-4 pb-4">
              <Faceplate
                {...fp}
                className="max-w-none"
                onCommand={(c) => command(open, c)}
                onModeChange={(m) => patch(open, { mode: m })}
                onSetpointChange={(v) => patch(open, { sp: v })}
                onOutputChange={(v) => patch(open, { op: v, state: v > 0 ? "open" : "closed" })}
                onAcknowledge={() =>
                  fp.alarm && patch(open, { alarm: { ...fp.alarm, unack: false } })
                }
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Transparent hit area for parts drawn by another symbol (e.g. the agitator motor on a tank). */
function InvisibleHit({
  x,
  y,
  r,
  name,
  onSelect,
  selected,
}: {
  x: number;
  y: number;
  r: number;
  name: string;
  onSelect: () => void;
  selected?: boolean;
}) {
  return (
    <g
      className="hmi-eq cursor-pointer"
      data-selected={selected ? "true" : undefined}
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-pressed={!!selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <circle cx={x} cy={y} r={r} fill="transparent" />
      <rect
        className="hmi-ring"
        x={x - r - 2}
        y={y - r - 2}
        width={(r + 2) * 2}
        height={(r + 2) * 2}
        rx={4}
        fill="none"
        stroke={hmi.focus}
        strokeWidth={2}
      />
    </g>
  );
}
