import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { StatStrip } from "@/components/molca/stat-strip";

import type { Asset, Registry } from "@/lib/md";

// Shared pieces of the Master Data pages, in the MolcaDx Maintenance look: tight bordered count cells, icon tiles
// that link to where the issue is fixed, horizontal bar lists, status dots. One place, so every page reads alike.

const RED = "var(--sys-red)";
const ORANGE = "var(--sys-orange)";

type Cell = { label: string; value: React.ReactNode; tone?: string; sub?: string };

/** Count strip: the shared DS stat strip (a quiet card per number, trouble as a coloured accent). */
function Strip({
  cells,
  cols = "sm:grid-cols-4 xl:grid-cols-8",
}: {
  cells: Cell[];
  cols?: string;
}) {
  return <StatStrip cols={cols} cells={cells} />;
}

type To =
  | "/assets"
  | "/assets/labels"
  | "/changes"
  | "/hierarchy"
  | "/classes"
  | "/people"
  | "/parts"
  | "/stores"
  | "/failure-codes";
type Tile = { icon: LucideIcon; label: string; n: number; sub: string; to: To; hot?: boolean };

/** Attention tiles (Home): the shared stat strip with an icon and a status dot; each cell opens the page that fixes it. */
function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <StatStrip
      cols="sm:grid-cols-3 xl:grid-cols-5"
      cells={tiles.map((x) => ({
        label: x.label,
        value: x.n,
        sub: x.sub,
        status: !x.n ? "ok" : x.hot ? "warn" : undefined,
        wrap: (children, className) => (
          <Link to={x.to} className={className}>
            {children}
          </Link>
        ),
      }))}
    />
  );
}

/** Horizontal bars: a label, a bar against the largest value, the number. */
function BarList({
  rows,
  color = "var(--chart-1)",
  onPick,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  color?: string;
  onPick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={!onPick}
            onClick={() => onPick?.(r.key)}
            className="grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-md px-1 py-0.5 text-left text-[13px] enabled:hover:bg-subtle"
          >
            <span className="truncate" title={r.sub ? `${r.label} · ${r.sub}` : r.label}>
              {r.label}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(r.value / max) * 100}%`, background: color }}
              />
            </span>
            <span className="text-right tabular-nums">{r.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const STATUS_COLOR: Record<Asset["lifecycleStatus"], string> = {
  operational: "var(--sys-green)",
  installed: "var(--sys-blue)",
  planned: "var(--sys-indigo)",
  under_maintenance: ORANGE,
  idle: "var(--muted-foreground)",
  decommissioned: RED,
};

function StatusDot({
  status,
  className,
}: {
  status: Asset["lifecycleStatus"];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/** Assets with a placement, directly or through a parent (sub-assets follow their parent). */
function locatedIds(reg: Registry): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const a of reg.assets)
    if (a.parentAssetId)
      byParent.set(a.parentAssetId, [...(byParent.get(a.parentAssetId) ?? []), a.id]);
  const ok = new Set<string>();
  const mark = (id: string) => {
    if (ok.has(id)) return;
    ok.add(id);
    (byParent.get(id) ?? []).forEach(mark);
  };
  reg.placements.forEach((p) => mark(p.assetId));
  return ok;
}

export { BarList, STATUS_COLOR, StatusDot, Strip, Tiles, locatedIds };
export type { Cell, Tile };
