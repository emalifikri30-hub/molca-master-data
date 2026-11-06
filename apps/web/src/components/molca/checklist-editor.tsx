"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * A job plan checklist (PM / inspection steps). check = a tick box; measure = a reading with a unit.
 * Mandatory steps (hygiene, LOTO) must be done before the work order can be completed.
 */
export type ChecklistStepKind = "check" | "measure";
export type ChecklistStep = {
  key: string;
  text: string;
  kind: ChecklistStepKind;
  unit?: string | null;
  mandatory: boolean;
};

let seq = 0;
export const newStep = (text = ""): ChecklistStep => ({
  key: `s${Date.now()}-${seq++}`,
  text,
  kind: "check",
  unit: null,
  mandatory: false,
});

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type ChecklistEditorProps = {
  steps: ChecklistStep[];
  onChange: (steps: ChecklistStep[]) => void;
  readOnly?: boolean;
  className?: string;
};

export function ChecklistEditor({ steps, onChange, readOnly, className }: ChecklistEditorProps) {
  const [drag, setDrag] = React.useState<number | null>(null);
  const set = (i: number, patch: Partial<ChecklistStep>) =>
    onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s!);
    onChange(next);
  };
  const field =
    "h-8 rounded-md border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60";
  return (
    <div className={cn("grid gap-1.5", className)}>
      {steps.map((s, i) => (
        <div
          key={s.key}
          draggable={!readOnly}
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag !== null) move(drag, i);
            setDrag(null);
          }}
          className={cn(
            "flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5",
            drag === i && "opacity-50",
            s.mandatory && "border-l-4",
          )}
          style={s.mandatory ? { borderLeftColor: "var(--sys-red)" } : undefined}
        >
          {!readOnly && (
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
          )}
          <span className="w-6 shrink-0 text-center text-[12px] text-muted-foreground tabular-nums">
            {i + 1}
          </span>
          <input
            aria-label={`Step ${i + 1}`}
            className={cn(field, "min-w-48 flex-1")}
            value={s.text}
            disabled={readOnly}
            placeholder="Step instruction"
            onChange={(e) => set(i, { text: e.target.value })}
          />
          <select
            aria-label="Kind"
            className={cn(field, "w-28")}
            value={s.kind}
            disabled={readOnly}
            onChange={(e) =>
              set(i, {
                kind: e.target.value as ChecklistStepKind,
                unit: e.target.value === "measure" ? (s.unit ?? "") : null,
              })
            }
          >
            <option value="check">Check</option>
            <option value="measure">Measure</option>
          </select>
          {s.kind === "measure" && (
            <input
              aria-label="Unit"
              className={cn(field, "w-20")}
              value={s.unit ?? ""}
              disabled={readOnly}
              placeholder="Unit"
              onChange={(e) => set(i, { unit: e.target.value })}
            />
          )}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => set(i, { mandatory: !s.mandatory })}
            title="Mandatory before completion (hygiene, LOTO)"
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px]",
              s.mandatory ? "font-medium" : "text-muted-foreground",
            )}
            style={s.mandatory ? { color: "var(--sys-red)" } : undefined}
          >
            <ShieldCheck className="size-3.5" />
            Mandatory
          </button>
          {!readOnly && (
            <span className="ml-auto flex items-center">
              <button
                type="button"
                aria-label="Move up"
                className="grid size-7 place-items-center rounded-md hover:bg-subtle disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                className="grid size-7 place-items-center rounded-md hover:bg-subtle disabled:opacity-30"
                disabled={i === steps.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Remove step"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-subtle hover:text-foreground"
                onClick={() => onChange(steps.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...steps, newStep()])}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-dashed text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          <Plus className="size-4" />
          Add step
        </button>
      )}
    </div>
  );
}
