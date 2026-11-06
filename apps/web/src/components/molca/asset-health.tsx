"use client";

import { Check } from "lucide-react";
import { RiskZoneBadge } from "@/components/molca/charts/risk-matrix";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Condition grade, criticality, lifecycle                              */
/* ------------------------------------------------------------------ */

export type ConditionGrade = {
  grade: 1 | 2 | 3 | 4 | 5;
  label: string;
  min: number;
  color: string;
  action: string;
};

/** Health index 0–100 → condition grade 1 (very good) … 5 (very poor). Colors follow IEC 60073 (green normal → red fault). */
export const CONDITION_GRADES: ConditionGrade[] = [
  { grade: 5, label: "Very poor", min: 0, color: "var(--sys-red)", action: "Replace / renew now" },
  {
    grade: 4,
    label: "Poor",
    min: 30,
    color: "var(--sys-orange)",
    action: "Plan renewal, increase inspection",
  },
  {
    grade: 3,
    label: "Fair",
    min: 50,
    color: "var(--sys-yellow)",
    action: "Condition-based maintenance",
  },
  {
    grade: 2,
    label: "Good",
    min: 70,
    color: "color-mix(in oklch, var(--sys-yellow) 30%, var(--sys-green))",
    action: "Routine maintenance",
  },
  {
    grade: 1,
    label: "Very good",
    min: 85,
    color: "var(--sys-green)",
    action: "Routine maintenance",
  },
];

export function conditionGrade(hi: number): ConditionGrade {
  return [...CONDITION_GRADES].reverse().find((g) => hi >= g.min) ?? CONDITION_GRADES[0];
}

export type Criticality = "A" | "B" | "C";
export const CRITICALITY: Record<Criticality, string> = {
  A: "High — failure stops production or affects safety / environment / quality",
  B: "Medium — failure reduces output; redundancy or workaround exists",
  C: "Low — minor impact; run-to-failure acceptable",
};

export type LifecycleStage = "plan" | "acquire" | "operate" | "maintain" | "renew";
export const LIFECYCLE_STAGES: { id: LifecycleStage; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "acquire", label: "Acquire" },
  { id: "operate", label: "Operate" },
  { id: "maintain", label: "Maintain" },
  { id: "renew", label: "Renew / Dispose" },
];

export type Asset = {
  id: string;
  name: string;
  /** Equipment class / location line */
  location?: string;
  /** Asset health index 0–100 */
  hi: number;
  /** Health index 12 months ago, for the delta */
  hiPrev?: number;
  criticality: Criticality;
  likelihood: number;
  consequence: number;
  /** Remaining useful life in years and its uncertainty (±) */
  rulYears: number;
  rulBand?: number;
  ageYears: number;
  stage: LifecycleStage;
  /** Lifecycle cost to date */
  lcc: { acquisition: number; operation: number; maintenance: number };
  currency?: string;
};

const money = (v: number, cur = "IDR") =>
  `${cur} ${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} M`;

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

export function CriticalityBadge({ value, className }: { value: Criticality; className?: string }) {
  return (
    <span
      title={`Criticality ${value}: ${CRITICALITY[value]}`}
      className={cn(
        "inline-grid size-6 shrink-0 place-items-center rounded-md text-[12.5px] font-bold",
        value === "A" && "bg-foreground text-background",
        value === "B" && "border-2 border-foreground text-foreground",
        value === "C" && "border border-dashed border-muted-foreground text-muted-foreground",
        className,
      )}
      aria-label={`Criticality ${value}`}
    >
      {value}
    </span>
  );
}

export function ConditionBadge({ hi, className }: { hi: number; className?: string }) {
  const g = conditionGrade(hi);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2 text-[12.5px] font-medium whitespace-nowrap",
        className,
      )}
      title={g.action}
    >
      <span
        className="grid size-4 place-items-center rounded-full text-[10px] font-bold text-ink-on-bright"
        style={{ background: g.color }}
      >
        {g.grade}
      </span>
      {g.label}
    </span>
  );
}

