import * as React from "react";
import type { AlarmPriority } from "@/components/molca/alarm-list";

/**
 * ISA-101 high-performance HMI palette.
 *
 * Every value is derived from existing theme tokens (foreground / canvas / card / alarm-*) with color-mix,
 * so it follows light, dark and increased contrast automatically. Scoped to `.molca-hmi`.
 *
 * - Background: calm mid-light grey (dark grey in dark mode) — never white, never black.
 * - Equipment: muted greys. Running/open = filled, stopped/closed = outline. No green/red for normal states.
 * - Colour is reserved for abnormal conditions (alarm-* tokens, always with shape + number + text).
 */
export const HMI_CSS = `
.molca-hmi{
  --hmi-bg: color-mix(in srgb, var(--foreground) 7%, var(--canvas));
  --hmi-surface: color-mix(in srgb, var(--foreground) 3%, var(--card));
  --hmi-line: color-mix(in srgb, var(--foreground) 52%, var(--hmi-bg));
  --hmi-fill: color-mix(in srgb, var(--foreground) 58%, var(--hmi-bg));
  --hmi-fill-half: color-mix(in srgb, var(--foreground) 28%, var(--hmi-bg));
  --hmi-pipe: color-mix(in srgb, var(--foreground) 34%, var(--hmi-bg));
  --hmi-pipe-idle: color-mix(in srgb, var(--foreground) 18%, var(--hmi-bg));
  --hmi-liquid: color-mix(in srgb, var(--foreground) 16%, var(--hmi-bg));
  --hmi-track: color-mix(in srgb, var(--foreground) 9%, var(--hmi-surface));
  --hmi-band: color-mix(in srgb, var(--foreground) 24%, var(--hmi-surface));
  --hmi-text: var(--foreground);
  --hmi-text-muted: color-mix(in srgb, var(--foreground) 62%, var(--hmi-bg));
  --hmi-signal: color-mix(in srgb, var(--foreground) 30%, var(--hmi-bg));
}
:root[data-contrast="more"] .molca-hmi{
  --hmi-line: color-mix(in srgb, var(--foreground) 78%, var(--hmi-bg));
  --hmi-fill: color-mix(in srgb, var(--foreground) 76%, var(--hmi-bg));
  --hmi-fill-half: color-mix(in srgb, var(--foreground) 40%, var(--hmi-bg));
  --hmi-pipe: color-mix(in srgb, var(--foreground) 55%, var(--hmi-bg));
  --hmi-pipe-idle: color-mix(in srgb, var(--foreground) 32%, var(--hmi-bg));
  --hmi-liquid: color-mix(in srgb, var(--foreground) 24%, var(--hmi-bg));
  --hmi-band: color-mix(in srgb, var(--foreground) 38%, var(--hmi-surface));
  --hmi-text-muted: color-mix(in srgb, var(--foreground) 80%, var(--hmi-bg));
  --hmi-signal: color-mix(in srgb, var(--foreground) 50%, var(--hmi-bg));
}
@media (prefers-contrast: more){
  :root:not([data-contrast="normal"]) .molca-hmi{
    --hmi-line: color-mix(in srgb, var(--foreground) 78%, var(--hmi-bg));
    --hmi-fill: color-mix(in srgb, var(--foreground) 76%, var(--hmi-bg));
    --hmi-fill-half: color-mix(in srgb, var(--foreground) 40%, var(--hmi-bg));
    --hmi-pipe: color-mix(in srgb, var(--foreground) 55%, var(--hmi-bg));
    --hmi-pipe-idle: color-mix(in srgb, var(--foreground) 32%, var(--hmi-bg));
    --hmi-liquid: color-mix(in srgb, var(--foreground) 24%, var(--hmi-bg));
    --hmi-band: color-mix(in srgb, var(--foreground) 38%, var(--hmi-surface));
    --hmi-text-muted: color-mix(in srgb, var(--foreground) 80%, var(--hmi-bg));
    --hmi-signal: color-mix(in srgb, var(--foreground) 50%, var(--hmi-bg));
  }
}
@keyframes hmi-blink{to{visibility:hidden}}
.hmi-blink{animation:hmi-blink 1s steps(2,start) infinite}
@media (prefers-reduced-motion: reduce){.hmi-blink{animation:none}}
.molca-hmi .hmi-eq{outline:none}
.molca-hmi .hmi-eq .hmi-ring,.molca-hmi .hmi-eq .hmi-hover{opacity:0}
.molca-hmi .hmi-eq:hover .hmi-hover{opacity:1}
.molca-hmi .hmi-eq:focus-visible .hmi-ring,.molca-hmi .hmi-eq[data-selected="true"] .hmi-ring{opacity:1}
`;

/** Injects the HMI palette once (React 19 dedupes by href). Render inside any HMI root. */
export function HmiStyle() {
  return (
    <style href="molca-hmi" precedence="default">
      {HMI_CSS}
    </style>
  );
}

export const hmi = {
  bg: "var(--hmi-bg)",
  surface: "var(--hmi-surface)",
  line: "var(--hmi-line)",
  fill: "var(--hmi-fill)",
  fillHalf: "var(--hmi-fill-half)",
  pipe: "var(--hmi-pipe)",
  pipeIdle: "var(--hmi-pipe-idle)",
  liquid: "var(--hmi-liquid)",
  track: "var(--hmi-track)",
  band: "var(--hmi-band)",
  text: "var(--hmi-text)",
  textMuted: "var(--hmi-text-muted)",
  signal: "var(--hmi-signal)",
  focus: "var(--ring)",
} as const;

/** Alarm priority colour + readable ink. Orange / yellow / cyan fills use --ink-on-bright. */
export const ALARM_COLOR: Record<
  AlarmPriority,
  { fill: string; ink: string; number: string; label: string }
> = {
  critical: {
    fill: "var(--alarm-critical)",
    ink: "var(--ink-on-bright)",
    number: "1",
    label: "Critical",
  },
  high: { fill: "var(--alarm-high)", ink: "var(--ink-on-bright)", number: "2", label: "High" },
  medium: {
    fill: "var(--alarm-medium)",
    ink: "var(--ink-on-bright)",
    number: "3",
    label: "Medium",
  },
  low: { fill: "var(--alarm-low)", ink: "var(--ink-on-bright)", number: "4", label: "Low" },
  info: {
    fill: "var(--alarm-info)",
    ink: "var(--ink-on-bright)",
    number: "i",
    label: "Diagnostic",
  },
};

/** Unique, url()-safe SVG id. */
export function useSvgId(prefix: string) {
  return `${prefix}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
