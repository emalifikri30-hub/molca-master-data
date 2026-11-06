"use client";

import * as React from "react";
import { ChevronRight, CircleAlert, OctagonAlert, TriangleAlert, CircleHelp } from "lucide-react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* ISO 14224 code lists                                                 */
/* ------------------------------------------------------------------ */

export type Code = { code: string; label: string; description?: string; group?: string };

/** Equipment taxonomy levels (ISO 14224 equipment taxonomy). 1–5 use/location, 6–9 equipment subdivision. */
export const TAXONOMY_LEVELS = [
  { level: 1, name: "Industry", group: "Use / location" },
  { level: 2, name: "Business category", group: "Use / location" },
  { level: 3, name: "Installation category", group: "Use / location" },
  { level: 4, name: "Plant / unit category", group: "Use / location" },
  { level: 5, name: "Section / system", group: "Use / location" },
  { level: 6, name: "Equipment class / unit", group: "Equipment subdivision" },
  { level: 7, name: "Subunit", group: "Equipment subdivision" },
  { level: 8, name: "Component / maintainable item", group: "Equipment subdivision" },
  { level: 9, name: "Part", group: "Equipment subdivision" },
] as const;

/** Failure modes for rotating equipment (ISO 14224 Annex B, e.g. pumps / compressors / motors). */
export const FAILURE_MODES: Code[] = [
  {
    code: "AIR",
    label: "Abnormal instrument reading",
    description: "False alarm, faulty instrument indication",
  },
  { code: "BRD", label: "Breakdown", description: "Serious damage (seizure, breakage)" },
  {
    code: "ELP",
    label: "External leakage – process medium",
    description: "Leak of product to the environment",
  },
  {
    code: "ELU",
    label: "External leakage – utility medium",
    description: "Lubricant, cooling water, seal fluid",
  },
  { code: "ERO", label: "Erratic output", description: "Oscillating, hunting or unstable output" },
  { code: "FTS", label: "Fail to start on demand", description: "Does not start when requested" },
  {
    code: "STP",
    label: "Fail to stop on demand",
    description: "Does not stop / incorrect shutdown",
  },
  { code: "HIO", label: "High output", description: "Output above specification" },
  {
    code: "INL",
    label: "Internal leakage",
    description: "Leakage internally between process or utility fluids",
  },
  { code: "LOO", label: "Low output", description: "Delivery / performance below specification" },
  { code: "NOI", label: "Noise", description: "Abnormal noise" },
  {
    code: "OHE",
    label: "Overheating",
    description: "Machine parts, exhaust or cooling water too hot",
  },
  {
    code: "PDE",
    label: "Parameter deviation",
    description: "Monitored parameter outside tolerance",
  },
  { code: "PLU", label: "Plugged / choked", description: "Flow restriction due to blockage" },
  {
    code: "SER",
    label: "Minor in-service problems",
    description: "Loose items, discoloration, dirt",
  },
  {
    code: "STD",
    label: "Structural deficiency",
    description: "Material damage: cracks, wear, fracture, corrosion",
  },
  { code: "UST", label: "Spurious stop", description: "Unexpected shutdown" },
  { code: "VIB", label: "Vibration", description: "Abnormal vibration" },
  { code: "OTH", label: "Other", description: "Failure mode not covered above" },
  { code: "UNK", label: "Unknown", description: "Too little information" },
];

