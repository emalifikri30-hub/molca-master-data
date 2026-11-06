"use client";

import * as React from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileWarning,
  Inbox,
  Lightbulb,
  Lock,
  Package,
  Pause,
  Play,
  Search,
  ShieldAlert,
  Siren,
  ThumbsUp,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateBadge, TONE_COLOR, type StateMeta } from "@/components/molca/order-states";
import { AlarmPriorityIcon, type AlarmPriority } from "@/components/molca/alarm-list";
import { CodeChip, SeverityBadge, type Severity } from "@/components/molca/failure-report";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                                */
/* ------------------------------------------------------------------ */

/** Work order types of the Product Foundation work order lifecycle (EN 13306) plus predictive (PdM). */
export type WorkOrderType =
  | "corrective"
  | "emergency"
  | "preventive"
  | "predictive"
  | "inspection"
  | "improvement";
/** 1 Emergency · 2 Urgent · 3 Normal · 4 Low */
export type WorkOrderPriority = 1 | 2 | 3 | 4;
export type WorkOrderStatus =
  | "requested"
  | "approved"
  | "planned"
  | "scheduled"
  | "in-progress"
  | "on-hold"
  | "completed"
  | "closed"
  | "cancelled";

export type WorkOrderTask = {
  id: string;
  label: string;
  done: boolean;
  /** LOTO / permit step */ safety?: boolean;
  note?: string;
};
export type WorkOrderPart = {
  partNo: string;
  name: string;
  qty: number;
  unit?: string;
  /** Free stock in the store */
  onHand: number;
  /** Quantity already issued to this order */
  issued?: number;
  /** Reserved for this order in the store */
  reserved?: boolean;
  /** Expected delivery when short, e.g. "4 Nov" */
  eta?: string;
};
export type LaborEntry = {
  person: string;
  craft?: string;
  /** ISO local "2026-11-02T11:20" */ start: string;
  hours: number;
};
export type StatusChange = {
  status: WorkOrderStatus;
  /** ISO local */ at: string;
  by: string;
  note?: string;
};

export type WorkOrder = {
  /** e.g. "MWO-2026-00218" */
  id: string;
  title: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  /** ISA-95 equipment hierarchy, enterprise → work unit, plus the equipment tag */
  asset: { tag: string; name: string; path: string[] };
  /** ISO 14224 failure report this order repairs */
  failureReport?: { id: string; title: string; severity?: Severity };
  requestedBy?: string;
  assignee?: string;
  crew?: string;
  createdAt: string;
  /** ISO local due date/time */
  dueAt: string;
  plannedHours: number;
  /** Defaults to the sum of the labor log */
  actualHours?: number;
  description?: string;
  holdReason?: string;
  tasks?: WorkOrderTask[];
  parts?: WorkOrderPart[];
  labor?: LaborEntry[];
  history?: StatusChange[];
};

/* ------------------------------------------------------------------ */
/* Meta                                                                 */
/* ------------------------------------------------------------------ */

export const WORK_ORDER_STATUS: Record<WorkOrderStatus, StateMeta> = {
  requested: {
    label: "Requested",
    tone: "off",
    icon: Inbox,
    description: "Raised by an operator or a system trigger; waiting for approval.",
  },
  approved: {
    label: "Approved",
    tone: "planned",
    icon: ThumbsUp,
    description: "Approved by the maintenance supervisor; ready to plan.",
  },
  planned: {
    label: "Planned",
    tone: "planned",
    icon: ClipboardList,
    description: "Tasks, parts and hours estimated.",
  },
  scheduled: {
    label: "Scheduled",
    tone: "planned",
    icon: CalendarClock,
    description: "Slot and crew assigned in the maintenance schedule.",
  },
  "in-progress": {
    label: "In progress",
    tone: "run",
    icon: Play,
    description: "Work started on the asset.",
  },
  "on-hold": {
    label: "On hold",
    tone: "small",
    icon: Pause,
    description: "Paused — waiting for parts, permit or production window.",
  },
  completed: {
    label: "Completed",
    tone: "run",
    icon: CircleCheck,
    description: "Work done and reported; waiting for close-out review.",
  },
  closed: {
    label: "Closed",
    tone: "off",
    icon: Lock,
    description: "Reviewed and closed; costs and history final.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "off",
    icon: Ban,
    description: "Withdrawn without execution.",
  },
};

/** Main lifecycle (On hold and Cancelled branch off it). */
export const WORK_ORDER_LIFECYCLE: WorkOrderStatus[] = [
  "requested",
  "approved",
  "planned",
  "scheduled",
  "in-progress",
  "completed",
  "closed",
];

