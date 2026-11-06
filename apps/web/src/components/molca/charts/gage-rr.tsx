import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltipPanel } from "./chart-tooltip";
import { mean, niceDomain } from "./spc-stats";
import { cn } from "@/lib/utils";

export type GageMeasurement = { part: string; operator: string; value: number };

export type GageRRResult = {
  parts: string[];
  operators: string[];
  trials: number;
  /** variance components (σ²) */
  variance: {
    repeatability: number;
    reproducibility: number;
    operator: number;
    interaction: number;
    gageRR: number;
    partToPart: number;
    total: number;
  };
  /** standard deviations (σ) */
  sd: {
    repeatability: number;
    reproducibility: number;
    gageRR: number;
    partToPart: number;
    total: number;
  };
  pctContribution: {
    repeatability: number;
    reproducibility: number;
    gageRR: number;
    partToPart: number;
  };
  pctStudyVar: {
    repeatability: number;
    reproducibility: number;
    gageRR: number;
    partToPart: number;
  };
  /** 6σ / tolerance × 100, when a tolerance is given */
  pctTolerance?: {
    repeatability: number;
    reproducibility: number;
    gageRR: number;
    partToPart: number;
  };
  /** number of distinct categories = ⌊1.41 · σ_part / σ_GRR⌋ */
  ndc: number;
  /** mean per operator × part, for the interaction chart */
  cellMeans: Record<string, Record<string, number>>;
};

/**
 * Crossed Gage R&R by the ANOVA method (AIAG MSA 4th ed.). Every operator measures every part `r` times.
 * σ²_repeat = MS_E · σ²_op×part = (MS_OP − MS_E)/r · σ²_op = (MS_O − MS_OP)/(p·r) · σ²_part = (MS_P − MS_OP)/(o·r); negatives → 0.
 */
export function gageRR(
  data: readonly GageMeasurement[],
  { tolerance }: { tolerance?: number } = {},
): GageRRResult {
  const parts = [...new Set(data.map((d) => d.part))];
  const operators = [...new Set(data.map((d) => d.operator))];
  const p = parts.length;
  const o = operators.length;
  const cell = (pt: string, op: string) =>
    data.filter((d) => d.part === pt && d.operator === op).map((d) => d.value);
  const r = cell(parts[0], operators[0]).length;
  const grand = mean(data.map((d) => d.value));
  const pm = Object.fromEntries(
    parts.map((pt) => [pt, mean(data.filter((d) => d.part === pt).map((d) => d.value))]),
  );
  const om = Object.fromEntries(
    operators.map((op) => [op, mean(data.filter((d) => d.operator === op).map((d) => d.value))]),
  );
  const cellMeans: Record<string, Record<string, number>> = {};
  let ssPO = 0;
  let ssE = 0;
  for (const pt of parts) {
    cellMeans[pt] = {};
    for (const op of operators) {
      const vs = cell(pt, op);
      const m = mean(vs);
      cellMeans[pt][op] = m;
      ssPO += r * (m - pm[pt] - om[op] + grand) ** 2;
      ssE += vs.reduce((s, v) => s + (v - m) ** 2, 0);
    }
  }
  const ssP = o * r * parts.reduce((s, pt) => s + (pm[pt] - grand) ** 2, 0);
  const ssO = p * r * operators.reduce((s, op) => s + (om[op] - grand) ** 2, 0);
  const msP = ssP / (p - 1);
  const msO = ssO / (o - 1);
  const msPO = ssPO / ((p - 1) * (o - 1));
  const msE = ssE / (p * o * (r - 1));

  const repeatability = msE;
  const interaction = Math.max(0, (msPO - msE) / r);
  const operator = Math.max(0, (msO - msPO) / (p * r));
  const partToPart = Math.max(0, (msP - msPO) / (o * r));
  const reproducibility = operator + interaction;
  const gage = repeatability + reproducibility;
  const total = gage + partToPart;
  const sd = {
    repeatability: Math.sqrt(repeatability),
    reproducibility: Math.sqrt(reproducibility),
    gageRR: Math.sqrt(gage),
    partToPart: Math.sqrt(partToPart),
    total: Math.sqrt(total),
  };
  const keys = ["repeatability", "reproducibility", "gageRR", "partToPart"] as const;
  const v = { repeatability, reproducibility, gageRR: gage, partToPart };
  const map = (fn: (k: (typeof keys)[number]) => number) =>
    Object.fromEntries(keys.map((k) => [k, fn(k)])) as Record<(typeof keys)[number], number>;
  return {
    parts,
    operators,
    trials: r,
    variance: {
      repeatability,
      reproducibility,
      operator,
      interaction,
      gageRR: gage,
      partToPart,
      total,
    },
    sd,
    pctContribution: map((k) => (v[k] / total) * 100),
    pctStudyVar: map((k) => (sd[k] / sd.total) * 100),
    pctTolerance: tolerance ? map((k) => ((6 * sd[k]) / tolerance) * 100) : undefined,
    ndc: Math.floor((1.41 * sd.partToPart) / (sd.gageRR || 1e-12)),
    cellMeans,
  };
}

export type GrrTone = "good" | "warning" | "bad";
/** AIAG: < 10% acceptable · 10–30% marginal (may be acceptable by application) · > 30% unacceptable. */
export const grrTone = (pct: number): GrrTone =>
  pct < 10 ? "good" : pct <= 30 ? "warning" : "bad";
