import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Stat strip: the row of day-running numbers on top of an operations page — one bordered band, cells divided, each
 * with its label, the number and one line of context. A status dot by the label says at a glance whether the
 * number is normal (green), needs attention (orange) or is a problem (red); neutral counts carry no dot.
 * The status comes from `status`, or from `tone`: a toned number is normal at zero and takes its tone otherwise.
 */
export type StatStatus = "ok" | "warn" | "bad";
export type StatCell = {
  label: string;
  value: React.ReactNode;
  /** CSS colour for a value that needs attention (e.g. var(--sys-red)); omit for a neutral number */
  tone?: string;
  /** Explicit status; overrides what `tone` implies */
  status?: StatStatus;
  /** One short line under the number (scope, target) */
  sub?: React.ReactNode;
  /** Makes the cell a link (an <a> or a router link the app renders around the content) */
  wrap?: (children: React.ReactNode, className: string) => React.ReactNode;
};

const STATUS_COLOR: Record<StatStatus, string> = {
  ok: "var(--sys-green)",
  warn: "var(--sys-orange)",
  bad: "var(--sys-red)",
};
const STATUS_LABEL: Record<StatStatus, string> = {
  ok: "Normal",
  warn: "Needs attention",
  bad: "Problem",
};

const isZero = (v: React.ReactNode) => v === 0 || v === "0" || v === "0%";

function statusOf(c: StatCell): StatStatus | undefined {
  if (c.status) return c.status;
  if (!c.tone) return undefined;
  if (isZero(c.value)) return "ok";
  return /red|danger/.test(c.tone) ? "bad" : "warn";
}

export function StatStrip({
  cells,
  cols,
  className,
}: {
  cells: StatCell[];
  cols?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-4 sm:divide-y-0 [&>*]:border-border",
        cols ?? (cells.length > 6 ? "xl:grid-cols-8" : cells.length > 4 ? "xl:grid-cols-6" : ""),
        // when the strip wraps onto a second row, the cells of that row need a top border too
        cells.length > 4 && "sm:divide-y xl:divide-y-0",
        className,
      )}
    >
      {cells.map((c) => {
        const st = statusOf(c);
        const zero = isZero(c.value);
        const color =
          st === "bad" ? STATUS_COLOR.bad : st === "warn" ? STATUS_COLOR.warn : undefined;
        const body = (
          <>
            <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
              {st && <Dot st={st} />}
              <span className="truncate">{c.label}</span>
            </div>
            <div
              className="mt-1 truncate text-[22px] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums"
              style={{ color: color ?? (zero && !st ? "var(--muted-foreground)" : undefined) }}
            >
              {c.value}
            </div>
            {c.sub != null && (
              <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{c.sub}</div>
            )}
          </>
        );
        const cls = "block min-w-0 px-4 py-3";
        return (
          <React.Fragment key={c.label}>
            {c.wrap ? (
              c.wrap(body, cn(cls, "transition-colors hover:bg-subtle/60"))
            ) : (
              <div className={cls}>{body}</div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Dot({ st, className }: { st: StatStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[st]}
      title={STATUS_LABEL[st]}
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ background: STATUS_COLOR[st] }}
    />
  );
}
