import * as React from "react";
import { HoverTip, TipBody, useHoverTip } from "./hover-tip";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Zones                                                                */
/* ------------------------------------------------------------------ */

export type RiskZoneId = "low" | "medium" | "high" | "extreme";
export type RiskZone = {
  id: RiskZoneId;
  label: string;
  min: number;
  max: number;
  color: string;
  action: string;
};

/** Score = likelihood × consequence (1–25). Standard 4-zone banding. */
export const RISK_ZONES: RiskZone[] = [
  {
    id: "low",
    label: "Low",
    min: 1,
    max: 4,
    color: "var(--sys-green)",
    action: "Accept; manage by routine procedures.",
  },
  {
    id: "medium",
    label: "Medium",
    min: 5,
    max: 9,
    color: "var(--sys-yellow)",
    action: "Tolerable if ALARP; assign owner, monitor.",
  },
  {
    id: "high",
    label: "High",
    min: 10,
    max: 16,
    color: "var(--sys-orange)",
    action: "Reduce; mitigation plan with due date, management attention.",
  },
  {
    id: "extreme",
    label: "Extreme",
    min: 20,
    max: 25,
    color: "var(--sys-red)",
    action: "Not acceptable; act immediately, escalate.",
  },
];

export function riskZone(score: number): RiskZone {
  return (
    RISK_ZONES.find((z) => score >= z.min && score <= z.max) ??
    (score > 16 ? RISK_ZONES[3] : RISK_ZONES[0])
  );
}

/** Soft cell fill for a zone (mixed with the card so labels stay readable in light and dark). */
export const zoneFill = (z: RiskZone, strength = 34) =>
  `color-mix(in srgb, ${z.color} ${strength}%, var(--card))`;

export const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];
export const CONSEQUENCE_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Severe"];

/** Dot + zone name + score. */
export function RiskZoneBadge({ score, className }: { score: number; className?: string }) {
  const z = riskZone(score);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2 text-[12.5px] font-medium whitespace-nowrap",
        className,
      )}
      title={z.action}
    >
      <span className="size-2.5 rounded-[3px]" style={{ background: z.color }} />
      {z.label}
      <span className="text-muted-foreground tabular-nums">{score}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix                                                               */
/* ------------------------------------------------------------------ */

export type RiskItem = { id: string; label: string; likelihood: number; consequence: number };
export type RiskCell = { likelihood: number; consequence: number };

export type RiskMatrixProps = {
  items?: RiskItem[];
  selected?: RiskCell | null;
  onSelect?: (cell: RiskCell | null, items: RiskItem[]) => void;
  /** dots: one dot per item · count: a number · score: only L × C */
  mode?: "dots" | "count" | "score";
  likelihoodLabels?: string[];
  consequenceLabels?: string[];
  /** Show L × C in each cell corner */
  showScore?: boolean;
  className?: string;
};

/**
 * 5 × 5 likelihood × consequence matrix with the standard green / yellow / orange / red zones.
 * Likelihood 5 is at the top, consequence 5 at the right. The selected cell gets a blue ring.
 */
