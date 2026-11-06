import * as React from "react";
import { ArrowRight, Factory, RefreshCw, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type VsmFlow = "push" | "fifo" | "pull";

export type VsmProcess = {
  name: string;
  /** Cycle time per unit in seconds */
  ct: number;
  /** Changeover time in minutes */
  co: number;
  /** Uptime (availability) in % */
  uptime: number;
  operators: number;
  /** Inventory waiting in front of this process (units) */
  wipBefore: number;
  /** How material reaches this process from the previous step */
  flowIn?: VsmFlow;
};

export type ValueStreamMapProps = {
  supplier: { name: string; delivery?: string };
  customer: { name: string; delivery?: string };
  /** Customer demand per day (units) */
  dailyDemand: number;
  /** Available working seconds per day (e.g. 2 shifts × 27,000 s) */
  availableSecondsPerDay: number;
  processes: VsmProcess[];
  /** Finished goods before shipping (units) */
  finishedGoods: number;
  /** How shipping pulls from finished goods */
  shipFlow?: VsmFlow;
  /** Production control box text */
  control?: string;
  unit?: string;
  className?: string;
};

/**
 * Lead-time math. Inventory days = units ÷ daily demand. Lead time = Σ inventory days (+ VA, negligible).
 * PCE = value-added time ÷ lead time, with lead time converted to working seconds.
 */
export function vsmStats({
  processes,
  finishedGoods,
  dailyDemand,
  availableSecondsPerDay,
}: Pick<
  ValueStreamMapProps,
  "processes" | "finishedGoods" | "dailyDemand" | "availableSecondsPerDay"
>) {
  const waits = [...processes.map((p) => p.wipBefore / dailyDemand), finishedGoods / dailyDemand];
  const leadDays = waits.reduce((a, b) => a + b, 0);
  const va = processes.reduce((a, p) => a + p.ct, 0);
  const takt = availableSecondsPerDay / dailyDemand;
  return {
    waits,
    leadDays,
    va,
    takt,
    pce: (va / (leadDays * availableSecondsPerDay)) * 100,
    bottleneck: processes.reduce((m, p, i) => (p.ct > processes[m].ct ? i : m), 0),
  };
}

const f = (v: number, d = 1) => v.toLocaleString("en-US", { maximumFractionDigits: d });

/** Red scale for waiting (a loss): more days = redder. */
const waitColor = (days: number, max: number) =>
  `color-mix(in srgb, var(--sys-red) ${Math.round(20 + (days / max) * 80)}%, var(--card))`;

function InventoryTriangle({
  days,
  max,
  qty,
  unit,
}: {
  days: number;
  max: number;
  qty: number;
  unit: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 text-center"
      role="img"
      aria-label={`Inventory ${qty} ${unit}, ${f(days)} days`}
    >
      <svg viewBox="0 0 32 28" className="h-7 w-8">
        <path
          d="M16 2 L30 26 L2 26 Z"
          fill={waitColor(days, max)}
          stroke="var(--sys-red)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <text
          x={16}
          y={21}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="var(--foreground)"
        >
          I
        </text>
      </svg>
      <span className="text-[11px] font-medium tabular-nums">
        {qty >= 1000 ? `${f(qty / 1000)}k` : qty}
      </span>
      <span className="text-[10.5px] text-muted-foreground tabular-nums">{f(days)} d</span>
    </div>
  );
}

function FlowGlyph({ flow }: { flow: VsmFlow }) {
  if (flow === "fifo")
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded border px-1 text-[9.5px] font-semibold tracking-wide text-muted-foreground"
        title="FIFO lane"
      >
        FIFO <ArrowRight className="size-2.5" />
      </span>
    );
  if (flow === "pull")
    return (
      <span
        className="inline-flex items-center gap-0.5 text-muted-foreground"
        title="Pull (supermarket + kanban)"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path
            d="M2 2 H14 V14 H2 M2 6 H12 M2 10 H12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </svg>
        <RefreshCw className="size-3" />
      </span>
    );
  return (
    <svg
      viewBox="0 0 40 12"
      className="h-3 w-10 text-muted-foreground"
      aria-label="Push"
      role="img"
    >
      <defs>
        <pattern
          id="vsm-push"
          width="5"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="skewX(-30)"
        >
          <rect width="2.5" height="12" fill="currentColor" />
        </pattern>
      </defs>
      <path
        d="M0 3 H30 V0 L40 6 L30 12 V9 H0 Z"
        fill="url(#vsm-push)"
        stroke="currentColor"
        strokeWidth={0.8}
      />
    </svg>
  );
}

/**
 * Simplified value stream map: supplier, production control and customer on top; process boxes with data boxes
 * (C/T, C/O, uptime, operators), inventory triangles and push / FIFO / pull flow in the middle; the lead-time ladder
 * (waiting days vs value-added seconds) and PCE at the bottom.
 */