const toneVar: Record<GrrTone, string> = {
  good: "var(--success)",
  warning: "var(--warning)",
  bad: "var(--danger)",
};
const toneCls: Record<GrrTone, string> = {
  good: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
};
const toneLabel: Record<GrrTone, string> = {
  good: "Acceptable",
  warning: "Marginal",
  bad: "Unacceptable",
};

/** %GRR / %Contribution / ndc / %Tolerance tiles with AIAG verdicts. */
export function GageRRSummary({ result, className }: { result: GageRRResult; className?: string }) {
  const grr = result.pctStudyVar.gageRR;
  const tone = grrTone(grr);
  const tiles: { label: string; value: string; hint: string; tone?: GrrTone }[] = [
    {
      label: "%GRR (study var)",
      value: `${grr.toFixed(1)}%`,
      hint: "< 10% ok · 10–30% marginal",
      tone,
    },
    {
      label: "%Contribution",
      value: `${result.pctContribution.gageRR.toFixed(1)}%`,
      hint: "of total variance",
      tone:
        result.pctContribution.gageRR < 1
          ? "good"
          : result.pctContribution.gageRR <= 9
            ? "warning"
            : "bad",
    },
    {
      label: "Distinct categories",
      value: String(result.ndc),
      hint: "ndc ≥ 5 required",
      tone: result.ndc >= 5 ? "good" : "bad",
    },
    ...(result.pctTolerance
      ? [
          {
            label: "%Tolerance",
            value: `${result.pctTolerance.gageRR.toFixed(1)}%`,
            hint: "6σ_GRR / (USL − LSL)",
            tone: grrTone(result.pctTolerance.gageRR),
          },
        ]
      : []),
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium">{t.label}</span>
          </div>
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums",
              t.tone && toneCls[t.tone].split(" ")[1],
            )}
          >
            {t.value}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {t.tone && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  toneCls[t.tone],
                )}
              >
                {t.label === "Distinct categories"
                  ? t.tone === "good"
                    ? "Enough"
                    : "Too few"
                  : toneLabel[t.tone]}
              </span>
            )}
            {t.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Components of variation: % Contribution (light) and % Study Var (solid) per source.
 * Measurement-system rows take the AIAG verdict color; part-to-part stays grey. Dashed lines at 10% and 30%.
 */
export function GageRRComponentsChart({
  result,
  height = 240,
  className,
}: {
  result: GageRRResult;
  height?: number;
  className?: string;
}) {
  const rows = (
    [
      ["Gage R&R", "gageRR"],
      ["Repeatability", "repeatability"],
      ["Reproducibility", "reproducibility"],
      ["Part-to-part", "partToPart"],
    ] as const
  ).map(([label, k]) => ({
    label,
    contribution: result.pctContribution[k],
    studyVar: result.pctStudyVar[k],
    color: k === "partToPart" ? "var(--chart-base)" : toneVar[grrTone(result.pctStudyVar[k])],
  }));
  const config = {
    contribution: { label: "% Contribution", color: "var(--chart-base)" },
    studyVar: { label: "% Study var", color: "var(--foreground)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <BarChart
        data={rows}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barGap={3}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          domain={[0, 100]}
          ticks={[0, 10, 30, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <ReferenceLine y={10} stroke="var(--success)" strokeDasharray="4 4" strokeOpacity={0.8} />
        <ReferenceLine y={30} stroke="var(--danger)" strokeDasharray="4 4" strokeOpacity={0.8} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={<ChartTooltipPanel unit="%" valueFormatter={(v) => v.toFixed(1)} />}
        />
        <Bar
          dataKey="contribution"
          name="% Contribution"
          radius={[4, 4, 1, 1]}
          isAnimationActive={false}
        >
          {rows.map((r) => (
            <Cell key={r.label} fill={r.color} fillOpacity={0.4} />
          ))}
        </Bar>
        <Bar dataKey="studyVar" name="% Study var" radius={[4, 4, 1, 1]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.label} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const OP_COLORS = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-5)",
];

/** Operator × part interaction chart: average per part, one line per operator. Parallel, overlapping lines = good reproducibility. */
export function OperatorPartChart({
  result,
  unit,
  decimals = 2,
  height = 240,
  className,
}: {
  result: GageRRResult;
  unit?: string;
  decimals?: number;
  height?: number;
  className?: string;
}) {
  const rows = result.parts.map((pt) => ({ part: pt, ...result.cellMeans[pt] }));
  const vals = result.parts.flatMap((pt) => Object.values(result.cellMeans[pt]));
  const ticks = niceDomain(Math.min(...vals), Math.max(...vals), 4);
  const config = Object.fromEntries(
    result.operators.map((op, i) => [op, { label: op, color: OP_COLORS[i % OP_COLORS.length] }]),
  ) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
    >
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="part" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
          tickFormatter={(v: number) => v.toFixed(decimals)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltipPanel
              unit={unit}
              labelFormatter={(l) => `Part ${l}`}
              valueFormatter={(v) => v.toFixed(decimals + 1)}
            />
          }
        />
        {result.operators.map((op, i) => (
          <Line
            key={op}
            dataKey={op}
            name={op}
            type="linear"
            stroke={OP_COLORS[i % OP_COLORS.length]}
            strokeWidth={1.75}
            dot={{ r: 3, fill: "var(--card)", strokeWidth: 1.5 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export const operatorColors = OP_COLORS;
