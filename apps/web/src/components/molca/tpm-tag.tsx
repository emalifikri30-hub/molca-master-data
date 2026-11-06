"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/**
 * TPM tags: the abnormality tags of autonomous maintenance (JIPM).
 * - red: needs the maintenance team (mechanical, electrical, packing engineering, process)
 * - white: the operator can fix it (cleaning, tightening, lubrication)
 * - kaizen: an improvement idea with a priority
 * Flow: open (verification not OK) → the PIC sends the repair → review (not verified) → the person who raised it
 * or a supervisor verifies → closed (OK), or revises → open (not OK).
 */
export type TagKind = "red" | "white" | "kaizen";
/** proposed / rejected: a kaizen idea before (or instead of) approval */
export type TagStatus = "proposed" | "open" | "review" | "closed" | "rejected";
export type TagVerification = "not_ok" | "not_verified" | "ok";
export type TagCategory = "losses" | "operator_convenience" | "environment";
export type TagPic = { id: string; name: string; discipline?: string };

export type TpmTag = {
  id: string;
  number: string;
  kind: TagKind;
  title: string;
  asset: string;
  subAsset?: string;
  criteria?: "A" | "B" | "C" | null;
  priority?: "urgent" | "high" | "medium" | "low" | null;
  category?: TagCategory | null;
  pics: TagPic[];
  status: TagStatus;
  verification: TagVerification;
  dueAt: string | Date;
  raisedBy?: string;
  leadTimeDays?: number | null;
  /** a small photo of the abnormality (the board shows it) */
  thumb?: string | null;
  /** JIPM abnormality, already in words */
  abnormality?: string | null;
  /** a safety risk: shown first and marked */
  safety?: boolean;
  /** the same abnormality on the same asset this many times in 90 days */
  repeats?: number;
};

export const TAG_KIND_META: Record<TagKind, { label: string; color: string; description: string }> =
  {
    red: { label: "Red tag", color: "var(--sys-red)", description: "Needs the maintenance team" },
    white: { label: "White tag", color: "var(--sys-gray)", description: "The operator can fix it" },
    kaizen: { label: "Kaizen", color: "var(--sys-indigo)", description: "Improvement idea" },
  };
/** JIPM's seven abnormalities: what each means and an example, for the operator choosing one. */
export type Abnormality =
  | "minor_flaw"
  | "basic_condition"
  | "inaccessible"
  | "contamination"
  | "quality_defect"
  | "unnecessary"
  | "unsafe";
export const ABNORMALITY_META: Record<Abnormality, { label: string; hint: string; color: string }> =
  {
    minor_flaw: {
      label: "Cacat kecil",
      hint: "Aus, longgar, retak, bocor kecil, bunyi atau getaran tidak biasa",
      color: "var(--sys-orange)",
    },
    basic_condition: {
      label: "Kondisi dasar tidak terpenuhi",
      hint: "Kurang pelumas, baut kurang, level oli rendah, label / name plate hilang",
      color: "var(--sys-indigo)",
    },
    inaccessible: {
      label: "Sulit dijangkau / diinspeksi",
      hint: "Bagian yang sulit dibersihkan, dilumasi, atau dilihat",
      color: "var(--sys-purple, #7c3aed)",
    },
    contamination: {
      label: "Sumber kontaminasi",
      hint: "Tumpahan, rembesan, remah, debu, oli yang mencemari mesin atau produk",
      color: "var(--sys-teal, #0d9488)",
    },
    quality_defect: {
      label: "Sumber cacat kualitas",
      hint: "Kondisi mesin yang membuat produk cacat: potongan, seal, berat, kode",
      color: "var(--sys-pink, #db2777)",
    },
    unnecessary: {
      label: "Barang / hal tidak perlu",
      hint: "Barang tidak terpakai, kabel bekas, atau perbaikan yang sebenarnya tidak perlu",
      color: "var(--sys-gray)",
    },
    unsafe: {
      label: "Tidak aman",
      hint: "Risiko keselamatan: bagian bertegangan terbuka, tangga rusak, guard hilang",
      color: "var(--sys-red)",
    },
  };

export const TAG_STATUS_LABEL: Record<TagStatus, string> = {
  proposed: "Proposed",
  open: "Open",
  review: "Review",
  closed: "Closed",
  rejected: "Rejected",
};
export const TAG_VERIFICATION_META: Record<TagVerification, { label: string; className: string }> =
  {
    not_ok: { label: "Not OK", className: "bg-danger-soft text-danger" },
    not_verified: {
      label: "Not verified",
      className:
        "bg-warning-soft text-[color-mix(in_oklab,var(--warning)_72%,black)] dark:text-warning",
    },
    ok: { label: "OK", className: "bg-success-soft text-success" },
  };