/** Failure mechanism (ISO 14224 Annex B). */
export const FAILURE_MECHANISMS: Code[] = [
  { code: "1.0", label: "Mechanical failure – general", group: "Mechanical" },
  { code: "1.1", label: "Leakage", group: "Mechanical" },
  { code: "1.2", label: "Vibration", group: "Mechanical" },
  { code: "1.3", label: "Clearance / alignment failure", group: "Mechanical" },
  { code: "1.4", label: "Deformation", group: "Mechanical" },
  { code: "1.5", label: "Looseness", group: "Mechanical" },
  { code: "1.6", label: "Sticking", group: "Mechanical" },
  { code: "2.0", label: "Material failure – general", group: "Material" },
  { code: "2.1", label: "Cavitation", group: "Material" },
  { code: "2.2", label: "Corrosion", group: "Material" },
  { code: "2.3", label: "Erosion", group: "Material" },
  { code: "2.4", label: "Wear", group: "Material" },
  { code: "2.5", label: "Breakage", group: "Material" },
  { code: "2.6", label: "Fatigue", group: "Material" },
  { code: "2.7", label: "Overheating", group: "Material" },
  { code: "2.8", label: "Burst", group: "Material" },
  { code: "3.0", label: "Instrument failure – general", group: "Instrument" },
  { code: "3.1", label: "Control failure", group: "Instrument" },
  { code: "3.2", label: "No signal / indication / alarm", group: "Instrument" },
  { code: "3.3", label: "Faulty signal / indication / alarm", group: "Instrument" },
  { code: "3.4", label: "Out of adjustment", group: "Instrument" },
  { code: "3.5", label: "Software failure", group: "Instrument" },
  { code: "3.6", label: "Common cause / mode failure", group: "Instrument" },
  { code: "4.0", label: "Electrical failure – general", group: "Electrical" },
  { code: "4.1", label: "Short circuiting", group: "Electrical" },
  { code: "4.2", label: "Open circuit", group: "Electrical" },
  { code: "4.3", label: "No power / voltage", group: "Electrical" },
  { code: "4.4", label: "Faulty power / voltage", group: "Electrical" },
  { code: "4.5", label: "Earth / isolation fault", group: "Electrical" },
  { code: "5.0", label: "External influence – general", group: "External influence" },
  { code: "5.1", label: "Blockage / plugged", group: "External influence" },
  { code: "5.2", label: "Contamination", group: "External influence" },
  { code: "5.3", label: "Miscellaneous external influences", group: "External influence" },
  { code: "6.0", label: "Miscellaneous – general", group: "Miscellaneous" },
  { code: "6.1", label: "No cause found", group: "Miscellaneous" },
  { code: "6.2", label: "Combined causes", group: "Miscellaneous" },
  { code: "6.3", label: "Other", group: "Miscellaneous" },
  { code: "6.4", label: "Unknown", group: "Miscellaneous" },
];

/** Failure cause (ISO 14224 Annex B). */
export const FAILURE_CAUSES: Code[] = [
  { code: "1.0", label: "Design-related – general", group: "Design" },
  { code: "1.1", label: "Improper capacity", group: "Design" },
  { code: "1.2", label: "Improper material", group: "Design" },
  {
    code: "2.0",
    label: "Fabrication / installation – general",
    group: "Fabrication / installation",
  },
  { code: "2.1", label: "Fabrication error", group: "Fabrication / installation" },
  { code: "2.2", label: "Installation error", group: "Fabrication / installation" },
  { code: "3.0", label: "Operation / maintenance – general", group: "Operation / maintenance" },
  { code: "3.1", label: "Off-design service", group: "Operation / maintenance" },
  { code: "3.2", label: "Operating error", group: "Operation / maintenance" },
  { code: "3.3", label: "Maintenance error", group: "Operation / maintenance" },
  { code: "3.4", label: "Expected wear and tear", group: "Operation / maintenance" },
  { code: "4.0", label: "Management-related – general", group: "Management" },
  { code: "4.1", label: "Documentation error", group: "Management" },
  { code: "4.2", label: "Management error", group: "Management" },
  { code: "5.0", label: "Miscellaneous – general", group: "Miscellaneous" },
  { code: "5.1", label: "No cause found", group: "Miscellaneous" },
  { code: "5.2", label: "Common cause", group: "Miscellaneous" },
  { code: "5.3", label: "Combined causes", group: "Miscellaneous" },
  { code: "5.4", label: "Other unit / cascading failure", group: "Miscellaneous" },
  { code: "5.5", label: "Other", group: "Miscellaneous" },
  { code: "5.6", label: "Unknown", group: "Miscellaneous" },
];

/** Detection method (ISO 14224 Annex B). */
export const DETECTION_METHODS: Code[] = [
  { code: "1", label: "Periodic maintenance" },
  { code: "2", label: "Functional testing" },
  { code: "3", label: "Inspection" },
  { code: "4", label: "Periodic condition monitoring" },
  { code: "5", label: "Continuous condition monitoring" },
  { code: "6", label: "Production interference" },
  { code: "7", label: "Casual observation" },
  { code: "8", label: "Corrective maintenance" },
  { code: "9", label: "On demand" },
  { code: "10", label: "Other" },
];

/** Maintenance activity (ISO 14224 Annex B). */
export const MAINTENANCE_ACTIVITIES: Code[] = [
  { code: "1", label: "Replace" },
  { code: "2", label: "Repair" },
  { code: "3", label: "Modify" },
  { code: "4", label: "Adjust" },
  { code: "5", label: "Refit" },
  { code: "6", label: "Check" },
  { code: "7", label: "Service" },
  { code: "8", label: "Test" },
  { code: "9", label: "Inspection" },
  { code: "10", label: "Overhaul" },
  { code: "11", label: "Combination" },
  { code: "12", label: "Other" },
];

