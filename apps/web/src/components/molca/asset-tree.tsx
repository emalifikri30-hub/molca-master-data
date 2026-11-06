"use client";

import * as React from "react";
import {
  Bell,
  Boxes,
  Building2,
  ChevronRight,
  Cpu,
  Factory,
  LayoutGrid,
  Workflow,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model — ISA-95 equipment hierarchy                                  */
/* ------------------------------------------------------------------ */

/** ISA-95 levels: Enterprise → Site → Area → Line (work centre) → Work cell / machine (work unit). */
/** ISA-95 levels; "equipment" is the machine itself, below its work cell / station. */
export type AssetLevel = "enterprise" | "site" | "area" | "line" | "cell" | "equipment";
/** Universal machine state codes (same as StateTimeline / StatusPill). */
export type AssetStatus = "run" | "idle" | "down" | "setup" | "off";

export type AssetNode = {
  id: string;
  name: string;
  level: AssetLevel;
  /** Own state. Parents without a status roll up the worst state of their children. */
  status?: AssetStatus;
  /** Active alarms on this node (children are summed into parents). */
  alarms?: number;
  /** Open work orders on this node (children are summed into parents). */
  openWos?: number;
  /** Short secondary text, e.g. "OEE 78%" or an asset tag. */
  meta?: string;
  children?: AssetNode[];
  /** Children exist but are not loaded yet — expanding calls `onLoadChildren`. */
  hasChildren?: boolean;
};

export const ASSET_STATUS: Record<AssetStatus, { label: string; dot: string; rank: number }> = {
  down: { label: "Down", dot: "bg-st-unplanned", rank: 5 },
  idle: { label: "Idle / small stop", dot: "bg-st-small", rank: 4 },
  setup: { label: "Changeover", dot: "bg-st-planned", rank: 3 },
  run: { label: "Running", dot: "bg-st-run", rank: 2 },
  off: { label: "Offline", dot: "bg-st-off", rank: 1 },
};

export const ASSET_LEVEL: Record<
  AssetLevel,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  enterprise: { label: "Enterprise", icon: Building2 },
  site: { label: "Site", icon: Factory },
  area: { label: "Area", icon: LayoutGrid },
  line: { label: "Line", icon: Workflow },
  cell: { label: "Work cell", icon: Boxes },
  equipment: { label: "Equipment", icon: Cpu },
};

type Rollup = { status?: AssetStatus; alarms: number; openWos: number };

