import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, ExternalLinkIcon, PencilIcon, PlusIcon, SearchIcon, TagIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/queries";
import {
  useItems,
  useItemCosts,
  useRetireRecord,
  useRevalue,
  useSaveItem,
  type Item,
  type ItemInput,
} from "@/lib/md";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/molca/stat-strip";
import { PageTitle } from "@/components/shell/page-header";
import { ReasonField } from "@/components/md/ReasonField";
import { CostHistory, CostList } from "@/components/md/CostHistory";

// Spare parts (Master Data owns the catalogue and its valuation): what a part is, how it is stocked (min / max,
// lead time) and what it is worth — the unit cost is the moving average of receipts booked in Maintenance, and every
// change shows on the price chart. Stock, receipts and issues stay in Maintenance; this page links there.

const idr = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
const MAINTENANCE_WEB =
  (import.meta.env.VITE_MAINTENANCE_WEB_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://localhost:3600" : undefined);

type View = "all" | "critical" | "noPrice" | "rotable";
type Form =
  | { mode: "new" }
  | { mode: "edit"; item: Item }
  | { mode: "revalue"; item: Item }
  | { mode: "off"; item: Item };

function SparePartsPage() {
  const { t } = useTranslation();
  const { data: items, isPending } = useItems();
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<View>("all");
  // ?item=<id> (from Maintenance "Edit in Master Data") opens that item
  const [sel, setSel] = React.useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("item") ?? undefined,
  );
  const [form, setForm] = React.useState<Form | null>(null);

  const all = items ?? [];
  const noPrice = all.filter((i) => i.unitCost == null || Number(i.unitCost) === 0);
  const categories = [...new Set(all.map((i) => i.category || "—"))].sort();
  const list = all
    .filter((i) =>
      view === "critical"
        ? i.critical
        : view === "noPrice"
          ? noPrice.includes(i)
          : view === "rotable"
            ? i.rotable
            : true,
    )
    .filter(
      (i) =>
        !query ||
        `${i.code} ${i.name} ${i.category} ${i.erpCode}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => (a.category || "").localeCompare(b.category || "") || a.code.localeCompare(b.code),
    );
  const current = all.find((i) => i.id === sel) ?? list[0];

  return (
    <>
      <PageTitle
        title={t("md.sp.title")}
        subtitle={t("md.sp.subtitle")}
        crumbs={current ? [t("md.sp.title"), current.code] : [t("md.sp.title")]}
        actions={
          <Button size="sm" onClick={() => setForm({ mode: "new" })}>
            <PlusIcon /> {t("md.sp.add")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-5"
          cells={[
            {
              label: t("md.sp.s.items"),
              value: all.length,
              sub: t("md.sp.s.categories", { n: categories.length }),
            },
            {
              label: t("md.sp.s.critical"),
              value: all.filter((i) => i.critical).length,
              sub: t("md.sp.s.criticalSub"),
            },
            {
              label: t("md.sp.s.rotable"),
              value: all.filter((i) => i.rotable).length,
              sub: t("md.sp.s.rotableSub"),
            },
            {
              label: t("md.sp.s.noPrice"),
              value: noPrice.length,
              sub: t("md.sp.s.noPriceSub"),
              status: noPrice.length ? "warn" : "ok",
            },
            {
              label: t("md.sp.s.noLead"),
              value: all.filter((i) => i.critical && i.leadTimeDays == null).length,
              sub: t("md.sp.s.noLeadSub"),
              status: all.some((i) => i.critical && i.leadTimeDays == null) ? "warn" : "ok",
            },
          ]}
        />
        <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
          <Card className="gap-3 self-start px-3 py-3 @3xl/shell:sticky @3xl/shell:top-16 @3xl/shell:max-h-[calc(100dvh-5rem)]">
            <InputGroup className="h-8">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("md.sp.filter")}
                aria-label={t("md.sp.filter")}
              />
            </InputGroup>
            <div
              className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg bg-muted p-0.5 text-[12.5px]"
              role="radiogroup"
            >
              {(["all", "critical", "noPrice", "rotable"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-2 py-0.5",
                    view === v ? "bg-card font-medium shadow-xs" : "text-muted-foreground",
                  )}
                >
                  {t(`md.sp.v.${v}`)}
                </button>
              ))}
            </div>
            {isPending ? (
              <Skeleton className="h-64" />
            ) : (
              <ul className="-mx-1 min-h-0 overflow-y-auto px-1 @3xl/shell:flex-1">
                {list.map((i, k) => (
                  <React.Fragment key={i.id}>
                    {k === 0 || list[k - 1]!.category !== i.category ? (
                      <li className="px-2 pt-2 pb-1 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                        {i.category || "—"}
                      </li>
                    ) : null}
                    <li>
                      <button
                        type="button"
                        onClick={() => setSel(i.id)}
                        className={cn(
                          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle",
                          current?.id === i.id && "bg-subtle",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            {i.critical ? (
                              <span
                                aria-label={t("md.sp.s.critical")}
                                className="size-1.5 shrink-0 rounded-full bg-[var(--sys-red)]"
                              />
                            ) : null}
                            <span
                              className={cn(
                                "truncate text-[13px]",
                                current?.id === i.id && "font-medium",
                              )}
                            >
                              {i.name}
                            </span>
                          </span>
                          <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                            {i.code}
                          </span>
                        </span>
                        <span
                          className="text-right text-[12.5px] tabular-nums"
                          style={{ color: i.unitCost == null ? "var(--sys-orange)" : undefined }}
                        >
                          {i.unitCost == null ? t("md.sp.noPrice") : idr(Number(i.unitCost))}
                          <span className="block text-[11px] text-muted-foreground">/ {i.uom}</span>
                        </span>
                      </button>
                    </li>
                  </React.Fragment>
                ))}
                {!list.length ? (
                  <li className="py-6 text-center text-[13px] text-muted-foreground">
                    {t("md.sp.empty")}
                  </li>
                ) : null}
              </ul>
            )}
          </Card>
          {current ? <ItemDetail item={current} onForm={setForm} /> : null}
        </div>
      </div>
      {form?.mode === "new" || form?.mode === "edit" ? (
        <ItemDialog
          item={form.mode === "edit" ? form.item : undefined}
          taken={all.map((i) => i.code)}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={setSel}
        />
      ) : form?.mode === "revalue" ? (
        <RevalueDialog item={form.item} onClose={() => setForm(null)} />
      ) : form?.mode === "off" ? (
        <RetireItem item={form.item} onClose={() => setForm(null)} />
      ) : null}
    </>
  );
}

function ItemDetail({ item, onForm }: { item: Item; onForm: (f: Form) => void }) {
  const { t } = useTranslation();
  const { data: costs } = useItemCosts(item.id);
  const last90 = (costs ?? []).filter(
    (c) => Date.now() - new Date(c.at).getTime() < 90 * 86_400_000,
  );
  const receipts = (costs ?? []).filter((c) => c.source === "receipt");
  const lastPrice = receipts[0]?.price;
  const stats: [string, React.ReactNode, string?][] = [
    [
      t("md.sp.f.unitCost"),
      item.unitCost == null ? "—" : idr(Number(item.unitCost)),
      t("md.sp.f.unitCostSub"),
    ],
    [
      t("md.sp.f.lastPrice"),
      lastPrice == null ? "—" : idr(Number(lastPrice)),
      receipts[0]
        ? new Date(receipts[0].at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
        : undefined,
    ],
    [t("md.sp.f.changes"), last90.length, t("md.sp.f.changesSub")],
    [t("md.sp.f.uom"), item.uom],
    [t("md.sp.f.min"), `${Number(item.minQty).toLocaleString("id-ID")} ${item.uom}`],
    [
      t("md.sp.f.max"),
      item.maxQty == null ? "—" : `${Number(item.maxQty).toLocaleString("id-ID")} ${item.uom}`,
    ],
    [
      t("md.sp.f.lead"),
      item.leadTimeDays == null ? "—" : t("md.sp.f.days", { n: item.leadTimeDays }),
    ],
    [t("md.sp.f.erp"), item.erpCode || "—"],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card>
        <CardHeader>
          <div className="font-mono text-[12px] text-muted-foreground">{item.code}</div>
          <CardTitle className="text-[17px]">{item.name}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1.5">
            <span>{item.category || "—"}</span>
            {item.critical ? <Badge variant="destructive">{t("md.sp.s.critical")}</Badge> : null}
            {item.rotable ? <Badge variant="secondary">{t("md.sp.s.rotable")}</Badge> : null}
            {item.batchTracked ? <Badge variant="secondary">{t("md.sp.batch")}</Badge> : null}
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button size="sm" onClick={() => onForm({ mode: "revalue", item })}>
              <TagIcon /> {t("md.sp.revalue")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onForm({ mode: "edit", item })}>
              <PencilIcon /> {t("md.assets.edit")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onForm({ mode: "off", item })}>
              <BanIcon /> {t("md.h.deactivate")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-4">
            {stats.map(([k, v, sub]) => (
              <div key={k} className="-mr-px -mb-px border-r border-b px-3.5 py-2.5">
                <div className="truncate text-[12px] text-muted-foreground">{k}</div>
                <div className="mt-0.5 truncate text-[16px] font-semibold tabular-nums">{v}</div>
                {sub ? (
                  <div className="truncate text-[11.5px] text-muted-foreground">{sub}</div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle>{t("md.sp.history")}</CardTitle>
          <CardDescription>{t("md.sp.historyHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CostHistory
            itemId={item.id}
            current={item.unitCost == null ? null : Number(item.unitCost)}
          />
          {costs?.length ? <CostList data={costs as never} /> : null}
        </CardContent>
      </Card>
      {MAINTENANCE_WEB ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {t("md.sp.stockNote")}
          <a
            href={`${MAINTENANCE_WEB}/parts`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLinkIcon className="size-3" /> {t("md.sp.openStock")}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function ItemDialog({
  item,
  taken,
  categories,
  onClose,
  onSaved,
}: {
  item?: Item;
  taken: string[];
  categories: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveItem();
  const [f, setF] = React.useState<ItemInput>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "",
    uom: item?.uom ?? "pcs",
    critical: item?.critical ?? false,
    rotable: item?.rotable ?? false,
    minQty: Number(item?.minQty ?? 0),
    maxQty: item?.maxQty == null ? null : Number(item.maxQty),
    leadTimeDays: item?.leadTimeDays ?? null,
    batchTracked: item?.batchTracked ?? false,
    erpCode: item?.erpCode ?? "",
    ...(item ? {} : { unitCost: null }),
  });
  const [reason, setReason] = React.useState("");
  const codeTaken = taken.some(
    (c) => c !== item?.code && c.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const maxBad = f.maxQty != null && f.maxQty < f.minQty;
  const ready = f.code.trim() && f.name.trim() && !codeTaken && !maxBad && (!item || reason.trim());
  const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? t("md.assets.editTitle", { tag: item.code }) : t("md.sp.add")}
          </DialogTitle>
          <DialogDescription>{t("md.sp.formHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("md.sp.f.code")} hint={codeTaken ? t("md.c.codeTaken") : undefined}>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="SP-BRG-6310"
            />
          </Field>
          <Field label={t("md.f.name")}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("md.sp.f.category")}>
            <Input
              list="md-categories"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            />
            <datalist id="md-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={t("md.sp.f.uom")}>
            <Input value={f.uom} onChange={(e) => setF({ ...f, uom: e.target.value })} />
          </Field>
          <Field label={t("md.sp.f.min")}>
            <Input
              inputMode="decimal"
              value={f.minQty}
              onChange={(e) => setF({ ...f, minQty: n(e.target.value) ?? 0 })}
            />
          </Field>
          <Field label={t("md.sp.f.max")} hint={maxBad ? t("md.sp.maxBad") : undefined}>
            <Input
              inputMode="decimal"
              value={f.maxQty ?? ""}
              onChange={(e) => setF({ ...f, maxQty: n(e.target.value) })}
            />
          </Field>
          <Field label={t("md.sp.f.lead")}>
            <Input
              inputMode="numeric"
              value={f.leadTimeDays ?? ""}
              onChange={(e) => setF({ ...f, leadTimeDays: n(e.target.value) })}
            />
          </Field>
          <Field label={t("md.sp.f.erp")}>
            <Input value={f.erpCode} onChange={(e) => setF({ ...f, erpCode: e.target.value })} />
          </Field>
          {!item ? (
            <Field label={t("md.sp.f.unitCost")} hint={t("md.sp.firstCost")}>
              <Input
                inputMode="numeric"
                value={f.unitCost ?? ""}
                onChange={(e) => setF({ ...f, unitCost: n(e.target.value.replace(/\D/g, "")) })}
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            {(["critical", "rotable", "batchTracked"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v === true })} />
                {t(`md.sp.flag.${k}`)}
              </label>
            ))}
          </div>
        </div>
        {item ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: item?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  name: f.name.trim(),
                },
                {
                  onSuccess: (x) => (
                    toast.success(t("md.h.saved", { name: x.code })),
                    onClose(),
                    onSaved(x.id)
                  ),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevalueDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const revalue = useRevalue();
  const [cost, setCost] = React.useState("");
  const [reason, setReason] = React.useState("");
  const now = Number(item.unitCost ?? 0);
  const next = Number(cost.replace(/\D/g, ""));
  const delta = now && next ? (next - now) / now : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.sp.revalueTitle", { code: item.code })}</DialogTitle>
          <DialogDescription>{t("md.sp.revalueHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.sp.f.unitCost")}</Label>
            <div className="h-9 rounded-md border bg-subtle px-3 py-2 text-[13px] tabular-nums">
              {item.unitCost == null ? "—" : idr(now)}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.sp.newCost")}</Label>
            <Input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
            {delta != null ? (
              <p
                className="text-[12px] tabular-nums"
                style={{
                  color: Math.abs(delta) >= 0.1 ? "var(--sys-orange)" : "var(--muted-foreground)",
                }}
              >
                {delta > 0 ? "+" : ""}
                {(delta * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
              </p>
            ) : null}
          </div>
        </div>
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!next || !reason.trim() || revalue.isPending}
            onClick={() =>
              revalue.mutate(
                {
                  id: item.id,
                  newCost: next,
                  reason: reason.trim(),
                  byName: me?.preferredUsername ?? "",
                },
                {
                  onSuccess: () => (
                    toast.success(t("md.sp.revalued", { code: item.code })),
                    onClose()
                  ),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t("md.sp.revalue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetireItem({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation();
  const retire = useRetireRecord();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.h.offTitle", { name: item.code })}</DialogTitle>
          <DialogDescription>{t("md.sp.offHint")}</DialogDescription>
        </DialogHeader>
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || retire.isPending}
            onClick={() =>
              retire.mutate(
                { kind: "items", id: item.id, reason: reason.trim() },
                {
                  onSuccess: () => (
                    toast.success(t("md.h.offDone", { name: item.code })),
                    onClose()
                  ),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t("md.h.deactivate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12.5px]">{label}</Label>
      {children}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export { SparePartsPage };