export function RiskMatrix({
  items = [],
  selected,
  onSelect,
  mode = "dots",
  likelihoodLabels = LIKELIHOOD_LABELS,
  consequenceLabels = CONSEQUENCE_LABELS,
  showScore = true,
  className,
}: RiskMatrixProps) {
  const tip = useHoverTip();
  const at = (l: number, c: number) =>
    items.filter((i) => i.likelihood === l && i.consequence === c);
  return (
    <div ref={tip.ref} className={cn("relative w-full", className)}>
      <div className="grid grid-cols-[20px_88px_repeat(5,minmax(0,1fr))] gap-1">
        {/* y axis title */}
        <div className="row-span-5 flex items-center justify-center">
          <span className="-rotate-90 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
            Likelihood →
          </span>
        </div>
        {[5, 4, 3, 2, 1].map((l) => (
          <React.Fragment key={l}>
            <div className="flex flex-col justify-center pr-1 text-right text-[12px] leading-tight">
              <span className="font-medium">{likelihoodLabels[l - 1]}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">L{l}</span>
            </div>
            {[1, 2, 3, 4, 5].map((c) => {
              const score = l * c;
              const z = riskZone(score);
              const list = at(l, c);
              const on = selected?.likelihood === l && selected?.consequence === c;
              const body = (
                <TipBody
                  title={`L${l} ${likelihoodLabels[l - 1]} × C${c} ${consequenceLabels[c - 1]}`}
                  value={`${z.label} · ${score}`}
                  color={z.color}
                  rows={list.slice(0, 6).map((i) => ({ label: i.id, value: i.label }))}
                  note={
                    list.length > 6
                      ? `+${list.length - 6} more`
                      : list.length
                        ? undefined
                        : "No assets"
                  }
                />
              );
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={onSelect ? on : undefined}
                  aria-label={`Likelihood ${l} ${likelihoodLabels[l - 1]}, consequence ${c} ${consequenceLabels[c - 1]}: ${z.label} risk, score ${score}, ${list.length} items`}
                  onClick={() =>
                    onSelect?.(on ? null : { likelihood: l, consequence: c }, on ? [] : list)
                  }
                  onMouseEnter={(e) => tip.show(e, body)}
                  onFocus={(e) => tip.show(e, body)}
                  onMouseLeave={tip.hide}
                  onBlur={tip.hide}
                  className={cn(
                    "relative flex aspect-[4/3] min-h-12 flex-col items-center justify-center rounded-lg text-foreground outline-none transition-shadow",
                    !onSelect && "cursor-default",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    on && "z-10 ring-[3px] ring-highlight ring-offset-2 ring-offset-card",
                    selected && !on && "opacity-60",
                  )}
                  style={{ background: zoneFill(z, list.length || mode === "score" ? 40 : 24) }}
                >
                  {showScore && mode !== "score" && (
                    <span className="absolute top-1 left-1.5 text-[10.5px] text-foreground/60 tabular-nums">
                      {score}
                    </span>
                  )}
                  {mode === "score" && (
                    <span className="text-[15px] font-semibold tabular-nums">{score}</span>
                  )}
                  {mode === "count" && list.length > 0 && (
                    <span className="text-[18px] font-semibold tabular-nums">{list.length}</span>
                  )}
                  {mode === "dots" && list.length > 0 && (
                    <span className="flex max-w-[80%] flex-wrap items-center justify-center gap-1">
                      {list.slice(0, 6).map((i) => (
                        <span
                          key={i.id}
                          className="size-2.5 rounded-full bg-foreground ring-2 ring-card/70"
                        />
                      ))}
                      {list.length > 6 && (
                        <span className="text-[11px] font-semibold">+{list.length - 6}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
        {/* x axis */}
        <div />
        <div />
        {consequenceLabels.map((c, i) => (
          <div key={c} className="pt-1 text-center text-[12px] leading-tight">
            <div className="font-medium">{c}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">C{i + 1}</div>
          </div>
        ))}
        <div />
        <div />
        <div className="col-span-5 text-center text-[11.5px] font-medium text-muted-foreground">
          Consequence →
        </div>
      </div>
      <HoverTip state={tip.state} />
    </div>
  );
}

/** Zone legend with score ranges and the required response. */
export function RiskZoneLegend({
  layout = "inline",
  className,
}: {
  layout?: "inline" | "list";
  className?: string;
}) {
  if (layout === "list")
    return (
      <ul className={cn("grid gap-1.5", className)}>
        {RISK_ZONES.map((z) => (
          <li
            key={z.id}
            className="grid grid-cols-[14px_72px_48px_1fr] items-center gap-2 text-[12.5px]"
          >
            <span className="size-3 rounded-[3px]" style={{ background: z.color }} />
            <span className="font-medium">{z.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {z.min}–{z.max}
            </span>
            <span className="text-muted-foreground">{z.action}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {RISK_ZONES.map((z) => (
        <span key={z.id} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: z.color }} />
          {z.label}
          <span className="tabular-nums">
            {z.min}–{z.max}
          </span>
        </span>
      ))}
    </div>
  );
}
