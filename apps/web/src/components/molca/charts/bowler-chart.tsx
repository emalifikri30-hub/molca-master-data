import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BowlerRow = {
  kpi: string;
  unit?: string;
  owner: string;
  /** "up" for OEE, FPY, OTD…; "down" for scrap, downtime, cost, energy */
  goodWhen?: "up" | "down";
  /** Plan per month (same length as `months`) */
  plan: (number | null)[];
  /** Actual per month; null = not reported yet */
  actual: (number | null)[];
  /** How to roll up the year to date. Rates → "avg", counts / money → "sum", stock-like values → "last". */
  ytd?: "avg" | "sum" | "last";
  decimals?: number;
  /** Optional benchmark class per actual, shown as a dot (e.g. OEE: (v) => oeeClass(v) from lib/oee) */
  classify?: (v: number) => { color: string; label: string };
};

export type BowlerChartProps = {
  rows: BowlerRow[];
  /** Column labels, e.g. Jan … Dec */
  months: string[];
  /** Index of the current / reviewed month (header gets the blue focus marker) */
  currentMonth?: number;
  /** Width of the sticky KPI column */
  kpiWidth?: number;
  className?: string;
};

/** Is an actual on or better than its plan? */
export function bowlerMet(actual: number, plan: number, goodWhen: "up" | "down" = "up") {
  return goodWhen === "up" ? actual >= plan : actual <= plan;
}