export const TAG_CATEGORY_LABEL: Record<TagCategory, string> = {
  losses: "Losses",
  operator_convenience: "Operator convenience",
  environment: "Environment",
};

const asDate = (d: string | Date) => (d instanceof Date ? d : new Date(d));
export const isOverdue = (t: Pick<TpmTag, "status" | "dueAt">, now = new Date()) =>
  t.status !== "closed" && t.status !== "rejected" && asDate(t.dueAt).getTime() < now.getTime();

/* ------------------------------------------------------------------ */
/* Atoms                                                               */
/* ------------------------------------------------------------------ */

/** The tag colour as a folded-corner tag, plus its kind. Red stays red even when closed: it names the tag, not a state. */
export function TagKindBadge({
  kind,
  label,
  className,
}: {
  kind: TagKind;
  label?: string;
  className?: string;
}) {
  const m = TAG_KIND_META[kind];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <svg viewBox="0 0 12 14" className="size-3 shrink-0" aria-hidden>
        <path
          d="M1 1h7l3 3v9H1z"
          fill={kind === "white" ? "var(--card)" : m.color}
          stroke={m.color}
          strokeWidth="1.2"
        />
        <circle cx="4" cy="4" r="1" fill={kind === "white" ? m.color : "var(--card)"} />
      </svg>
      {label ?? m.label}
    </span>
  );
}

export function TagVerificationChip({
  value,
  label,
  className,
}: {
  value: TagVerification;
  label?: string;
  className?: string;
}) {
  const m = TAG_VERIFICATION_META[value];
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", m.className, className)}>
      {label ?? m.label}
    </span>
  );
}

/** Due date; red when the tag is late, orange within a day. */
export function TagDueChip({
  tag,
  locale = "id-ID",
  lateLabel = "late",
  className,
}: {
  tag: Pick<TpmTag, "status" | "dueAt">;
  locale?: string;
  lateLabel?: string;
  className?: string;
}) {
  const due = asDate(tag.dueAt);
  const late = isOverdue(tag);
  const soon = !late && tag.status !== "closed" && due.getTime() - Date.now() < 86_400_000;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        late
          ? "font-medium text-danger"
          : soon
            ? "text-[color-mix(in_oklab,var(--warning)_72%,black)] dark:text-warning"
            : "text-muted-foreground",
        className,
      )}
    >
      {due.toLocaleDateString(locale, { day: "2-digit", month: "short" })}
      {late ? ` · ${lateLabel}` : ""}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const s = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium">
      {s}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Card and board                                                      */
/* ------------------------------------------------------------------ */

export type TagCardProps = {
  tag: TpmTag;
  onSelect?: (tag: TpmTag) => void;
  selected?: boolean;
  /** Labels for i18n; defaults are English */
  labels?: {
    lead?: string;
    late?: string;
    noPic?: string;
    verification?: Partial<Record<TagVerification, string>>;
    safety?: string;
    repeat?: (n: number) => string;
    rejected?: string;
  };
  locale?: string;
  className?: string;
};

/**
 * One tag, kept calm: kind (small mark + word) and number, the title, the machine line, then PIC and due date.
 * Lateness is said once (the due date turns red with "n d late"); verification shows only once the tag left Open,
 * where it carries information (review: not verified · closed: OK).
 */