export const WORK_ORDER_TYPE: Record<
  WorkOrderType,
  { label: string; icon: LucideIcon; description: string }
> = {
  corrective: { label: "Corrective", icon: Wrench, description: "Repair after a failure" },
  emergency: {
    label: "Emergency",
    icon: Siren,
    description: "Corrective that cannot wait; may start before planning",
  },
  preventive: { label: "Preventive", icon: CalendarCheck, description: "Time- or usage-based PM" },
  predictive: {
    label: "Predictive",
    icon: Activity,
    description: "Triggered by condition monitoring",
  },
  inspection: {
    label: "Inspection",
    icon: ClipboardCheck,
    description: "Check, calibration or test",
  },
  improvement: {
    label: "Improvement",
    icon: Lightbulb,
    description: "Modification or design fix, e.g. from an RCA",
  },
};

const PRIORITY_ICON: Record<WorkOrderPriority, AlarmPriority> = {
  1: "critical",
  2: "high",
  3: "medium",
  4: "low",
};
export const WORK_ORDER_PRIORITY: Record<
  WorkOrderPriority,
  { label: string; description: string }
> = {
  1: { label: "Emergency", description: "Safety risk or line down — start now" },
  2: { label: "Urgent", description: "Start within the shift" },
  3: { label: "Normal", description: "Plan within the week" },
  4: { label: "Low", description: "When capacity allows" },
};

/** Primary next-step action per status. */
export const WORK_ORDER_NEXT: Partial<
  Record<WorkOrderStatus, { label: string; to: WorkOrderStatus; icon: LucideIcon }>
> = {
  requested: { label: "Approve", to: "approved", icon: ThumbsUp },
  approved: { label: "Plan", to: "planned", icon: ClipboardList },
  planned: { label: "Schedule", to: "scheduled", icon: CalendarClock },
  scheduled: { label: "Start work", to: "in-progress", icon: Play },
  "in-progress": { label: "Complete", to: "completed", icon: CircleCheck },
  "on-hold": { label: "Resume", to: "in-progress", icon: Play },
  completed: { label: "Close", to: "closed", icon: Lock },
};

const DONE: WorkOrderStatus[] = ["completed", "closed", "cancelled"];
export const isOpenWorkOrder = (wo: WorkOrder) => !DONE.includes(wo.status);

/* ------------------------------------------------------------------ */
/* Time helpers — string based, timezone free (no hydration drift)      */
/* ------------------------------------------------------------------ */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parts(iso: string) {
  const [d, t = "00:00"] = iso.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mi] = t.split(":").map(Number);
  return { y, m, d: dd, hh: hh || 0, mi: mi || 0 };
}
/** Minutes since epoch, treating the string as wall-clock time. */
export function woMinutes(iso: string) {
  const p = parts(iso);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mi) / 60000;
}
/** "2 Nov 13.40" (Molca time style) or "2 Nov". */
export function formatWoDate(iso: string, time = true) {
  const p = parts(iso);
  const day = `${p.d} ${MON[p.m - 1]}`;
  return time && iso.includes("T")
    ? `${day} ${String(p.hh).padStart(2, "0")}.${String(p.mi).padStart(2, "0")}`
    : day;
}
function span(min: number) {
  const m = Math.abs(Math.round(min));
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m`;
}
const toIso = (now?: string | Date) =>
  now instanceof Date
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : now;

/** Due state relative to `now` (pass a fixed demo time or a ticking clock). */
export function workOrderDue(wo: WorkOrder, now?: string | Date) {
  const n = toIso(now);
  if (!n || !isOpenWorkOrder(wo))
    return { overdue: false, label: formatWoDate(wo.dueAt), relative: "" };
  const diff = woMinutes(wo.dueAt) - woMinutes(n);
  return {
    overdue: diff < 0,
    label: formatWoDate(wo.dueAt),
    relative: diff < 0 ? `${span(diff)} overdue` : `in ${span(diff)}`,
  };
}

export const workOrderActualHours = (wo: WorkOrder) =>
  wo.actualHours ?? (wo.labor ?? []).reduce((s, l) => s + l.hours, 0);
const fmtH = (h: number) =>
  (Math.round(h * 10) / 10).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export type PartStock = "issued" | "reserved" | "in-stock" | "short" | "out";
export const PART_STOCK: Record<PartStock, { label: string; color: string }> = {
  issued: { label: "Issued", color: "var(--st-off)" },
  reserved: { label: "Reserved", color: "var(--st-planned)" },
  "in-stock": { label: "In stock", color: "var(--st-run)" },
  short: { label: "Short", color: "var(--st-small)" },
  out: { label: "Out of stock", color: "var(--st-unplanned)" },
};
export function partStock(p: WorkOrderPart): PartStock {
  if ((p.issued ?? 0) >= p.qty) return "issued";
  const need = p.qty - (p.issued ?? 0);
  if (p.reserved && p.onHand >= need) return "reserved";
  if (p.onHand >= need) return "in-stock";
  return p.onHand > 0 ? "short" : "out";
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

export function WorkOrderStatusBadge({
  status,
  size,
  className,
}: {
  status: WorkOrderStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return <StateBadge meta={WORK_ORDER_STATUS[status]} size={size} className={className} />;
}

/** Priority: ISA-18.2-style shape + number (shared with alarms), so it never relies on color alone. */
export function WorkOrderPriorityLabel({
  priority,
  compact = false,
  className,
}: {
  priority: WorkOrderPriority;
  compact?: boolean;
  className?: string;
}) {
  const m = WORK_ORDER_PRIORITY[priority];
  return (
    <span
      title={`P${priority} ${m.label} — ${m.description}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap",
        className,
      )}
    >
      <AlarmPriorityIcon priority={PRIORITY_ICON[priority]} size={16} />
      {compact ? (
        <span className="sr-only">
          P{priority} {m.label}
        </span>
      ) : (
        <span>
          P{priority} {m.label}
        </span>
      )}
    </span>
  );
}