/** Keep every node that matches `query` (name, id or meta) plus all of its ancestors. */
export function filterAssetTree(nodes: AssetNode[], query: string): AssetNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: AssetNode[] = [];
  for (const n of nodes) {
    const self = [n.name, n.id, n.meta ?? ""].some((s) => s.toLowerCase().includes(q));
    const kids = n.children ? filterAssetTree(n.children, q) : [];
    if (self) out.push(n);
    else if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type AssetTreeProps = {
  nodes: AssetNode[];
  /** Accessible name of the tree */
  label?: string;
  /** Filter text — matches stay visible together with their ancestors, which auto-expand. */
  query?: string;
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelect?: (node: AssetNode) => void;
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  /** Called the first time a node with `hasChildren` is expanded. */
  onLoadChildren?: (node: AssetNode) => Promise<AssetNode[]>;
  /** "compact" = 28px rows, no level icons, no work-order badge — for pickers and side panels. */
  size?: "default" | "compact";
  /** Show alarm and open-WO badges (default true). */
  showCounts?: boolean;
  className?: string;
};

type Visible = {
  node: AssetNode;
  level: number;
  parent?: string;
  expandable: boolean;
  open: boolean;
  setSize: number;
  pos: number;
};

function useControllable<T>(value: T | undefined, initial: T, onChange?: (v: T) => void) {
  const [inner, setInner] = React.useState(initial);
  const current = value !== undefined ? value : inner;
  const set = React.useCallback(
    (v: T) => {
      if (value === undefined) setInner(v);
      onChange?.(v);
    },
    [value, onChange],
  );
  return [current, set] as const;
}

function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-highlight-soft text-foreground">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * ISA-95 asset hierarchy as an accessible WAI-ARIA tree: roving tabindex, arrow-key navigation,
 * status roll-up, alarm / open-WO counts, filter that keeps ancestors, and lazy-loaded branches.
 */
export function AssetTree({
  nodes,
  label = "Assets",
  query,
  selectedId,
  defaultSelectedId = null,
  onSelect,
  expanded,
  defaultExpanded = [],
  onExpandedChange,
  onLoadChildren,
  size = "default",
  showCounts = true,
  className,
}: AssetTreeProps) {
  const compact = size === "compact";
  const [selected, setSelected] = useControllable<string | null>(selectedId, defaultSelectedId);
  const [open, setOpen] = useControllable<string[]>(expanded, defaultExpanded, onExpandedChange);
  const [loaded, setLoaded] = React.useState<Record<string, AssetNode[]>>({});
  const [loading, setLoading] = React.useState<string[]>([]);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const refs = React.useRef(new Map<string, HTMLLIElement>());
  const typeahead = React.useRef({ text: "", t: 0 });

  // Merge lazily loaded children into the model, then filter.
  const merged = React.useMemo(() => {
    const walk = (list: AssetNode[]): AssetNode[] =>
      list.map((n) => {
        const kids = n.children ?? loaded[n.id];
        return kids ? { ...n, children: walk(kids) } : n;
      });
    return walk(nodes);
  }, [nodes, loaded]);
  const filtering = !!query?.trim();
  const tree = React.useMemo(() => filterAssetTree(merged, query ?? ""), [merged, query]);

  // Roll up status (worst child), alarms and open WOs.
  const rollup = React.useMemo(() => {
    const map = new Map<string, Rollup>();
    const walk = (n: AssetNode): Rollup => {
      const r: Rollup = { status: n.status, alarms: n.alarms ?? 0, openWos: n.openWos ?? 0 };
      for (const c of n.children ?? []) {
        const cr = walk(c);
        r.alarms += cr.alarms;
        r.openWos += cr.openWos;
        if (
          !n.status &&
          cr.status &&
          (!r.status || ASSET_STATUS[cr.status].rank > ASSET_STATUS[r.status].rank)
        )
          r.status = cr.status;
      }
      map.set(n.id, r);
      return r;
    };
    merged.forEach(walk);
    return map;
  }, [merged]);

  // While filtering, every branch on a match path is open.
  const openSet = React.useMemo(() => {
    const s = new Set(open);
    if (filtering) {
      const walk = (list: AssetNode[]) =>
        list.forEach((n) => {
          if (n.children?.length) {
            s.add(n.id);
            walk(n.children);
          }
        });
      walk(tree);
    }
    return s;
  }, [open, filtering, tree]);

  const visible = React.useMemo(() => {
    const out: Visible[] = [];
    const walk = (list: AssetNode[], level: number, parent?: string) =>
      list.forEach((node, i) => {
        const expandable = !!node.children?.length || (!!node.hasChildren && !node.children);
        const isOpen = expandable && openSet.has(node.id);
        out.push({
          node,
          level,
          parent,
          expandable,
          open: isOpen,
          setSize: list.length,
          pos: i + 1,
        });
        if (isOpen && node.children) walk(node.children, level + 1, node.id);
      });
    walk(tree, 1);
    return out;
  }, [tree, openSet]);

  const tabStop =
    visible.find((v) => v.node.id === focusId)?.node.id ??
    visible.find((v) => v.node.id === selected)?.node.id ??
    visible[0]?.node.id;

  const focus = (id: string) => {
    setFocusId(id);
    refs.current.get(id)?.focus();
  };

  const toggle = async (v: Visible, force?: boolean) => {
    const willOpen = force ?? !v.open;
    const next = new Set(open);
    if (willOpen) next.add(v.node.id);
    else next.delete(v.node.id);
    setOpen([...next]);
    if (
      willOpen &&
      v.node.hasChildren &&
      !v.node.children &&
      onLoadChildren &&
      !loading.includes(v.node.id)
    ) {
      setLoading((l) => [...l, v.node.id]);
      try {
        const kids = await onLoadChildren(v.node);
        setLoaded((m) => ({ ...m, [v.node.id]: kids }));
      } finally {
        setLoading((l) => l.filter((x) => x !== v.node.id));
      }
    }
  };

  const select = (n: AssetNode) => {
    setSelected(n.id);
    onSelect?.(n);
  };

  const onKeyDown = (e: React.KeyboardEvent, v: Visible) => {
    if (e.target !== e.currentTarget) return;
    const i = visible.indexOf(v);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (visible[i + 1]) focus(visible[i + 1].node.id);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (visible[i - 1]) focus(visible[i - 1].node.id);
        break;
      case "Home":
        e.preventDefault();
        focus(visible[0].node.id);
        break;
      case "End":
        e.preventDefault();
        focus(visible[visible.length - 1].node.id);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (v.expandable && !v.open) toggle(v, true);
        else if (v.open && visible[i + 1]?.parent === v.node.id) focus(visible[i + 1].node.id);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (v.open) toggle(v, false);
        else if (v.parent) focus(v.parent);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(v.node);
        break;
      case "*": {
        e.preventDefault();
        const next = new Set(open);
        visible
          .filter((s) => s.parent === v.parent && s.expandable)
          .forEach((s) => next.add(s.node.id));
        setOpen([...next]);
        break;
      }
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.text = now - ta.t > 600 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase();
          ta.t = now;
          const order = [...visible.slice(i + 1), ...visible.slice(0, i + 1)];
          const hit = order.find((s) => s.node.name.toLowerCase().startsWith(ta.text));
          if (hit) focus(hit.node.id);
        }
    }
  };

  const rowH = compact ? "h-7 text-[12.5px]" : "h-8 text-[13px]";
  const indent = compact ? 14 : 16;

  const renderLevel = (list: AssetNode[], level: number): React.ReactNode =>
    list.map((node) => {
      const v = visible.find((x) => x.node.id === node.id);
      if (!v) return null;
      const r = rollup.get(node.id) ?? { alarms: 0, openWos: 0 };
      const st = r.status ? ASSET_STATUS[r.status] : undefined;
      const Icon = ASSET_LEVEL[node.level].icon;
      const isSel = selected === node.id;
      const isLoading = loading.includes(node.id);
      return (
        <li
          key={node.id}
          ref={(el) => {
            if (el) refs.current.set(node.id, el);
            else refs.current.delete(node.id);
          }}
          role="treeitem"
          aria-level={level}
          aria-setsize={v.setSize}
          aria-posinset={v.pos}
          aria-expanded={v.expandable ? v.open : undefined}
          aria-selected={isSel}
          aria-busy={isLoading || undefined}
          tabIndex={tabStop === node.id ? 0 : -1}
          onKeyDown={(e) => onKeyDown(e, v)}
          onFocus={(e) => {
            if (e.target === e.currentTarget) setFocusId(node.id);
          }}
          className="group/item outline-none [&:focus-visible>[data-row]]:ring-2 [&:focus-visible>[data-row]]:ring-ring/60"
        >
          <div
            data-row
            onClick={() => {
              focus(node.id);
              select(node);
              if (v.expandable && !v.open) toggle(v, true);
            }}
            style={{ paddingLeft: (level - 1) * indent + 4 }}
            className={cn(
              "relative flex cursor-default select-none items-center gap-1.5 rounded-lg pr-2 transition-colors",
              rowH,
              isSel
                ? "bg-highlight-soft font-medium text-foreground"
                : "text-foreground/90 hover:bg-muted",
            )}
          >
            {isSel && (
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-highlight"
              />
            )}
            <span
              aria-hidden
              onClick={(e) => {
                if (v.expandable) {
                  e.stopPropagation();
                  focus(node.id);
                  toggle(v);
                }
              }}
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground",
                v.expandable && "hover:bg-foreground/5",
              )}
            >
              {v.expandable && (
                <ChevronRight
                  className={cn("size-3.5 transition-transform", v.open && "rotate-90")}
                />
              )}
            </span>
            {!compact && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
            {st ? (
              <span className={cn("size-2 shrink-0 rounded-full", st.dot)} aria-hidden />
            ) : (
              <span className="size-2 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate">
              <Highlight text={node.name} query={query} />
            </span>
            {st && <span className="sr-only">, {st.label}</span>}
            {node.meta && !compact && (
              <span className="min-w-0 shrink-[1000] truncate text-[12px] font-normal text-muted-foreground tabular-nums">
                {node.meta}
              </span>
            )}
            {showCounts && (r.alarms > 0 || (!compact && r.openWos > 0)) && (
              <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
                {r.alarms > 0 && (
                  <span className="inline-flex h-[18px] items-center gap-0.5 rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger tabular-nums">
                    <Bell className="size-2.5" aria-hidden />
                    {r.alarms}
                    <span className="sr-only"> active alarms</span>
                  </span>
                )}
                {!compact && r.openWos > 0 && (
                  <span className="inline-flex h-[18px] items-center gap-0.5 rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                    <Wrench className="size-2.5" aria-hidden />
                    {r.openWos}
                    <span className="sr-only"> open work orders</span>
                  </span>
                )}
              </span>
            )}
          </div>
          {v.open && (
            <ul role="group" className="mt-px space-y-px">
              {node.children?.length
                ? renderLevel(node.children, level + 1)
                : isLoading && (
                    <li
                      role="none"
                      aria-hidden
                      className={cn("flex items-center gap-2 pr-2", rowH)}
                      style={{ paddingLeft: level * indent + 30 }}
                    >
                      <span className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
                      <span className="h-2.5 w-10 animate-pulse rounded-full bg-muted" />
                    </li>
                  )}
              {isLoading && (
                <li role="none" className="sr-only" aria-live="polite">
                  Loading {node.name}…
                </li>
              )}
            </ul>
          )}
        </li>
      );
    });

  return (
    <div className={cn("w-full", className)}>
      {tree.length ? (
        <ul role="tree" aria-label={label} aria-multiselectable={false} className="space-y-px">
          {renderLevel(tree, 1)}
        </ul>
      ) : (
        <p role="status" className="px-3 py-6 text-center text-[13px] text-muted-foreground">
          No assets match “{query}”.
        </p>
      )}
    </div>
  );
}

export default AssetTree;