/** Health index on a 0–100 scale banded by condition grade. */
export function HealthIndexBar({
  hi,
  compact = false,
  className,
}: {
  hi: number;
  compact?: boolean;
  className?: string;
}) {
  const g = conditionGrade(hi);
  const bands = [...CONDITION_GRADES].map((b, i, a) => ({ ...b, to: a[i + 1]?.min ?? 100 }));
  return (
    <div
      className={cn("w-full", className)}
      role="img"
      aria-label={`Health index ${hi} of 100, condition grade ${g.grade} ${g.label}`}
    >
      <div className={cn("relative flex gap-0.5", compact ? "h-1.5" : "h-2.5")}>
        {bands.map((b) => (
          <div
            key={b.grade}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${b.to - b.min}%`,
              background: b.color,
              opacity: b.grade === g.grade ? 1 : 0.3,
            }}
          />
        ))}
        <div
          className={cn(
            "absolute w-[3px] -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card",
            compact ? "-inset-y-1" : "-inset-y-1.5",
          )}
          style={{ left: `${hi}%` }}
        />
      </div>
      {!compact && (
        <div className="relative mt-1 h-3.5 text-[10.5px] text-muted-foreground tabular-nums">
          {[0, 30, 50, 70, 85, 100].map((t) => (
            <span
              key={t}
              className={cn(
                "absolute",
                t === 0 ? "left-0" : t === 100 ? "right-0" : "-translate-x-1/2",
              )}
              style={t === 0 || t === 100 ? undefined : { left: `${t}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LifecycleStepper({
  stage,
  className,
}: {
  stage: LifecycleStage;
  className?: string;
}) {
  const idx = LIFECYCLE_STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className={cn("flex items-center gap-1", className)} aria-label="Asset lifecycle stage">
      {LIFECYCLE_STAGES.map((s, i) => (
        <li
          key={s.id}
          className="flex min-w-0 flex-1 flex-col gap-1"
          aria-current={i === idx ? "step" : undefined}
        >
          <span
            className={cn(
              "h-1.5 rounded-full",
              i < idx ? "bg-foreground/35" : i === idx ? "bg-highlight" : "bg-muted",
            )}
          />
          <span
            className={cn(
              "flex items-start gap-0.5 text-[11px] leading-tight",
              i === idx ? "font-semibold text-highlight" : "text-muted-foreground",
            )}
          >
            {i < idx && <Check className="mt-px size-3 shrink-0" />}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

const LCC_PARTS = [
  { key: "acquisition", label: "Acquisition", color: "var(--chart-1)" },
  { key: "operation", label: "Operation (energy, consumables)", color: "var(--chart-2)" },
  { key: "maintenance", label: "Maintenance", color: "var(--chart-3)" },
] as const;

export function LccBar({
  lcc,
  currency = "IDR",
  className,
}: {
  lcc: Asset["lcc"];
  currency?: string;
  className?: string;
}) {
  const total = lcc.acquisition + lcc.operation + lcc.maintenance;
  return (
    <div className={className}>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {LCC_PARTS.map((p) => (
          <div
            key={p.key}
            style={{ width: `${(lcc[p.key] / total) * 100}%`, background: p.color }}
            title={`${p.label}: ${money(lcc[p.key], currency)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
        {LCC_PARTS.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-[2px]" style={{ background: p.color }} />
            {p.label.split(" (")[0]}{" "}
            <span className="text-foreground tabular-nums">
              {Math.round((lcc[p.key] / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                 */
/* ------------------------------------------------------------------ */

/** ISO 55000 asset card: health, criticality, risk, remaining useful life, lifecycle stage, lifecycle cost. */
export function AssetHealthCard({ asset, className }: { asset: Asset; className?: string }) {
  const a = asset;
  const g = conditionGrade(a.hi);
  const score = a.likelihood * a.consequence;
  const lccTotal = a.lcc.acquisition + a.lcc.operation + a.lcc.maintenance;
  const lifeUsed = a.ageYears / (a.ageYears + a.rulYears);
  const delta = a.hiPrev != null ? a.hi - a.hiPrev : undefined;
  return (
    <article
      className={cn(
        "w-full rounded-2xl border bg-card p-5 text-card-foreground shadow-xs",
        className,
      )}
      aria-label={`${a.id} ${a.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-muted-foreground">{a.id}</div>
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{a.name}</div>
          {a.location && (
            <div className="truncate text-[12.5px] text-muted-foreground">{a.location}</div>
          )}
        </div>
        <CriticalityBadge value={a.criticality} />
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-muted-foreground">Asset health index</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              {a.hi}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            {delta != null && (
              <span
                className={cn(
                  "text-[12.5px] font-medium tabular-nums",
                  delta >= 0 ? "text-success" : "text-danger",
                )}
              >
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} in 12 mo
              </span>
            )}
          </div>
        </div>
        <ConditionBadge hi={a.hi} />
      </div>
      <HealthIndexBar hi={a.hi} className="mt-3" />

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="rounded-xl bg-subtle px-3 py-2">
          <dt className="text-muted-foreground">
            Risk (L{a.likelihood} × C{a.consequence})
          </dt>
          <dd className="mt-1">
            <RiskZoneBadge score={score} />
          </dd>
        </div>
        <div className="rounded-xl bg-subtle px-3 py-2">
          <dt className="text-muted-foreground">Remaining useful life</dt>
          <dd className="mt-0.5 text-[17px] font-semibold tabular-nums">
            {a.rulYears.toFixed(1)}
            <span className="text-[12px] font-medium text-muted-foreground">
              {" "}
              yr{a.rulBand != null && ` ± ${a.rulBand.toFixed(1)}`}
            </span>
          </dd>
          <div
            className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
            title={`${Math.round(lifeUsed * 100)}% of expected life used (age ${a.ageYears} yr)`}
          >
            <div
              className="h-full rounded-full bg-foreground/50"
              style={{ width: `${lifeUsed * 100}%` }}
            />
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Age {a.ageYears} yr · {Math.round(lifeUsed * 100)}% life used
          </div>
        </div>
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 text-[12.5px] text-muted-foreground">Lifecycle stage</div>
        <LifecycleStepper stage={a.stage} />
      </div>

      <div className="mt-4 border-t pt-3">
        <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted-foreground">Lifecycle cost to date</span>
          <span className="font-semibold tabular-nums">{money(lccTotal, a.currency)}</span>
        </div>
        <LccBar lcc={a.lcc} currency={a.currency} />
      </div>
      <p className="sr-only">
        Condition grade {g.grade} {g.label}. Recommended: {g.action}.
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Register                                                             */
/* ------------------------------------------------------------------ */

/** One asset register row. Use inside <AssetRegister> or your own table. */
export function AssetRegisterRow({
  asset,
  selected,
  onSelect,
}: {
  asset: Asset;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const a = asset;
  const stage = LIFECYCLE_STAGES.find((s) => s.id === a.stage)!;
  const lcc = a.lcc.acquisition + a.lcc.operation + a.lcc.maintenance;
  return (
    <tr
      className={cn(
        "border-t",
        onSelect && "cursor-pointer hover:bg-subtle",
        selected && "bg-highlight-soft hover:bg-highlight-soft",
      )}
      onClick={() => onSelect?.(a.id)}
      aria-selected={onSelect ? selected : undefined}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <CriticalityBadge value={a.criticality} />
          <div className="min-w-0">
            <div className="font-mono text-[12px]">{a.id}</div>
            <div className="max-w-36 truncate text-[12.5px] text-muted-foreground">{a.name}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="w-7 text-right font-semibold tabular-nums">{a.hi}</span>
          <HealthIndexBar hi={a.hi} compact className="w-14" />
        </div>
        <div className="mt-0.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
          Grade {conditionGrade(a.hi).grade} · {conditionGrade(a.hi).label}
        </div>
      </td>
      <td className="px-3 py-2">
        <RiskZoneBadge score={a.likelihood * a.consequence} />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {a.rulYears.toFixed(1)} <span className="text-muted-foreground">yr</span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{stage.label}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {money(lcc, a.currency)}
      </td>
    </tr>
  );
}

export function AssetRegister({
  assets,
  selected,
  onSelect,
  className,
}: {
  assets: Asset[];
  selected?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-2xl border bg-card", className)}>
      <table className="w-full min-w-[600px] text-[13px]">
        <thead className="bg-subtle text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="px-3 py-2 font-medium">Health index</th>
            <th className="px-3 py-2 font-medium">Risk</th>
            <th className="px-3 py-2 text-right font-medium">RUL</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 text-right font-medium">LCC to date</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <AssetRegisterRow
              key={a.id}
              asset={a}
              selected={selected === a.id}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