export function WorkOrderTypeChip({
  type,
  className,
}: {
  type: WorkOrderType;
  className?: string;
}) {
  const m = WORK_ORDER_TYPE[type];
  return (
    <span
      title={m.description}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      <m.icon className="size-3" />
      {m.label}
    </span>
  );
}

/** ISA-95 equipment path breadcrumb (enterprise › site › area › line › unit). */
export function AssetPath({ asset, className }: { asset: WorkOrder["asset"]; className?: string }) {
  return (
    <nav
      aria-label="Asset location"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {asset.path.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />}
          <span className={cn(i === asset.path.length - 1 && "font-medium text-foreground")}>
            {p}
          </span>
        </React.Fragment>
      ))}
      <span className="ml-1 rounded border bg-subtle px-1 font-mono text-[11px] text-foreground">
        {asset.tag}
      </span>
    </nav>
  );
}

function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                 */
/* ------------------------------------------------------------------ */

export type WorkOrderSort = "priority" | "due" | "id" | "status" | "asset";
type View = "open" | "overdue" | "all";

export type WorkOrderListProps = {
  orders: WorkOrder[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Reference time for overdue (fixed demo time or a ticking clock) */
  now?: string | Date;
  defaultView?: View;
  defaultSort?: WorkOrderSort;
  /** Hide the search / filter toolbar (e.g. in a small widget) */
  hideToolbar?: boolean;
  className?: string;
};

const SORT_LABEL: Record<WorkOrderSort, string> = {
  priority: "Priority",
  due: "Due date",
  id: "Number",
  status: "Status",
  asset: "Asset",
};

function sortOrders(list: WorkOrder[], key: WorkOrderSort, dir: 1 | -1) {
  const order = [...WORK_ORDER_LIFECYCLE, "on-hold", "cancelled"] as WorkOrderStatus[];
  const by = (a: WorkOrder, b: WorkOrder) => {
    switch (key) {
      case "priority":
        return a.priority - b.priority || woMinutes(a.dueAt) - woMinutes(b.dueAt);
      case "due":
        return woMinutes(a.dueAt) - woMinutes(b.dueAt) || a.priority - b.priority;
      case "id":
        return a.id.localeCompare(b.id);
      case "status":
        return order.indexOf(a.status) - order.indexOf(b.status) || a.priority - b.priority;
      case "asset":
        return a.asset.name.localeCompare(b.asset.name);
    }
  };
  return [...list].sort((a, b) => by(a, b) * dir);
}

/** Dense, filterable, sortable work-order list. Rows are a single-select listbox (↑ ↓ Home End). */
export function WorkOrderList({
  orders,
  selectedId,
  onSelect,
  now,
  defaultView = "open",
  defaultSort = "priority",
  hideToolbar = false,
  className,
}: WorkOrderListProps) {
  const [view, setView] = React.useState<View>(defaultView);
  const [type, setType] = React.useState<WorkOrderType | "all">("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: WorkOrderSort; dir: 1 | -1 }>({
    key: defaultSort,
    dir: 1,
  });
  const listRef = React.useRef<HTMLDivElement>(null);

  const counts = React.useMemo(
    () => ({
      open: orders.filter(isOpenWorkOrder).length,
      overdue: orders.filter((o) => workOrderDue(o, now).overdue).length,
      all: orders.length,
    }),
    [orders, now],
  );
  const q = query.trim().toLowerCase();
  const rows = sortOrders(
    orders.filter(
      (o) =>
        (view === "all" || (view === "open" ? isOpenWorkOrder(o) : workOrderDue(o, now).overdue)) &&
        (type === "all" || o.type === type) &&
        (!q ||
          [
            o.id,
            o.title,
            o.asset.tag,
            o.asset.name,
            o.assignee ?? "",
            o.failureReport?.id ?? "",
          ].some((s) => s.toLowerCase().includes(q))),
    ),
    sort.key,
    sort.dir,
  );
  const activeIndex = Math.max(
    0,
    rows.findIndex((r) => r.id === selectedId),
  );
  // keep list and detail in sync: a selected order hidden by the view (e.g. a completed one under "Open") switches the view to All
  const hiddenByView =
    !!selectedId &&
    view !== "all" &&
    !rows.some((r) => r.id === selectedId) &&
    orders.some((o) => o.id === selectedId);
  React.useEffect(() => {
    if (hiddenByView) setView("all");
  }, [hiddenByView]);

  const move = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!r) return;
    onSelect?.(r.id);
    listRef.current?.querySelector<HTMLElement>(`[data-wo="${r.id}"]`)?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowDown") move(activeIndex + 1);
    else if (k === "ArrowUp") move(activeIndex - 1);
    else if (k === "Home") move(0);
    else if (k === "End") move(rows.length - 1);
    else return;
    e.preventDefault();
  };
  const toggleSort = (key: WorkOrderSort) =>
    setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }));

  const Header = ({
    k,
    children,
    className: c,
  }: {
    k: WorkOrderSort;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      aria-label={`Sort by ${SORT_LABEL[k]}`}
      className={cn(
        "inline-flex items-center gap-1 rounded text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        sort.key === k && "text-foreground",
        c,
      )}
    >
      {children}
      {sort.key === k &&
        (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  return (
    <div
      className={cn(
        "@container flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border bg-card",
        className,
      )}
    >
      {!hideToolbar && (
        <div className="grid gap-2 border-b p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search WO, asset, FE…"
                aria-label="Search work orders"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            <Select value={type} onValueChange={(v) => setType(v as WorkOrderType | "all")}>
              <SelectTrigger size="sm" aria-label="Type" className="w-auto min-w-32 text-[13px]">
                <SelectValue>
                  {type === "all" ? "All types" : WORK_ORDER_TYPE[type].label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(WORK_ORDER_TYPE) as WorkOrderType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {WORK_ORDER_TYPE[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="radiogroup"
              aria-label="Show"
              className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5"
            >
              {(["open", "overdue", "all"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    view === v && "bg-card text-foreground shadow-xs",
                  )}
                >
                  {v === "open" ? "Open" : v === "overdue" ? "Overdue" : "All"}
                  <span
                    className={cn(
                      "tabular-nums",
                      v === "overdue" && counts.overdue > 0
                        ? "font-semibold text-danger"
                        : "text-muted-foreground",
                    )}
                  >
                    {counts[v]}
                  </span>
                </button>
              ))}
            </div>
            <Select
              value={`${sort.key}:${sort.dir}`}
              onValueChange={(v) => {
                const [k, d] = v.split(":");
                setSort({ key: k as WorkOrderSort, dir: Number(d) as 1 | -1 });
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Sort"
                className="w-auto text-[12.5px] @xl:hidden"
              >
                <SelectValue>
                  {SORT_LABEL[sort.key]} {sort.dir === 1 ? "↑" : "↓"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {(Object.keys(SORT_LABEL) as WorkOrderSort[]).flatMap((k) => [
                  <SelectItem key={`${k}:1`} value={`${k}:1`}>
                    {SORT_LABEL[k]} ↑
                  </SelectItem>,
                  <SelectItem key={`${k}:-1`} value={`${k}:-1`}>
                    {SORT_LABEL[k]} ↓
                  </SelectItem>,
                ])}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* column header — wide containers only */}
      <div className="hidden grid-cols-[20px_minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_7.5rem] gap-x-3 border-b bg-subtle px-3 py-1.5 text-[12px] text-muted-foreground @xl:grid">
        <span aria-hidden />
        <span className="flex gap-3">
          <Header k="priority">Priority</Header>
          <Header k="id">Work order</Header>
        </span>
        <Header k="asset">Asset · assignee</Header>
        <Header k="status">Status</Header>
        <Header k="due" className="justify-self-end">
          Due
        </Header>
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Work orders"
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            No work orders match these filters.
          </div>
        )}
        {rows.map((o, i) => {
          const due = workOrderDue(o, now);
          const selected = o.id === selectedId;
          return (
            <div
              key={o.id}
              data-wo={o.id}
              role="option"
              aria-selected={selected}
              tabIndex={i === activeIndex ? 0 : -1}
              onClick={() => onSelect?.(o.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(o.id);
                }
              }}
              className={cn(
                "relative grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-3 py-2 text-[13px] outline-none last:border-b-0 hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                "[grid-template-areas:'p_i_s'_'p_t_t'_'p_a_d'] @xl:grid-cols-[20px_minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_7.5rem] @xl:items-center @xl:[grid-template-areas:'p_i_a_s_d'_'p_t_a_s_d']",
                selected && "bg-highlight-soft hover:bg-highlight-soft",
                !isOpenWorkOrder(o) && "text-muted-foreground",
              )}
            >
              {selected && (
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-highlight" />
              )}
              <span className="self-start pt-0.5 [grid-area:p] @xl:self-center">
                <WorkOrderPriorityLabel priority={o.priority} compact />
              </span>
              <span className="flex min-w-0 items-center gap-2 overflow-hidden [grid-area:i]">
                <span className="shrink-0 font-mono text-[12px] font-medium whitespace-nowrap text-foreground">
                  {o.id}
                </span>
                {/* stacked rows have room for the type chip; the table layout only from @4xl, otherwise it would run into the asset column */}
                <WorkOrderTypeChip
                  type={o.type}
                  className="hidden @md:inline-flex @xl:hidden @4xl:inline-flex"
                />
              </span>
              <span className="truncate font-medium text-foreground [grid-area:t]" title={o.title}>
                {o.title}
              </span>
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground [grid-area:a]">
                {o.asset.name}
                <span className="hidden @xl:block">{o.assignee ?? "Unassigned"}</span>
                <span className="@xl:hidden">{o.assignee ? ` · ${o.assignee}` : ""}</span>
              </span>
              <span className="justify-self-end [grid-area:s] @xl:justify-self-start">
                <WorkOrderStatusBadge status={o.status} size="sm" />
              </span>
              <span
                className={cn(
                  "justify-self-end text-right text-[12.5px] tabular-nums whitespace-nowrap [grid-area:d]",
                  due.overdue ? "font-semibold text-danger" : "text-muted-foreground",
                )}
              >
                <span className="@xl:block">
                  {due.overdue && (
                    <TriangleAlert className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />
                  )}
                  {due.label}
                </span>
                {due.relative && (
                  <span
                    className={cn(
                      "text-[11.5px] font-normal @xl:block",
                      !due.overdue && "hidden @xl:block",
                    )}
                  >
                    <span className="@xl:hidden"> · </span>
                    {due.relative}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-t px-3 py-1.5 text-[12px] text-muted-foreground tabular-nums">
        {rows.length} of {orders.length} work orders
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                               */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid content-start gap-2", className)} aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[13.5px] font-semibold">{title}</h4>
        {meta && <span className="text-[12px] text-muted-foreground tabular-nums">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  children,
  sub,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-subtle px-3 py-2">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "truncate text-[16px] font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {children}
      </div>
      {sub && <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Lifecycle track: Requested → … → Closed, with On hold / Cancelled marked on the current step. */
export function WorkOrderLifecycle({
  status,
  className,
}: {
  status: WorkOrderStatus;
  className?: string;
}) {
  const idx =
    status === "on-hold"
      ? WORK_ORDER_LIFECYCLE.indexOf("in-progress")
      : WORK_ORDER_LIFECYCLE.indexOf(status);
  const cancelled = status === "cancelled";
  return (
    <ol aria-label="Work order lifecycle" className={cn("grid grid-cols-7 gap-1", className)}>
      {WORK_ORDER_LIFECYCLE.map((s, i) => {
        const done = !cancelled && i < idx;
        const current = !cancelled && i === idx;
        const hold = current && status === "on-hold";
        return (
          <li key={s} aria-current={current ? "step" : undefined} className="min-w-0">
            <span
              aria-hidden
              className={cn(
                "block h-1.5 rounded-full",
                done
                  ? "bg-primary"
                  : current
                    ? hold
                      ? "bg-st-small"
                      : "bg-highlight"
                    : "bg-muted",
              )}
            />
            <span
              className={cn(
                "mt-1 hidden truncate text-[11px] @lg:block",
                current
                  ? "font-semibold text-foreground"
                  : done
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {hold ? "On hold" : WORK_ORDER_STATUS[s].label}
            </span>
            <span className="sr-only">
              {WORK_ORDER_STATUS[s].label}
              {done ? ", done" : current ? ", current" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HoursBar({ planned, actual }: { planned: number; actual: number }) {
  const max = Math.max(planned, actual, 0.1);
  const over = actual > planned;
  const pct = (v: number) => `${Math.round((v / max) * 1000) / 10}%`;
  return (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          over ? "bg-st-unplanned" : "bg-primary",
        )}
        style={{ width: pct(actual) }}
      />
      <div
        className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground"
        style={{ left: pct(planned) }}
        title="Planned"
      />
    </div>
  );
}

export type WorkOrderDetailProps = {
  order: WorkOrder;
  now?: string | Date;
  /** Primary / secondary lifecycle action. Omit to render read-only. */
  onStatusChange?: (order: WorkOrder, to: WorkOrderStatus) => void;
  /** Task checkbox toggled. Omit to keep task state local. */
  onTaskToggle?: (order: WorkOrder, taskId: string, done: boolean) => void;
  /** Open the linked ISO 14224 failure report */
  onOpenFailureReport?: (id: string) => void;
  /** App content shown at the end of the scrolling body (materials, photos, cost…) so it reads as part of the order */
  extra?: React.ReactNode;
  className?: string;
};

/** Full work-order view: header with next-step action, lifecycle, KPIs, linked failure, tasks, parts, labor and history. */
export function WorkOrderDetail(props: WorkOrderDetailProps) {
  return <DetailInner key={props.order.id} {...props} />;
}

function DetailInner({
  order,
  now,
  onStatusChange,
  onTaskToggle,
  onOpenFailureReport,
  extra,
  className,
}: WorkOrderDetailProps) {
  const [localTasks, setLocalTasks] = React.useState(order.tasks ?? []);
  const tasks = onTaskToggle ? (order.tasks ?? []) : localTasks;
  const toggle = (id: string, done: boolean) => {
    if (onTaskToggle) onTaskToggle(order, id, done);
    else setLocalTasks((t) => t.map((x) => (x.id === id ? { ...x, done } : x)));
  };
  const doneCount = tasks.filter((t) => t.done).length;
  const openTasks = tasks.length - doneCount;
  const due = workOrderDue(order, now);
  const actual = workOrderActualHours(order);
  const parts = order.parts ?? [];
  const readyParts = parts.filter((p) =>
    ["issued", "reserved", "in-stock"].includes(partStock(p)),
  ).length;
  const next = WORK_ORDER_NEXT[order.status];
  const blocked = order.status === "in-progress" && openTasks > 0;
  // With a lifecycle handler, tasks can only be checked while the order is in progress.
  const tasksLocked = !!onStatusChange && order.status !== "in-progress";
  const history = [...(order.history ?? [])].sort((a, b) => woMinutes(b.at) - woMinutes(a.at));

  return (
    <article
      aria-label={`Work order ${order.id}`}
      className={cn(
        "@container flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border bg-card",
        className,
      )}
    >
      {/* header */}
      <header className="grid gap-3 border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-medium">{order.id}</span>
              <WorkOrderTypeChip type={order.type} />
              <WorkOrderPriorityLabel priority={order.priority} />
            </div>
            <h3 className="mt-1 text-[17px] leading-snug font-semibold tracking-[-0.01em]">
              {order.title}
            </h3>
            <AssetPath asset={order.asset} className="mt-1" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WorkOrderStatusBadge status={order.status} />
            {onStatusChange && order.status === "in-progress" && (
              <Button size="sm" variant="outline" onClick={() => onStatusChange(order, "on-hold")}>
                <Pause /> Hold
              </Button>
            )}
            {onStatusChange && next && (
              <Button
                size="sm"
                disabled={blocked}
                onClick={() => onStatusChange(order, next.to)}
                title={
                  blocked ? `${openTasks} task${openTasks > 1 ? "s" : ""} still open` : undefined
                }
              >
                <next.icon /> {next.label}
              </Button>
            )}
          </div>
        </div>
        {(order.status === "on-hold" && order.holdReason) || blocked ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]",
              order.status === "on-hold" ? "bg-warning-soft" : "bg-muted text-muted-foreground",
            )}
          >
            {order.status === "on-hold" ? (
              <Pause className="size-3.5 shrink-0" style={{ color: TONE_COLOR.small }} />
            ) : (
              <ClipboardList className="size-3.5 shrink-0" />
            )}
            {order.status === "on-hold" ? (
              <span>
                <b className="font-semibold">On hold:</b> {order.holdReason}
              </span>
            ) : (
              <span>
                Complete is available when all {tasks.length} tasks are checked — {openTasks} open.
              </span>
            )}
          </div>
        ) : null}
        <WorkOrderLifecycle status={order.status} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* stats */}
        <div className="grid grid-cols-2 gap-2 p-4 pb-0 @2xl:grid-cols-4">
          <Stat
            label="Due"
            tone={due.overdue ? "danger" : undefined}
            sub={
              due.relative || (isOpenWorkOrder(order) ? "" : WORK_ORDER_STATUS[order.status].label)
            }
          >
            {due.label}
          </Stat>
          <Stat
            label="Hours (actual / plan)"
            sub={<HoursBar planned={order.plannedHours} actual={actual} />}
          >
            <span className={cn(actual > order.plannedHours && "text-danger")}>{fmtH(actual)}</span>
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {" "}
              / {fmtH(order.plannedHours)} h
            </span>
          </Stat>
          <Stat
            label="Tasks"
            sub={
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{
                    width: `${tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%`,
                  }}
                />
              </span>
            }
          >
            {doneCount}
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {" "}
              / {tasks.length} done
            </span>
          </Stat>
          <Stat
            label="Parts ready"
            sub={
              readyParts < parts.length ? (
                <span className="font-medium text-foreground">
                  {parts.length - readyParts} not available
                </span>
              ) : parts.length ? (
                "All available"
              ) : (
                "No parts"
              )
            }
          >
            {readyParts}
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {" "}
              / {parts.length}
            </span>
          </Stat>
        </div>

        {/* people + failure link */}
        <div className="grid gap-2 p-4 pb-0 @2xl:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-[12.5px]">
            <dt className="text-muted-foreground">Assignee</dt>
            <dd className="font-medium">
              {order.assignee ?? "Unassigned"}
              {order.crew && (
                <span className="font-normal text-muted-foreground"> · {order.crew}</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Requested</dt>
            <dd>
              {order.requestedBy ?? "—"}{" "}
              <span className="text-muted-foreground">· {formatWoDate(order.createdAt)}</span>
            </dd>
          </dl>
          {order.failureReport ? (
            <button
              type="button"
              onClick={() => onOpenFailureReport?.(order.failureReport!.id)}
              disabled={!onOpenFailureReport}
              className="group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-[12.5px] outline-none enabled:hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
            >
              <FileWarning className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <CodeChip code={order.failureReport.id} />
                  {order.failureReport.severity && (
                    <SeverityBadge
                      severity={order.failureReport.severity}
                      className="h-5 px-1.5 text-[11.5px]"
                    />
                  )}
                </span>
                <span
                  className="line-clamp-2 font-medium"
                  title={`ISO 14224 failure report ${order.failureReport.id}`}
                >
                  {order.failureReport.title}
                </span>
              </span>
              {onOpenFailureReport && (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[12.5px] text-muted-foreground">
              <FileWarning className="size-4" aria-hidden /> No failure report linked
              {order.type === "corrective" ? " — required before close" : ""}
            </div>
          )}
        </div>

        {order.description && (
          <p className="px-4 pt-3 text-[13px] text-muted-foreground">{order.description}</p>
        )}

        {/* body */}
        <div className="grid gap-5 p-4 @2xl:grid-cols-2 @2xl:gap-6">
          <div className="grid content-start gap-5">
            <Panel title="Tasks" meta={`${doneCount} of ${tasks.length}`}>
              <ul className="grid divide-y rounded-xl border">
                {tasks.map((t) => {
                  const id = `${order.id}-${t.id}`;
                  const disabled = tasksLocked;
                  return (
                    <li key={t.id} className="flex items-start gap-2.5 px-3 py-2">
                      <Checkbox
                        id={id}
                        checked={t.done}
                        disabled={disabled}
                        onCheckedChange={(v) => toggle(t.id, v === true)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          "grid min-w-0 flex-1 gap-0.5 text-[13px]",
                          t.done && "text-muted-foreground",
                        )}
                      >
                        <span className="flex items-start gap-1.5">
                          {t.safety && (
                            <ShieldAlert
                              className="mt-0.5 size-3.5 shrink-0"
                              style={{ color: TONE_COLOR.small }}
                              aria-label="Safety step"
                            />
                          )}
                          <span
                            className={cn(t.done && "line-through decoration-muted-foreground/60")}
                          >
                            {t.label}
                          </span>
                        </span>
                        {t.note && (
                          <span className="text-[12px] text-muted-foreground">{t.note}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
                {!tasks.length && (
                  <li className="px-3 py-2 text-[12.5px] text-muted-foreground">No tasks.</li>
                )}
              </ul>
            </Panel>
            <Panel title="Labor" meta={`${fmtH(actual)} h logged`}>
              <ul className="grid divide-y rounded-xl border text-[13px]">
                {(order.labor ?? []).map((l, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{l.person}</span>
                      {l.craft && <span className="text-muted-foreground"> · {l.craft}</span>}
                      <span className="block text-[12px] text-muted-foreground">
                        from {formatWoDate(l.start)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {fmtH(l.hours)} <span className="text-muted-foreground">h</span>
                    </span>
                  </li>
                ))}
                {!(order.labor ?? []).length && (
                  <li className="px-3 py-2 text-[12.5px] text-muted-foreground">
                    No time booked yet.
                  </li>
                )}
              </ul>
            </Panel>
          </div>
          <div className="grid content-start gap-5">
            <Panel title="Spare parts" meta={`${readyParts} of ${parts.length} ready`}>
              <ul className="grid divide-y rounded-xl border text-[13px]">
                {parts.map((p) => {
                  const s = partStock(p);
                  const m = PART_STOCK[s];
                  return (
                    <li key={p.partNo} className="grid gap-0.5 px-3 py-2">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-medium" title={p.name}>
                          {p.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {p.qty} {p.unit ?? "pcs"}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-x-3 text-[12px] text-muted-foreground">
                        <span className="font-mono text-[11.5px]">{p.partNo}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Dot color={m.color} />
                          <span
                            className={cn(
                              (s === "short" || s === "out") && "font-medium text-foreground",
                            )}
                          >
                            {m.label}
                            {s === "short" || s === "out"
                              ? ` · ${p.onHand} on hand${p.eta ? ` · ETA ${p.eta}` : ""}`
                              : s === "in-stock"
                                ? ` · ${p.onHand} on hand`
                                : ""}
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
                {!parts.length && (
                  <li className="px-3 py-2 text-[12.5px] text-muted-foreground">
                    No parts required.
                  </li>
                )}
              </ul>
            </Panel>
            <Panel title="History" meta={`${history.length} changes`}>
              <ol className="relative grid gap-3 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
                {history.map((h, i) => (
                  <li key={i} className="relative text-[13px]">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1 -left-5 size-[11px] rounded-full border-2 border-card",
                        i === 0 && "ring-2 ring-highlight/30",
                      )}
                      style={{ background: TONE_COLOR[WORK_ORDER_STATUS[h.status].tone] }}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-medium">{WORK_ORDER_STATUS[h.status].label}</span>
                      <span className="text-[12px] text-muted-foreground tabular-nums">
                        <Clock className="mr-1 inline size-3 -translate-y-px" aria-hidden />
                        {formatWoDate(h.at)}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {h.by}
                      {h.note && <> — {h.note}</>}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        </div>
        {extra ? <div className="grid gap-4 p-4 pt-0">{extra}</div> : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Master–detail                                                        */
/* ------------------------------------------------------------------ */

export type WorkOrderWorkspaceProps = Omit<WorkOrderListProps, "className"> &
  Pick<
    WorkOrderDetailProps,
    "onStatusChange" | "onTaskToggle" | "onOpenFailureReport" | "extra"
  > & {
    /** Height of the side-by-side row; both columns fill it and scroll inside. Default "42rem". Use "100%" inside a sized parent. */
    height?: string;
    className?: string;
  };

/**
 * List + detail side by side at a shared height (`height`); both columns end together and scroll inside,
 * so neither leaves empty space. Below 42rem (672 px) container width it stacks.
 */
export function WorkOrderWorkspace({
  orders,
  selectedId,
  onSelect,
  now,
  onStatusChange,
  onTaskToggle,
  onOpenFailureReport,
  extra,
  height = "42rem",
  className,
  ...listProps
}: WorkOrderWorkspaceProps) {
  const [internal, setInternal] = React.useState(selectedId ?? orders[0]?.id);
  const sel = selectedId ?? internal;
  const order = orders.find((o) => o.id === sel) ?? orders[0];
  const select = (id: string) => {
    setInternal(id);
    onSelect?.(id);
  };
  return (
    <div className={cn("@container w-full", className)} style={{ ["--wo-h" as string]: height }}>
      <div className="grid gap-3 @2xl:h-(--wo-h) @2xl:grid-cols-[minmax(16.5rem,24rem)_minmax(0,1fr)]">
        <div className="min-h-0 @max-2xl:h-[22rem]">
          <WorkOrderList
            orders={orders}
            selectedId={order?.id}
            onSelect={select}
            now={now}
            {...listProps}
            className="h-full"
          />
        </div>
        {order ? (
          <WorkOrderDetail
            order={order}
            now={now}
            onStatusChange={onStatusChange}
            onTaskToggle={onTaskToggle}
            onOpenFailureReport={onOpenFailureReport}
            extra={extra}
            className="@max-2xl:h-auto"
          />
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed p-8 text-[13px] text-muted-foreground">
            <Package className="mb-2 size-5" /> Select a work order
          </div>
        )}
      </div>
    </div>
  );
}
