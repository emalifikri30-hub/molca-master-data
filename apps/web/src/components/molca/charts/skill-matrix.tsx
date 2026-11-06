"use client";

import { cn } from "@/lib/utils";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";

export type SkillLevel = 0 | 1 | 2 | 3 | 4;
export type SkillOperator = { name: string; shift?: string; role?: string };
export type SkillStation = {
  id: string;
  name: string;
  /** Operators that must be qualified (≥ qualifiedLevel) to run all shifts */ required: number;
};
export type SkillTarget = { level: SkillLevel; due?: string } | null;

/** ILUO: I = in training, L = works with supervision, U = works alone to standard, O = can train others. */
export const SKILL_LEVELS: Record<SkillLevel, { code: string; label: string }> = {
  0: { code: "–", label: "Not trained" },
  1: { code: "I", label: "In training" },
  2: { code: "L", label: "Works with supervision" },
  3: { code: "U", label: "Works alone to standard" },
  4: { code: "O", label: "Can train others" },
};

function quarter(k: number, c: number, r: number) {
  const a1 = (k * Math.PI) / 2;
  const a2 = ((k + 1) * Math.PI) / 2;
  const p = (a: number) =>
    `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
  return `M${c} ${c} L${p(a1)} A${r} ${r} 0 0 1 ${p(a2)} Z`;
}

/** The ILUO pie: one filled quarter per level, planned quarters faint. */
export function SkillPie({
  level,
  target,
  size = 22,
  className,
}: {
  level: SkillLevel;
  target?: SkillLevel;
  size?: number;
  className?: string;
}) {
  const c = size / 2;
  const r = size / 2 - 1.5;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {[0, 1, 2, 3].map((k) => (
        <path
          key={k}
          d={quarter(k, c, r)}
          fill={
            k < level
              ? "var(--chart-1)"
              : target != null && k < target
                ? "color-mix(in oklab, var(--chart-1) 28%, transparent)"
                : "transparent"
          }
        />
      ))}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={level === 0 && !target ? "var(--border)" : "var(--muted-foreground)"}
        strokeOpacity={level === 0 && !target ? 1 : 0.55}
        strokeWidth={1.25}
        strokeDasharray={target != null && target > level ? "2.5 2" : undefined}
      />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="var(--card)" strokeWidth={1} />
      <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="var(--card)" strokeWidth={1} />
    </svg>
  );
}

export type SkillMatrixProps = {
  operators: SkillOperator[];
  stations: SkillStation[];
  /** operators × stations */
  levels: SkillLevel[][];
  /** Planned training target per cell (dashed outline + faint quarters) */
  targets?: SkillTarget[][];
  /** Level that counts as qualified for coverage. Default 3 (U). */
  qualifiedLevel?: SkillLevel;
  operatorWidth?: number;
  className?: string;
};

/**
 * Skill / training matrix (operators × stations) with ILUO quarter pies.
 * Footer rows show coverage per station (qualified vs required); stations below the requirement are flagged red.
 */
export function SkillMatrix({
  operators,
  stations,
  levels,
  targets,
  qualifiedLevel = 3,
  operatorWidth = 170,
  className,
}: SkillMatrixProps) {
  const tip = useHoverTip();
  const sticky = "sticky left-0 z-10 bg-card";
  const coverage = stations.map(
    (_, si) => operators.filter((_, oi) => (levels[oi]?.[si] ?? 0) >= qualifiedLevel).length,
  );
  const training = stations.map(
    (_, si) =>
      operators.filter((_, oi) => (targets?.[oi]?.[si]?.level ?? 0) > (levels[oi]?.[si] ?? 0))
        .length,
  );
  const q = SKILL_LEVELS[qualifiedLevel].code;

  return (
    <div ref={tip.ref} className={cn("relative w-full", className)}>
      <div className="w-full overflow-x-auto rounded-xl border">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              <th
                className={cn(
                  sticky,
                  "border-b border-r px-3 py-2 text-left align-bottom text-[11.5px] font-medium text-muted-foreground",
                )}
                style={{ minWidth: operatorWidth }}
              >
                Operator
              </th>
              {stations.map((s, si) => {
                const gap = coverage[si] < s.required;
                return (
                  <th
                    key={s.id}
                    className={cn(
                      "min-w-[64px] border-b px-1 py-2 align-bottom font-medium",
                      gap && "bg-danger-soft",
                    )}
                  >
                    <div className="mx-auto w-[60px] text-center text-[11.5px] leading-tight">
                      <div className="text-foreground">{s.name}</div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">{s.id}</div>
                    </div>
                  </th>
                );
              })}
              <th className="border-b border-l px-3 py-2 text-center align-bottom text-[11.5px] font-medium text-muted-foreground">
                Skills ≥ {q}
              </th>
            </tr>
          </thead>
          <tbody>
            {operators.map((o, oi) => {
              const n = stations.filter(
                (_, si) => (levels[oi]?.[si] ?? 0) >= qualifiedLevel,
              ).length;
              return (
                <tr key={o.name}>
                  <th
                    scope="row"
                    className={cn(sticky, "border-b border-r px-3 py-1.5 text-left font-normal")}
                  >
                    <div className="text-[13px] font-medium">{o.name}</div>
                    {(o.role || o.shift) && (
                      <div className="text-[11.5px] text-muted-foreground">
                        {[o.role, o.shift].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </th>
                  {stations.map((s, si) => {
                    const l = (levels[oi]?.[si] ?? 0) as SkillLevel;
                    const t = targets?.[oi]?.[si] ?? null;
                    const planned = t && t.level > l ? t : null;
                    return (
                      <td
                        key={s.id}
                        className={cn(
                          "border-b px-1 py-1.5 text-center",
                          coverage[si] < s.required && "bg-danger-soft/50",
                        )}
                        aria-label={`${o.name}, ${s.name}: ${SKILL_LEVELS[l].code} ${SKILL_LEVELS[l].label}${planned ? `, training to ${SKILL_LEVELS[planned.level].code}${planned.due ? ` by ${planned.due}` : ""}` : ""}`}
                        onMouseEnter={(e) =>
                          tip.show(
                            e,
                            <TipBody
                              title={`${o.name} · ${s.name}`}
                              value={`${SKILL_LEVELS[l].code} · ${SKILL_LEVELS[l].label}`}
                              note={
                                planned
                                  ? `Training to ${SKILL_LEVELS[planned.level].code}${planned.due ? ` by ${planned.due}` : ""}`
                                  : undefined
                              }
                            />,
                          )
                        }
                        onMouseLeave={tip.hide}
                      >
                        <span className="inline-flex rounded-full p-0.5 transition-colors hover:bg-muted">
                          <SkillPie level={l} target={planned?.level} />
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-b border-l px-3 py-1.5 text-center font-semibold tabular-nums">
                    {n}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className={cn(sticky, "border-r px-3 pt-2 text-left text-[12px] font-medium")}
              >
                Qualified (≥ {q}) / required
              </th>
              {stations.map((s, si) => {
                const gap = coverage[si] < s.required;
                return (
                  <td key={s.id} className={cn("px-1 pt-2 text-center", gap && "bg-danger-soft")}>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        gap ? "text-danger" : "text-foreground",
                      )}
                    >
                      {coverage[si]}
                      <span className="font-normal text-muted-foreground">/{s.required}</span>
                    </span>
                  </td>
                );
              })}
              <td className="border-l" />
            </tr>
            <tr>
              <th
                scope="row"
                className={cn(
                  sticky,
                  "border-r px-3 pb-2 text-left text-[12px] font-normal text-muted-foreground",
                )}
              >
                In training
              </th>
              {stations.map((s, si) => (
                <td
                  key={s.id}
                  className={cn(
                    "px-1 pb-2 text-center text-muted-foreground tabular-nums",
                    coverage[si] < s.required && "bg-danger-soft",
                  )}
                >
                  {training[si] || "–"}
                </td>
              ))}
              <td className="border-l" />
            </tr>
          </tfoot>
        </table>
      </div>
      <HoverTip state={tip.state} />
    </div>
  );
}

/** Legend for the ILUO quarters, planned training and gaps. */
export function SkillLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {([1, 2, 3, 4] as SkillLevel[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <SkillPie level={l} size={16} />
          <b className="font-semibold text-foreground">{SKILL_LEVELS[l].code}</b>{" "}
          {SKILL_LEVELS[l].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <SkillPie level={1} target={3} size={16} /> Planned training
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-[3px] bg-danger-soft ring-1 ring-danger/40" /> Coverage gap
      </span>
    </div>
  );
}
