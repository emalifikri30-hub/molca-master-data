import { cn } from "@/lib/utils";

// Logo assets are alpha masks extracted from the 2025 brand guideline (raster only); color follows `currentColor`.
// Replace with the official SVG once the brand team provides it.
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="molca"
      className={cn("molca-logo h-5 aspect-[860/236]", className)}
      style={{ "--logo": "url(/brand/molca-wordmark.png)" } as React.CSSProperties}
    />
  );
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="molca"
      className={cn("molca-logo h-4 aspect-[191/145]", className)}
      style={{ "--logo": "url(/brand/molca-icon.png)" } as React.CSSProperties}
    />
  );
}

/** App-icon tile: lime "m" on brand dark. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[9px] bg-brand-dark text-brand-lime",
        className,
      )}
    >
      <LogoIcon className="h-[40%]" />
    </span>
  );
}

const DS_CELLS = [
  { id: "web", x: 0, y: 0 },
  { id: "dt", x: 11, y: 0 },
  { id: "ar", x: 0, y: 11 },
  { id: "vr", x: 11, y: 11 },
] as const;

/**
 * Design-system mark: four tiles for the four platforms (Web · DT / AR · VR).
 * The active platform's tile is filled, the others are outlined; color follows `currentColor`.
 */
export function DsMark({ active, className }: { active?: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("size-5", className)}>
      {DS_CELLS.map((c) =>
        c.id === active ? (
          <rect key={c.id} x={c.x} y={c.y} width="9" height="9" rx="2.5" fill="currentColor" />
        ) : (
          <rect
            key={c.id}
            x={c.x + 0.75}
            y={c.y + 0.75}
            width="7.5"
            height="7.5"
            rx="1.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ),
      )}
    </svg>
  );
}