export type Severity = "C" | "D" | "I" | "U";
export const SEVERITY: Record<
  Severity,
  { label: string; description: string; color: string; Icon: typeof CircleAlert }
> = {
  C: {
    label: "Critical failure",
    description: "Immediate and complete loss of a function",
    color: "var(--st-unplanned)",
    Icon: OctagonAlert,
  },
  D: {
    label: "Degraded failure",
    description: "Function partly lost; may become critical over time",
    color: "var(--st-small)",
    Icon: TriangleAlert,
  },
  I: {
    label: "Incipient failure",
    description: "Imperfection that will become degraded or critical if not corrected",
    color: "var(--sys-yellow)",
    Icon: CircleAlert,
  },
  U: {
    label: "Unknown",
    description: "Severity not recorded or unknown",
    color: "var(--st-off)",
    Icon: CircleHelp,
  },
};

/* ------------------------------------------------------------------ */
/* Event model                                                          */
/* ------------------------------------------------------------------ */

export type FailureEvent = {
  id: string;
  /** Equipment tag, e.g. "PU-L3-101" */
  tag: string;
  /** Taxonomy values for levels 1–9 */
  taxonomy: string[];
  failureMode: string;
  mechanism: string;
  cause: string;
  detection: string;
  severity: Severity;
  activity: string;
  /** Failure start, ISO local “2026-11-02T09:14” */
  startedAt: string;
  downtimeH: number;
  activeRepairH: number;
  manHours: number;
  cost: number;
  currency?: string;
  remarks?: string;
};

const byCode = (list: Code[], code: string) => list.find((c) => c.code === code);
const codeText = (c?: Code) => (c ? `${c.code} — ${c.label}` : "");
const modeOption = (c: Code) => `${c.code} — ${c.label}`;

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity];
  return (
    <span
      title={s.description}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2 text-[12.5px] font-medium whitespace-nowrap",
        className,
      )}
    >
      <s.Icon className="size-3.5" style={{ color: s.color }} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