export function TagCard({ tag, onSelect, selected, labels, locale, className }: TagCardProps) {
  const late = isOverdue(tag);
  const due = asDate(tag.dueAt);
  const daysLate = Math.max(1, Math.round((Date.now() - due.getTime()) / 86_400_000));
  const m = TAG_KIND_META[tag.kind];
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      type={onSelect ? "button" : undefined}
      onClick={onSelect ? () => onSelect(tag) : undefined}
      className={cn(
        "grid w-full gap-1.5 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors",
        onSelect &&
          "hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected && "border-foreground/40",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-full"
          style={
            tag.kind === "white"
              ? { boxShadow: `inset 0 0 0 1.5px ${m.color}` }
              : { background: m.color }
          }
        />
        <span>{m.label}</span>
        <span className="ml-auto font-mono">{tag.number}</span>
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-snug font-medium">{tag.title}</div>
          {(tag.safety || tag.abnormality || (tag.repeats ?? 0) >= 3) && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px]">
              {tag.safety && (
                <span style={{ color: "var(--sys-red)" }} className="font-medium">
                  {labels?.safety ?? "Safety"}
                </span>
              )}
              {tag.abnormality && <span className="text-muted-foreground">{tag.abnormality}</span>}
              {(tag.repeats ?? 0) >= 3 && (
                <span style={{ color: "var(--sys-orange)" }}>
                  {labels?.repeat ? labels.repeat(tag.repeats!) : `repeat ${tag.repeats}×`}
                </span>
              )}
            </div>
          )}
        </div>
        {tag.thumb && (
          <img src={tag.thumb} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
        )}
      </div>
      <div className="truncate text-[12px] text-muted-foreground">
        {tag.asset}
        {tag.subAsset ? ` › ${tag.subAsset}` : ""}
        {tag.criteria ? ` · ${tag.criteria}` : tag.priority ? ` · ${tag.priority}` : ""}
        {tag.category ? ` · ${TAG_CATEGORY_LABEL[tag.category]}` : ""}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        {tag.pics.length ? (
          <span
            className="flex min-w-0 items-center gap-1.5"
            title={tag.pics
              .map((p) => `${p.name}${p.discipline ? ` (${p.discipline})` : ""}`)
              .join(", ")}
          >
            <span className="flex shrink-0 -space-x-1.5">
              {tag.pics.slice(0, 2).map((p) => (
                <Initials key={p.id} name={p.name} />
              ))}
            </span>
            {tag.pics.length === 1 && (
              <span className="truncate text-muted-foreground">{tag.pics[0]!.name}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{labels?.noPic ?? "No PIC"}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
          {tag.status === "rejected" ? (
            <span className="text-muted-foreground">{labels?.rejected ?? "Rejected"}</span>
          ) : (
            tag.status === "closed" && (
              <span
                style={{
                  color: tag.verification === "ok" ? "var(--sys-green)" : "var(--muted-foreground)",
                }}
              >
                {labels?.verification?.[tag.verification] ??
                  TAG_VERIFICATION_META[tag.verification].label}
              </span>
            )
          )}
          {tag.status === "closed" && tag.leadTimeDays != null ? (
            <span className="text-muted-foreground">
              {labels?.lead ?? "Lead time"}{" "}
              {tag.leadTimeDays.toLocaleString(locale, { maximumFractionDigits: 1 })} d
            </span>
          ) : late ? (
            <span style={{ color: "var(--sys-red)" }}>
              {due.toLocaleDateString(locale, { day: "numeric", month: "short" })} · {daysLate} d{" "}
              {labels?.late ?? "late"}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {due.toLocaleDateString(locale, { day: "numeric", month: "short" })}
            </span>
          )}
        </span>
      </div>
    </Tag>
  );
}

export type TagBoardProps = {
  tags: TpmTag[];
  onSelect?: (tag: TpmTag) => void;
  selectedId?: string;
  /** Column titles for i18n */
  columnLabels?: Partial<Record<TagStatus, string>>;
  cardLabels?: TagCardProps["labels"];
  locale?: string;
  /** Closed tags to show (most recent first); the column states the full count */
  closedLimit?: number;
  /** Column height (CSS); each column then scrolls on its own. Default: grows with its cards */
  columnHeight?: string;
  /** Columns to show, e.g. proposed / open / review / closed for kaizen. Rejected ideas sit in Closed. */
  columns?: TagStatus[];
  className?: string;
};

/** Open / Review / Closed columns; late tags first, then by due date. */
export function TagBoard({
  tags,
  onSelect,
  selectedId,
  columnLabels,
  cardLabels,
  locale,
  closedLimit = 12,
  columnHeight,
  columns,
  className,
}: TagBoardProps) {
  const cols: TagStatus[] = columns ?? ["open", "review", "closed"];
  return (
    <div
      className={cn(
        "grid gap-3",
        cols.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3",
        className,
      )}
    >
      {cols.map((s) => {
        const all = tags
          .filter((t) => t.status === s || (s === "closed" && t.status === "rejected"))
          .sort((a, b) =>
            s === "closed"
              ? asDate(b.dueAt).getTime() - asDate(a.dueAt).getTime()
              : Number(isOverdue(b)) - Number(isOverdue(a)) ||
                asDate(a.dueAt).getTime() - asDate(b.dueAt).getTime(),
          );
        const shown = s === "closed" ? all.slice(0, closedLimit) : all;
        return (
          <section
            key={s}
            className="flex min-h-0 flex-col gap-2"
            style={columnHeight ? { height: columnHeight } : undefined}
          >
            <header className="flex shrink-0 items-baseline gap-2 px-1 pb-1 text-[13px] font-medium">
              {columnLabels?.[s] ?? TAG_STATUS_LABEL[s]}
              <span className="text-[12px] font-normal text-muted-foreground tabular-nums">
                {all.length}
              </span>
              {s !== "closed" && all.some((t) => isOverdue(t)) ? (
                <span
                  className="ml-auto text-[12px] font-normal tabular-nums"
                  style={{ color: "var(--sys-red)" }}
                >
                  {all.filter((t) => isOverdue(t)).length} {cardLabels?.late ?? "late"}
                </span>
              ) : null}
            </header>
            <div className="grid min-h-0 content-start gap-2 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              {shown.map((t) => (
                <TagCard
                  key={t.id}
                  tag={t}
                  onSelect={onSelect}
                  selected={t.id === selectedId}
                  labels={cardLabels}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Counts that lead the tag page: open by kind, late, closed this month, median lead time. */
export function TagSummary({
  tags,
  labels,
  className,
}: {
  tags: TpmTag[];
  labels?: { open?: string; late?: string; closed?: string; lead?: string };
  className?: string;
}) {
  const open = tags.filter((t) => t.status !== "closed" && t.status !== "rejected");
  const late = open.filter((t) => isOverdue(t)).length;
  const leads = tags
    .map((t) => t.leadTimeDays)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const median = leads.length ? leads[Math.floor(leads.length / 2)]! : null;
  const stat = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[22px] leading-tight font-semibold tracking-tight tabular-nums",
          tone,
        )}
      >
        {value}
      </div>
    </div>
  );
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {stat(
        labels?.open ?? "Open",
        <span className="flex items-baseline gap-3">
          {open.length}
          <span className="flex gap-2 text-xs font-normal text-muted-foreground">
            {(["red", "white", "kaizen"] as TagKind[]).map((k) => (
              <TagKindBadge
                key={k}
                kind={k}
                label={String(open.filter((t) => t.kind === k).length)}
              />
            ))}
          </span>
        </span>,
      )}
      {stat(labels?.late ?? "Late", late, late ? "text-danger" : undefined)}
      {stat(labels?.closed ?? "Closed", tags.length - open.length)}
      {stat(
        labels?.lead ?? "Median lead time",
        median == null
          ? "—"
          : `${median.toLocaleString(undefined, { maximumFractionDigits: 1 })} d`,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guide and abnormality Pareto                                        */
/* ------------------------------------------------------------------ */

export type TagKindGuideItem = {
  kind: TagKind;
  title: string;
  who: string;
  when: string;
  examples: string;
  due: string;
};

/** The three tags side by side: who fixes it, when to hang it, examples and the due rule — the board's legend. */
export function TagKindGuide({
  items,
  className,
}: {
  items: TagKindGuideItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 md:grid-cols-3", className)}>
      {items.map((it) => {
        const m = TAG_KIND_META[it.kind];
        return (
          <div key={it.kind} className="grid content-start gap-1.5 rounded-xl border bg-card p-3.5">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={
                  it.kind === "white"
                    ? { boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                    : { background: m.color }
                }
              />
              <span className="text-[13.5px] font-semibold">{it.title}</span>
              <span className="ml-auto text-[11.5px] text-muted-foreground">{it.who}</span>
            </div>
            <p className="text-[12.5px]">{it.when}</p>
            <p className="text-[12px] text-muted-foreground">{it.examples}</p>
            <p className="text-[12px] text-muted-foreground">{it.due}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Open tags by abnormality, largest first: where autonomous maintenance should look next. */
export function AbnormalityPareto({
  counts,
  labels,
  className,
}: {
  counts: Partial<Record<Abnormality, number>>;
  labels?: Partial<Record<Abnormality, string>>;
  className?: string;
}) {
  const rows = (Object.keys(ABNORMALITY_META) as Abnormality[])
    .map((k) => ({ k, n: counts[k] ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className={cn("grid gap-1.5", className)}>
      {rows.map((r) => (
        <div
          key={r.k}
          className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-2 text-[12.5px]"
        >
          <span className="truncate text-muted-foreground" title={ABNORMALITY_META[r.k].hint}>
            {labels?.[r.k] ?? ABNORMALITY_META[r.k].label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.n / max) * 100}%`, background: ABNORMALITY_META[r.k].color }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">{r.n}</span>
        </div>
      ))}
    </div>
  );
}