function rollup(values: number[], mode: BowlerRow["ytd"]) {
  if (!values.length) return null;
  if (mode === "sum") return values.reduce((a, b) => a + b, 0);
  if (mode === "last") return values[values.length - 1];
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Bowler chart: KPI rows × months with a plan line and an actual line per KPI.
 * Actual cells are green when they meet plan and red when they miss it; YTD column, trend arrow and owner.
 * The KPI column is sticky and the table scrolls horizontally.
 */
export function BowlerChart({
  rows,
  months,
  currentMonth,
  kpiWidth = 190,
  className,
}: BowlerChartProps) {
  const sticky = "sticky left-0 z-10 bg-card";
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border", className)}>
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            <th
              className={cn(sticky, "border-b border-r px-3 py-2 font-medium")}
              style={{ minWidth: kpiWidth, width: kpiWidth }}
            >
              KPI
            </th>
            <th className="border-b px-3 py-2 font-medium">Owner</th>
            <th className="border-b px-2 py-2 font-medium" />
            {months.map((m, i) => (
              <th
                key={m}
                className={cn(
                  "min-w-[60px] border-b px-1 py-2 text-center font-medium",
                  i === currentMonth && "text-highlight",
                )}
              >
                <span
                  className={cn(
                    i === currentMonth && "rounded-md px-1.5 py-0.5 ring-1 ring-highlight",
                  )}
                >
                  {m}
                </span>
              </th>
            ))}
            <th className="min-w-[68px] border-b border-l px-2 py-2 text-center font-medium text-foreground">
              YTD
            </th>
            <th className="border-b px-3 py-2 text-center font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const good = r.goodWhen ?? "up";
            const d = r.decimals ?? 1;
            const f = (v: number | null) =>
              v == null
                ? "—"
                : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
            const reported = r.actual.map((a, i) => (a != null ? i : -1)).filter((i) => i >= 0);
            const ytdPlan = rollup(
              reported.map((i) => r.plan[i]).filter((v): v is number => v != null),
              r.ytd,
            );
            const ytdActual = rollup(
              reported.map((i) => r.actual[i] as number),
              r.ytd,
            );
            const last = reported.length
              ? (r.actual[reported[reported.length - 1]] as number)
              : null;
            const prev =
              reported.length > 1 ? (r.actual[reported[reported.length - 2]] as number) : null;
            const dir =
              last == null || prev == null || Math.abs(last - prev) < 10 ** -d / 2
                ? 0
                : last > prev
                  ? 1
                  : -1;
            const better = dir === 0 ? null : (dir === 1) === (good === "up");
            const TrendIcon = dir === 0 ? ArrowRight : dir === 1 ? ArrowUpRight : ArrowDownRight;
            const border = ri < rows.length - 1 ? "border-b" : "";
            const metCls = (a: number | null, p: number | null) =>
              a == null || p == null
                ? "text-muted-foreground"
                : bowlerMet(a, p, good)
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger";
            return (
              <React.Fragment key={r.kpi}>
                <tr>
                  <th
                    rowSpan={2}
                    scope="rowgroup"
                    className={cn(
                      sticky,
                      border,
                      "border-r px-3 py-2 text-left align-middle font-normal",
                    )}
                  >
                    <div className="text-[13px] font-medium text-foreground">{r.kpi}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {r.unit ? `${r.unit} · ` : ""}
                      {good === "up" ? "higher is better" : "lower is better"}
                    </div>
                  </th>
                  <td rowSpan={2} className={cn(border, "px-3 py-2 align-middle")}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {initials(r.owner)}
                      </span>
                      {r.owner}
                    </span>
                  </td>
                  <td className="px-2 pt-2 text-[11px] text-muted-foreground">Plan</td>
                  {months.map((m, i) => (
                    <td
                      key={m}
                      className={cn(
                        "px-1 pt-2 text-center tabular-nums text-muted-foreground",
                        i === currentMonth && "bg-highlight-soft/40",
                      )}
                    >
                      {f(r.plan[i] ?? null)}
                    </td>
                  ))}
                  <td className="border-l px-2 pt-2 text-center tabular-nums text-muted-foreground">
                    {f(ytdPlan)}
                  </td>
                  <td rowSpan={2} className={cn(border, "px-3 py-2 text-center align-middle")}>
                    <span
                      className={cn(
                        "inline-grid size-7 place-items-center rounded-full",
                        better == null
                          ? "bg-muted text-muted-foreground"
                          : better
                            ? "bg-success-soft text-success"
                            : "bg-danger-soft text-danger",
                      )}
                      aria-label={
                        dir === 0
                          ? "Flat"
                          : `${dir === 1 ? "Up" : "Down"} vs previous month, ${better ? "improving" : "worsening"}`
                      }
                    >
                      <TrendIcon className="size-4" />
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className={cn(border, "px-2 pb-2 text-[11px] text-muted-foreground")}>
                    Actual
                  </td>
                  {months.map((m, i) => {
                    const a = r.actual[i] ?? null;
                    const p = r.plan[i] ?? null;
                    return (
                      <td
                        key={m}
                        className={cn(
                          border,
                          "px-1 pb-2 pt-1 text-center",
                          i === currentMonth && "bg-highlight-soft/40",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block min-w-[52px] rounded-md px-1.5 py-1 font-semibold tabular-nums",
                            metCls(a, p),
                          )}
                          title={
                            a != null && p != null
                              ? `${m}: ${f(a)} vs plan ${f(p)} — ${bowlerMet(a, p, good) ? "met" : "missed"}${r.classify ? ` · ${r.classify(a).label}` : ""}`
                              : undefined
                          }
                        >
                          {a != null && r.classify && (
                            <span
                              className="mr-1 inline-block size-2 rounded-full align-middle ring-1 ring-card"
                              style={{ background: r.classify(a).color }}
                              title={r.classify(a).label}
                            />
                          )}
                          {f(a)}
                        </span>
                      </td>
                    );
                  })}
                  <td className={cn(border, "border-l px-2 pb-2 pt-1 text-center")}>
                    <span
                      className={cn(
                        "inline-block min-w-[56px] rounded-md px-1.5 py-1 font-semibold tabular-nums",
                        metCls(ytdActual, ytdPlan),
                      )}
                    >
                      {f(ytdActual)}
                    </span>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Legend: met / missed / not reported / current month. */
export function BowlerLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-success" /> Met plan
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-danger" /> Missed plan
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] border border-dashed border-muted-foreground/50" />{" "}
        Not reported
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] ring-1 ring-highlight" /> Review month
      </span>
    </div>
  );
}