/** Code chip: monospace code + label. */
export function CodeChip({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="rounded border bg-subtle px-1 font-mono text-[11.5px] font-medium">
        {code}
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}

/** ISO 14224 taxonomy path, levels 1–9. `compact` shows a breadcrumb; otherwise a numbered list. */
export function TaxonomyPath({
  values,
  compact = false,
  highlightLevel,
  className,
}: {
  values: string[];
  compact?: boolean;
  highlightLevel?: number;
  className?: string;
}) {
  if (compact)
    return (
      <nav
        aria-label="Equipment taxonomy"
        className={cn(
          "flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground",
          className,
        )}
      >
        {values.map((v, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3 opacity-60" />}
            <span
              title={`L${i + 1} ${TAXONOMY_LEVELS[i]?.name}`}
              className={cn(i + 1 === highlightLevel && "font-medium text-foreground")}
            >
              {v}
            </span>
          </React.Fragment>
        ))}
      </nav>
    );
  return (
    <ol
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border bg-border text-[13px]",
        className,
      )}
    >
      {TAXONOMY_LEVELS.map((l, i) => (
        <li
          key={l.level}
          className={cn(
            "grid grid-cols-[28px_minmax(0,190px)_1fr] items-center gap-2 bg-card px-3 py-1.5",
            i === 5 && "border-t-2 border-t-border",
            l.level === highlightLevel && "bg-highlight-soft",
          )}
        >
          <span className="font-mono text-[11.5px] text-muted-foreground">L{l.level}</span>
          <span className="truncate text-muted-foreground">{l.name}</span>
          <span className={cn("truncate", l.level === highlightLevel && "font-medium")}>
            {values[i] ?? "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CodeSelect({
  id,
  value,
  onChange,
  list,
  placeholder,
  grouped,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  list: Code[];
  placeholder: string;
  grouped?: boolean;
}) {
  const groups = grouped ? Array.from(new Set(list.map((c) => c.group))) : [undefined];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g ?? "all"}>
            {g && <SelectLabel>{g}</SelectLabel>}
            {list
              .filter((c) => !grouped || c.group === g)
              .map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="w-7 font-mono text-[12px] text-muted-foreground">{c.code}</span>
                  {c.label}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                 */
/* ------------------------------------------------------------------ */

export type FailureReportFormProps = {
  value: FailureEvent;
  onChange: (v: FailureEvent) => void;
  /** Equipment the user can pick: tag + taxonomy path */
  equipment: { tag: string; name: string; taxonomy: string[] }[];
  className?: string;
};

/** ISO 14224 failure / maintenance event form. Controlled. */
export function FailureReportForm({
  value,
  onChange,
  equipment,
  className,
}: FailureReportFormProps) {
  const set = <K extends keyof FailureEvent>(k: K, v: FailureEvent[K]) =>
    onChange({ ...value, [k]: v });
  const eqOptions = equipment.map((e) => `${e.tag} · ${e.name}`);
  const eqCurrent = equipment.find((e) => e.tag === value.tag);
  const modeOptions = FAILURE_MODES.map(modeOption);
  const mode = byCode(FAILURE_MODES, value.failureMode);
  const num =
    (k: "downtimeH" | "activeRepairH" | "manHours" | "cost") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Number(e.target.value) || 0);
  return (
    <form className={cn("grid gap-6", className)} onSubmit={(e) => e.preventDefault()}>
      <FieldSet>
        <FieldLegend>Equipment</FieldLegend>
        <Field className="content-start">
          <FieldLabel htmlFor="fr-eq">Equipment tag</FieldLabel>
          <Combobox
            items={eqOptions}
            value={eqCurrent ? `${eqCurrent.tag} · ${eqCurrent.name}` : null}
            onValueChange={(v) => {
              const e = equipment.find((x) => v && String(v).startsWith(x.tag + " "));
              if (e) onChange({ ...value, tag: e.tag, taxonomy: e.taxonomy });
            }}
          >
            <ComboboxInput id="fr-eq" className="w-full" placeholder="Search equipment…" />
            <ComboboxContent>
              <ComboboxEmpty>No equipment found.</ComboboxEmpty>
              <ComboboxList>
                {(o: string) => (
                  <ComboboxItem key={o} value={o}>
                    {o}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {eqCurrent && <TaxonomyPath compact values={value.taxonomy} highlightLevel={8} />}
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Failure</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="content-start">
            <FieldLabel htmlFor="fr-mode">Failure mode</FieldLabel>
            <Combobox
              items={modeOptions}
              value={mode ? modeOption(mode) : null}
              onValueChange={(v) => v && set("failureMode", String(v).split(" — ")[0])}
            >
              <ComboboxInput id="fr-mode" className="w-full" placeholder="e.g. VIB, OHE, ELP…" />
              <ComboboxContent>
                <ComboboxEmpty>No failure mode found.</ComboboxEmpty>
                <ComboboxList>
                  {(o: string) => {
                    const c = byCode(FAILURE_MODES, o.split(" — ")[0])!;
                    return (
                      <ComboboxItem key={o} value={o}>
                        <span className="grid">
                          <span>
                            <span className="mr-1.5 font-mono text-[12px] font-medium">
                              {c.code}
                            </span>
                            {c.label}
                          </span>
                          <span className="text-[11.5px] text-muted-foreground">
                            {c.description}
                          </span>
                        </span>
                      </ComboboxItem>
                    );
                  }}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldDescription>
              {mode?.description ?? "What was observed — the effect, not the cause."}
            </FieldDescription>
          </Field>
          <Field className="content-start">
            <FieldLabel htmlFor="fr-sev">Severity class</FieldLabel>
            <Select value={value.severity} onValueChange={(v) => set("severity", v as Severity)}>
              <SelectTrigger id="fr-sev" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEVERITY) as Severity[]).map((s) => {
                  const m = SEVERITY[s];
                  return (
                    <SelectItem key={s} value={s}>
                      <m.Icon style={{ color: m.color }} />
                      {m.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <FieldDescription>{SEVERITY[value.severity].description}.</FieldDescription>
          </Field>
          <Field className="content-start">
            <FieldLabel htmlFor="fr-mech">Failure mechanism</FieldLabel>
            <CodeSelect
              id="fr-mech"
              value={value.mechanism}
              onChange={(v) => set("mechanism", v)}
              list={FAILURE_MECHANISMS}
              placeholder="Select mechanism"
              grouped
            />
            <FieldDescription>How it failed (physical / chemical process).</FieldDescription>
          </Field>
          <Field className="content-start">
            <FieldLabel htmlFor="fr-cause">Failure cause</FieldLabel>
            <CodeSelect
              id="fr-cause"
              value={value.cause}
              onChange={(v) => set("cause", v)}
              list={FAILURE_CAUSES}
              placeholder="Select cause"
              grouped
            />
            <FieldDescription>Why it failed (root cause category).</FieldDescription>
          </Field>
          <Field className="content-start">
            <FieldLabel htmlFor="fr-det">Detection method</FieldLabel>
            <CodeSelect
              id="fr-det"
              value={value.detection}
              onChange={(v) => set("detection", v)}
              list={DETECTION_METHODS}
              placeholder="Select method"
            />
          </Field>
          <Field className="content-start">
            <FieldLabel htmlFor="fr-start">Failure start</FieldLabel>
            <Input
              id="fr-start"
              type="datetime-local"
              value={value.startedAt}
              onChange={(e) => set("startedAt", e.target.value)}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Maintenance</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="content-start sm:col-span-2">
            <FieldLabel htmlFor="fr-act">Maintenance activity</FieldLabel>
            <CodeSelect
              id="fr-act"
              value={value.activity}
              onChange={(v) => set("activity", v)}
              list={MAINTENANCE_ACTIVITIES}
              placeholder="Select activity"
            />
          </Field>
          {(
            [
              ["downtimeH", "Down time", "h", "Equipment unavailable, failure to restart."],
              ["activeRepairH", "Active maintenance time", "h", "Hands-on repair time (for MTTR)."],
              ["manHours", "Maintenance man-hours", "mh", undefined],
              ["cost", "Cost", value.currency ?? "IDR", "Parts + labour."],
            ] as const
          ).map(([k, label, unit, help]) => (
            <Field key={k} className="content-start">
              <FieldLabel htmlFor={`fr-${k}`}>{label}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`fr-${k}`}
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step={k === "cost" ? 1000 : 0.1}
                  value={value[k]}
                  onChange={num(k)}
                  className="tabular-nums"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{unit}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {help && <FieldDescription>{help}</FieldDescription>}
            </Field>
          ))}
          <Field className="content-start sm:col-span-2">
            <FieldLabel htmlFor="fr-rem">Remarks</FieldLabel>
            <Textarea
              id="fr-rem"
              rows={2}
              value={value.remarks ?? ""}
              onChange={(e) => set("remarks", e.target.value)}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Record view                                                          */
/* ------------------------------------------------------------------ */

/** Read-only ISO 14224 failure record. */
/**
 * A failure record. `codes` adds the tenant's own codes (ISO 14224 lets a site add local codes beneath the standard
 * ones); a code found in neither list is still shown as written, never hidden.
 */
export function FailureRecord({
  event,
  codes = [],
  className,
}: {
  event: FailureEvent;
  codes?: Code[];
  className?: string;
}) {
  const find = (list: Code[], code: string) => byCode(list, code) ?? byCode(codes, code);
  const shown = (list: Code[], code: string) =>
    codeText(find(list, code)) || (code && code !== "—" ? code : "—");
  const mode = find(FAILURE_MODES, event.failureMode);
  const rows: [string, React.ReactNode][] = [
    [
      "Failure mode",
      mode ? <CodeChip code={mode.code} label={mode.label} /> : event.failureMode || "—",
    ],
    ["Failure mechanism", shown(FAILURE_MECHANISMS, event.mechanism)],
    ["Failure cause", shown(FAILURE_CAUSES, event.cause)],
    ["Detection method", shown(DETECTION_METHODS, event.detection)],
    ["Maintenance activity", shown(MAINTENANCE_ACTIVITIES, event.activity)],
    ["Failure start", event.startedAt.replace("T", " ")],
  ];
  const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });
  return (
    <article
      className={cn("w-full rounded-2xl border bg-card p-5 shadow-xs", className)}
      aria-label={`Failure record ${event.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-muted-foreground">{event.id}</div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em]">
            {event.tag} · {mode?.label ?? "Failure"}
          </div>
          <TaxonomyPath compact values={event.taxonomy} highlightLevel={8} className="mt-1" />
        </div>
        <SeverityBadge severity={event.severity} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Down time", fmt(event.downtimeH), "h"],
          ["Active repair", fmt(event.activeRepairH), "h"],
          ["Man-hours", fmt(event.manHours), "mh"],
          ["Cost", fmt(event.cost / 1e6, 2), `M ${event.currency ?? "IDR"}`],
        ].map(([l, v, u]) => (
          <div key={l} className="rounded-xl bg-subtle px-3 py-2">
            <div className="text-[12px] text-muted-foreground">{l}</div>
            <div className="text-[17px] font-semibold tabular-nums">
              {v} <span className="text-[12px] font-medium text-muted-foreground">{u}</span>
            </div>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[160px_1fr]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
        {event.remarks && (
          <>
            <dt className="text-muted-foreground">Remarks</dt>
            <dd className="text-muted-foreground">{event.remarks}</dd>
          </>
        )}
      </dl>
    </article>
  );
}