export function ValueStreamMap({
  supplier,
  customer,
  dailyDemand,
  availableSecondsPerDay,
  processes,
  finishedGoods,
  shipFlow = "pull",
  control = "Production control · MES",
  unit = "pcs",
  className,
}: ValueStreamMapProps) {
  const s = vsmStats({ processes, finishedGoods, dailyDemand, availableSecondsPerDay });
  const maxWait = Math.max(...s.waits);
  const qtys = [...processes.map((p) => p.wipBefore), finishedGoods];
  const flows: VsmFlow[] = [...processes.map((p) => p.flowIn ?? "push"), shipFlow];
  const INV = "w-11 shrink-0";
  const PROC = "min-w-[96px] flex-1";

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-[600px] text-[12px]">
        {/* top: supplier · control · customer */}
        <div className="grid grid-cols-[1fr_1.4fr_1fr] items-start gap-3">
          <div className="rounded-lg border bg-subtle p-2.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <Factory className="size-3.5 text-muted-foreground" /> {supplier.name}
            </div>
            {supplier.delivery && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Truck className="size-3" /> {supplier.delivery}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-dashed p-2.5 text-center">
            <div className="font-semibold">{control}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Weekly forecast in · daily schedule to each process
            </div>
          </div>
          <div className="rounded-lg border bg-subtle p-2.5 text-right">
            <div className="flex items-center justify-end gap-1.5 font-semibold">
              {customer.name} <Factory className="size-3.5 text-muted-foreground" />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {dailyDemand.toLocaleString("en-US")} {unit}/day · takt {f(s.takt, 2)} s
            </div>
            {customer.delivery && (
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                <Truck className="size-3" /> {customer.delivery}
              </div>
            )}
          </div>
        </div>

        {/* flow row */}
        <div className="mt-5 flex items-start">
          {processes.map((p, i) => (
            <React.Fragment key={p.name}>
              <div className={cn(INV, "flex flex-col items-center gap-1.5 pt-3")}>
                <InventoryTriangle days={s.waits[i]} max={maxWait} qty={qtys[i]} unit={unit} />
                {i > 0 && <FlowGlyph flow={flows[i]} />}
              </div>
              <div className={cn(PROC, "px-1")}>
                <div
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-t-lg border bg-card px-2 py-1.5 text-center font-semibold leading-tight",
                    i === s.bottleneck && p.ct > s.takt && "border-danger",
                  )}
                >
                  {p.name}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 whitespace-nowrap rounded-b-lg border border-t-0 bg-subtle px-2 py-1.5 text-[11px] tabular-nums">
                  <dt className="text-muted-foreground">C/T</dt>
                  <dd className={cn("text-right font-medium", p.ct > s.takt && "text-danger")}>
                    {f(p.ct)} s
                  </dd>
                  <dt className="text-muted-foreground">C/O</dt>
                  <dd className="text-right">{p.co} min</dd>
                  <dt className="text-muted-foreground">Up</dt>
                  <dd className="text-right">{p.uptime}%</dd>
                  <dt className="text-muted-foreground">
                    <Users className="inline size-3" aria-label="Operators" />
                  </dt>
                  <dd className="text-right">{p.operators}</dd>
                </dl>
              </div>
            </React.Fragment>
          ))}
          <div className={cn(INV, "flex flex-col items-center gap-1.5 pt-3")}>
            <InventoryTriangle
              days={s.waits.at(-1)!}
              max={maxWait}
              qty={finishedGoods}
              unit={unit}
            />
            <FlowGlyph flow={shipFlow} />
          </div>
        </div>

        {/* lead-time ladder */}
        <div
          className="mt-5 flex items-stretch"
          role="img"
          aria-label={`Lead-time ladder: ${f(s.leadDays)} days waiting, ${f(s.va)} seconds value-added`}
        >
          {processes.map((p, i) => (
            <React.Fragment key={p.name}>
              <LadderWait days={s.waits[i]} max={maxWait} className={INV} />
              <div className={cn(PROC, "flex h-14 flex-col")}>
                <div className="mt-4 h-6 border-x-2 border-b-2 border-chart-1" />
                <div className="pt-0.5 text-center text-[11px] font-medium tabular-nums text-highlight">
                  {f(p.ct)} s
                </div>
              </div>
            </React.Fragment>
          ))}
          <LadderWait days={s.waits.at(-1)!} max={maxWait} className={INV} />
        </div>

        {/* totals */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Total label="Production lead time" value={f(s.leadDays)} unit="days" tone="loss" />
          <Total label="Value-added time" value={f(s.va)} unit="s" tone="va" />
          <Total label="Process cycle efficiency" value={f(s.pce, 4)} unit="%" />
        </div>
      </div>
    </div>
  );
}

function LadderWait({ days, max, className }: { days: number; max: number; className?: string }) {
  return (
    <div className={cn(className, "flex h-14 flex-col")}>
      <div className="h-4 text-center text-[11px] font-medium leading-4 tabular-nums">
        {f(days)} d
      </div>
      <div
        className="h-0 border-t-2"
        style={{
          borderColor: `color-mix(in srgb, var(--sys-red) ${Math.round(35 + (days / max) * 65)}%, var(--card))`,
        }}
      />
    </div>
  );
}

function Total({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "loss" | "va";
}) {
  return (
    <div className="rounded-lg border bg-subtle px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        {tone && (
          <span className={cn("h-0.5 w-3", tone === "loss" ? "bg-sys-red" : "bg-chart-1")} />
        )}
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] tabular-nums">
        {value} <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
