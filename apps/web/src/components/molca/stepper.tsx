"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "complete" | "current" | "upcoming" | "error";
export type StepItem = {
  title: string;
  description?: React.ReactNode;
  /** Override the status derived from `current` (e.g. "error" on a step that failed validation) */
  status?: StepStatus;
  optional?: boolean;
};

export type StepperProps = {
  steps: StepItem[];
  /** Index of the current step. Steps before it are complete. */
  current: number;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md";
  /** Allow jumping to completed steps (or any step when `linear` is false) */
  onStepClick?: (index: number) => void;
  /** When true (default) only completed steps are clickable */
  linear?: boolean;
  className?: string;
};

export function stepStatus(i: number, current: number, override?: StepStatus): StepStatus {
  if (override) return override;
  return i < current ? "complete" : i === current ? "current" : "upcoming";
}

function Indicator({
  status,
  index,
  size,
}: {
  status: StepStatus;
  index: number;
  size: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full border text-[12px] font-semibold tabular-nums transition-colors",
        size === "sm" ? "size-6 text-[11px]" : "size-8",
        status === "complete" && "border-primary bg-primary text-primary-foreground",
        status === "current" && "border-highlight bg-card text-highlight ring-4 ring-highlight/15",
        status === "upcoming" && "border-border bg-card text-muted-foreground",
        status === "error" && "border-danger bg-danger-soft text-danger",
      )}
    >
      {status === "complete" ? (
        <Check className={size === "sm" ? "size-3.5" : "size-4"} />
      ) : status === "error" ? (
        <X className={size === "sm" ? "size-3.5" : "size-4"} />
      ) : (
        index + 1
      )}
    </span>
  );
}

const STATUS_TEXT: Record<StepStatus, string> = {
  complete: "completed",
  current: "current step",
  upcoming: "not started",
  error: "has errors",
};

/** Horizontal or vertical progress through a multi-step flow. */
export function Stepper({
  steps,
  current,
  orientation = "horizontal",
  size = "md",
  onStepClick,
  linear = true,
  className,
}: StepperProps) {
  const vertical = orientation === "vertical";
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className={cn(vertical ? "grid" : "flex items-start")}>
        {steps.map((s, i) => {
          const status = stepStatus(i, current, s.status);
          const last = i === steps.length - 1;
          const clickable =
            !!onStepClick &&
            i !== current &&
            (!linear || status === "complete" || status === "error");
          const lineDone = i < current;
          const content = (
            <>
              <Indicator status={status} index={i} size={size} />
              <span
                className={cn("min-w-0", vertical ? "pb-6 pt-1" : "mt-2 block px-1 text-center")}
              >
                <span
                  className={cn(
                    "block text-[13.5px] font-medium leading-5",
                    status === "upcoming" && "text-muted-foreground",
                    status === "current" && "text-foreground",
                    status === "error" && "text-danger",
                  )}
                >
                  {s.title}
                  {s.optional && (
                    <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                      (optional)
                    </span>
                  )}
                </span>
                {s.description && (
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                    {s.description}
                  </span>
                )}
              </span>
            </>
          );
          const itemCls = cn(
            "group relative flex rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            vertical ? "items-start gap-3" : "w-full flex-col items-center",
            clickable && "cursor-pointer",
          );
          return (
            <li
              key={s.title}
              className={cn("relative", vertical ? "" : "flex-1")}
              aria-current={status === "current" ? "step" : undefined}
            >
              {/* connector */}
              {!last &&
                (vertical ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute w-0.5 rounded-full",
                      size === "sm" ? "left-[11px] top-7 bottom-1" : "left-[15px] top-9 bottom-1",
                      lineDone ? "bg-primary" : "bg-border",
                    )}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute h-0.5 rounded-full",
                      size === "sm" ? "top-[11px]" : "top-[15px]",
                      "left-[calc(50%+22px)] right-[calc(-50%+22px)]",
                      lineDone ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              {clickable ? (
                <button type="button" className={itemCls} onClick={() => onStepClick?.(i)}>
                  {content}
                  <span className="sr-only">, {STATUS_TEXT[status]}</span>
                </button>
              ) : (
                <div className={itemCls}>
                  {content}
                  <span className="sr-only">, {STATUS_TEXT[status]}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
