const DEEP = [
  "st-planned",
  "sys-indigo",
  "sys-blue",
  "sys-purple",
  "chart-1",
  "chart-3",
  "chart-5",
  "highlight",
  "oee-9",
  "oee-world",
  "alarm-info",
];

/** Tailwind text class for a label on `color` (a CSS value such as "var(--st-run)"). */
export function inkOn(color: string) {
  if (color.includes("oee-10")) return "text-white";
  return DEEP.some((t) => color.includes(`--${t})`) || color.includes(`--${t},`))
    ? "text-ink-on-deep"
    : "text-ink-on-bright";
}
