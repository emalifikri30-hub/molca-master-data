"use client";

import * as React from "react";
import { Activity, Bell, Boxes, ClipboardList, PackageX, Power, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * In-app notifications of a maintenance app: derived from live data (a machine stopped, a condition alarm (CBM), work assigned to me, a
 * critical spare short, stock below minimum, a tag late or waiting for verification). Severity drives order and
 * colour; "read" is per person.
 */
export type NotificationKind = "breakdown" | "condition" | "assigned" | "spare" | "stock" | "tag";
export type NotificationSeverity = "critical" | "warning" | "info";
export type MaintenanceNotification = {
  key: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  at: string | Date;
  read?: boolean;
  link?: string;
};

export const NOTIFICATION_KIND: Record<NotificationKind, { label: string; Icon: typeof Bell }> = {
  breakdown: { label: "Breakdown", Icon: Power },
  condition: { label: "Condition alarm", Icon: Activity },
  assigned: { label: "Assigned to me", Icon: ClipboardList },
  spare: { label: "Critical spare", Icon: Boxes },
  stock: { label: "Stock", Icon: PackageX },
  tag: { label: "TPM tag", Icon: Tag },
};
export const NOTIFICATION_SEVERITY: Record<NotificationSeverity, { color: string; rank: number }> =
  {
    critical: { color: "var(--sys-red)", rank: 0 },
    warning: { color: "var(--sys-orange)", rank: 1 },
    info: { color: "var(--sys-indigo)", rank: 2 },
  };

function ago(at: string | Date, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(at).getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

export function NotificationBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums",
        className,
      )}
      style={{ background: "var(--sys-red)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function NotificationItem({
  item,
  onOpen,
  now,
}: {
  item: MaintenanceNotification;
  onOpen?: (n: MaintenanceNotification) => void;
  now?: number;
}) {
  const { Icon } = NOTIFICATION_KIND[item.kind];
  const color = NOTIFICATION_SEVERITY[item.severity].color;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-subtle",
        !item.read && "bg-primary/[0.04]",
      )}
    >
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[13px]", !item.read && "font-semibold")}>
            {item.title}
          </span>
          {!item.read && (
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
          )}
        </span>
        {item.body && (
          <span className="line-clamp-2 text-[12px] text-muted-foreground">{item.body}</span>
        )}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {ago(item.at, now)}
      </span>
    </button>
  );
}

export type NotificationListProps = {
  items: MaintenanceNotification[];
  onOpen?: (n: MaintenanceNotification) => void;
  onMarkAllRead?: () => void;
  /** filter chips by kind */
  filterable?: boolean;
  title?: string;
  empty?: string;
  now?: number;
  className?: string;
};

export function NotificationList({
  items,
  onOpen,
  onMarkAllRead,
  filterable = true,
  title = "Notifications",
  empty = "Nothing needs your attention",
  now,
  className,
}: NotificationListProps) {
  const [kind, setKind] = React.useState<NotificationKind | "all">("all");
  const kinds = [...new Set(items.map((i) => i.kind))];
  const shown = kind === "all" ? items : items.filter((i) => i.kind === kind);
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className={cn("flex max-h-[32rem] w-full flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          {title} <NotificationBadge count={unread} />
        </span>
        {onMarkAllRead && unread > 0 && (
          <button
            type="button"
            className="text-[12px] text-primary hover:underline"
            onClick={onMarkAllRead}
          >
            Mark all read
          </button>
        )}
      </div>
      {filterable && kinds.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b px-3 py-1.5">
          {(["all", ...kinds] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-6 rounded-full border px-2 text-[11.5px]",
                kind === k
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "all" ? "All" : NOTIFICATION_KIND[k].label}{" "}
              {k === "all" ? items.length : items.filter((i) => i.kind === k).length}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 divide-y overflow-y-auto [scrollbar-gutter:stable]">
        {shown.length === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">{empty}</div>
        )}
        {shown.map((i) => (
          <NotificationItem key={i.key} item={i} onOpen={onOpen} now={now} />
        ))}
      </div>
    </div>
  );
}

/** The bell for an app header; pass the list as children of your popover. */
export function NotificationBell({
  count,
  className,
  ...props
}: { count: number } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={`Notifications (${count})`}
      className={cn(
        "relative inline-grid size-8 place-items-center rounded-lg hover:bg-subtle",
        className,
      )}
      {...props}
    >
      <Bell className="size-4" />
      <NotificationBadge count={count} className="absolute -top-0.5 -right-0.5" />
    </button>
  );
}
