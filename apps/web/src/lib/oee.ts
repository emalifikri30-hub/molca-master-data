export type OeeClass = { id: string; label: string; min: number; color: string; text: string };

export const OEE_CLASSES_4: OeeClass[] = [
  { id: "low", label: "Low", min: 0, color: "var(--oee-unacceptable)", text: "text-ink-on-bright" },
  {
    id: "acceptable",
    label: "Acceptable",
    min: 40,
    color: "var(--oee-fair)",
    text: "text-ink-on-bright",
  },
  {
    id: "target",
    label: "Target",
    min: 60,
    color: "var(--oee-target)",
    text: "text-ink-on-bright",
  },
  {
    id: "world",
    label: "World class",
    min: 85,
    color: "var(--oee-world)",
    text: "text-ink-on-oee-deep",
  },
];

export const OEE_CLASSES_6: OeeClass[] = [
  {
    id: "unacceptable",
    label: "Unacceptable",
    min: 0,
    color: "var(--oee-unacceptable)",
    text: "text-ink-on-bright",
  },
  {
    id: "low",
    label: "Low performance",
    min: 25,
    color: "var(--oee-low)",
    text: "text-ink-on-bright",
  },
  {
    id: "needs-improvement",
    label: "Needs improvement",
    min: 40,
    color: "var(--oee-fair)",
    text: "text-ink-on-bright",
  },
  {
    id: "typical",
    label: "Typical",
    min: 55,
    color: "var(--oee-typical)",
    text: "text-ink-on-bright",
  },
  {
    id: "high",
    label: "High performance",
    min: 70,
    color: "var(--oee-high)",
    text: "text-ink-on-bright",
  },
  {
    id: "world",
    label: "World class",
    min: 85,
    color: "var(--oee-world)",
    text: "text-ink-on-oee-deep",
  },
];

/** Benchmark class for an OEE value in percent. */
export function oeeClass(value: number, scale: OeeClass[] = OEE_CLASSES_4): OeeClass {
  return [...scale].reverse().find((c) => value >= c.min) ?? scale[0];
}

/** Fill color for an OEE value (bars, gauge needle, heatmap cells). */
export const oeeColor = (value: number, scale: OeeClass[] = OEE_CLASSES_4) =>
  oeeClass(value, scale).color;

/** The 10-step OEE ramp (red → orange → yellow → green → deep green), one color per 10 %. Used by segmented gauges. */
export const OEE_RAMP = Array.from({ length: 10 }, (_, i) => `var(--oee-${i + 1})`);

/** Ramp color for a position on the 0–100 scale (e.g. the middle of a gauge segment). */
export const oeeRampColor = (value: number) =>
  OEE_RAMP[Math.min(9, Math.max(0, Math.floor(value / 10)))];

/** Text class for a label drawn on the class color. */
export const oeeText = (value: number, scale: OeeClass[] = OEE_CLASSES_4) =>
  oeeClass(value, scale).text;

/** Text class for a label drawn on a ramp step (steps 1–8 bright, 9 deep, 10 always dark enough for white). */
export const oeeRampText = (value: number) => {
  const i = Math.min(9, Math.max(0, Math.floor(value / 10)));
  return i === 9 ? "text-white" : i === 8 ? "text-ink-on-oee-deep" : "text-ink-on-bright";
};
