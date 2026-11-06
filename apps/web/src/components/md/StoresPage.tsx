import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, PencilIcon, PlusIcon, ScanBarcodeIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  useRegistry,
  useRetireRecord,
  useSaveBin,
  useSaveStore,
  useStoresBins,
  type MdBin,
  type MdStore,
} from "@/lib/md";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatStrip } from "@/components/molca/stat-strip";
import { PageTitle } from "@/components/shell/page-header";
import { ReasonField } from "@/components/md/ReasonField";

// Stores & bins: where parts physically live. Stores on the left with their bin count, the selected store's bins on
// the right with their scan tag (RFID / barcode) — add, edit and retire in place. Maintenance books stock against
// these ids; a retired bin keeps its history.

type Form =
  | { kind: "store"; store?: MdStore }
  | { kind: "bin"; storeId: string; bin?: MdBin }
  | { kind: "off"; what: "stores" | "bins"; id: string; name: string };

function StoresPage() {
  const { t } = useTranslation();
  const { data, isPending } = useStoresBins();
  const { data: reg } = useRegistry();
  const [sel, setSel] = React.useState<string>();
  const [form, setForm] = React.useState<Form | null>(null);
  const stores = [...(data?.stores ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const bins = data?.bins ?? [];
  const current = stores.find((s) => s.id === sel) ?? stores[0];
  const ofStore = (id: string) =>
    bins.filter((b) => b.storeId === id).sort((a, b) => a.code.localeCompare(b.code));
  const untagged = bins.filter((b) => !b.tag).length;
  const siteName = (id: string) =>
    reg?.tree.root.children.flatMap((e) => e.children).find((n) => n.id === id)?.name ?? "—";
  const maxBins = Math.max(1, ...stores.map((s) => ofStore(s.id).length));

  return (
    <>
      <PageTitle
        title={t("md.st.title")}
        subtitle={t("md.st.subtitle")}
        crumbs={current ? [t("md.st.title"), current.code] : [t("md.st.title")]}
        actions={
          <Button size="sm" onClick={() => setForm({ kind: "store" })}>
            <PlusIcon /> {t("md.st.addStore")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-4"
          cells={[
            { label: t("md.st.s.stores"), value: stores.length, sub: t("md.st.s.storesSub") },
            {
              label: t("md.st.s.bins"),
              value: bins.length,
              sub: t("md.st.s.binsSub", {
                n: stores.length ? Math.round(bins.length / stores.length) : 0,
              }),
            },
            {
              label: t("md.st.s.tagged"),
              value: bins.length - untagged,
              sub: t("md.st.s.taggedSub"),
            },
            {
              label: t("md.st.s.untagged"),
              value: untagged,
              sub: t("md.st.s.untaggedSub"),
              status: untagged ? "warn" : "ok",
            },
          ]}
        />
        <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <Card className="gap-1 self-start px-3 py-3">
            {isPending ? (
              <Skeleton className="h-48" />
            ) : (
              <ul>
                {stores.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSel(s.id)}
                      className={cn(
                        "grid w-full gap-1 rounded-md px-2 py-2 text-left hover:bg-subtle",
                        current?.id === s.id && "bg-subtle",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            current?.id === s.id && "font-medium",
                          )}
                        >
                          {s.name}
                        </span>
                        <span className="font-mono text-[11.5px] text-muted-foreground">
                          {s.code}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-[var(--chart-1)]"
                            style={{ width: `${(ofStore(s.id).length / maxBins) * 100}%` }}
                          />
                        </span>
                        <span className="text-[11.5px] text-muted-foreground tabular-nums">
                          {t("md.st.binsN", { n: ofStore(s.id).length })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {current ? (
            <Card className="self-start">
              <CardHeader>
                <div className="font-mono text-[12px] text-muted-foreground">{current.code}</div>
                <CardTitle className="text-[17px]">{current.name}</CardTitle>
                <CardDescription>{siteName(current.siteId)}</CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" onClick={() => setForm({ kind: "bin", storeId: current.id })}>
                    <PlusIcon /> {t("md.st.addBin")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setForm({ kind: "store", store: current })}
                  >
                    <PencilIcon /> {t("md.assets.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({ kind: "off", what: "stores", id: current.id, name: current.name })
                    }
                  >
                    <BanIcon /> {t("md.h.deactivate")}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">{t("md.st.bin")}</TableHead>
                      <TableHead>{t("md.st.tag")}</TableHead>
                      <TableHead className="w-24 pr-6" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ofStore(current.id).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="pl-6 font-mono text-[12.5px]">{b.code}</TableCell>
                        <TableCell>
                          {b.tag ? (
                            <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
                              <ScanBarcodeIcon className="size-3.5 text-muted-foreground" />
                              {b.tag}
                            </span>
                          ) : (
                            <span className="text-[12.5px] text-[var(--sys-orange)]">
                              {t("md.st.noTag")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("md.assets.edit")}
                            onClick={() => setForm({ kind: "bin", storeId: current.id, bin: b })}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("md.h.deactivate")}
                            onClick={() =>
                              setForm({ kind: "off", what: "bins", id: b.id, name: b.code })
                            }
                          >
                            <BanIcon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!ofStore(current.id).length ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          {t("md.st.noBins")}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("md.st.note")}</p>
      </div>
      {form?.kind === "store" ? (
        <StoreDialog
          store={form.store}
          sites={
            reg?.tree.root.children.flatMap((e) => e.children).filter((n) => n.level === "site") ??
            []
          }
          taken={stores.map((s) => s.code)}
          onClose={() => setForm(null)}
          onSaved={setSel}
        />
      ) : form?.kind === "bin" ? (
        <BinDialog
          storeId={form.storeId}
          bin={form.bin}
          taken={ofStore(form.storeId).map((b) => b.code)}
          onClose={() => setForm(null)}
        />
      ) : form?.kind === "off" ? (
        <RetireDialog
          what={form.what}
          id={form.id}
          name={form.name}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}

function StoreDialog({
  store,
  sites,
  taken,
  onClose,
  onSaved,
}: {
  store?: MdStore;
  sites: { id: string; name: string }[];
  taken: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveStore();
  const [f, setF] = React.useState({
    code: store?.code ?? "",
    name: store?.name ?? "",
    siteId: store?.siteId ?? sites[0]?.id ?? "",
  });
  const [reason, setReason] = React.useState("");
  const clash = taken.some(
    (c) => c !== store?.code && c.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = f.code.trim() && f.name.trim() && !clash && (!store || reason.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {store ? t("md.assets.editTitle", { tag: store.code }) : t("md.st.addStore")}
          </DialogTitle>
          <DialogDescription>{t("md.st.storeHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.h.code")}</Label>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="LS-BIS"
            />
            {clash ? (
              <p className="text-[12px] text-muted-foreground">{t("md.c.codeTaken")}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.f.name")}</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
        </div>
        {store ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: store?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  name: f.name.trim(),
                },
                {
                  onSuccess: (s) => (
                    toast.success(t("md.h.saved", { name: s.name })),
                    onClose(),
                    onSaved(s.id)
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

function BinDialog({
  storeId,
  bin,
  taken,
  onClose,
}: {
  storeId: string;
  bin?: MdBin;
  taken: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveBin();
  const [f, setF] = React.useState({ code: bin?.code ?? "", tag: bin?.tag ?? "" });
  const [reason, setReason] = React.useState("");
  const clash = taken.some(
    (c) => c !== bin?.code && c.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = f.code.trim() && !clash && (!bin || reason.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {bin ? t("md.assets.editTitle", { tag: bin.code }) : t("md.st.addBin")}
          </DialogTitle>
          <DialogDescription>{t("md.st.binHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.st.bin")}</Label>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="A-01-02"
            />
            {clash ? (
              <p className="text-[12px] text-muted-foreground">{t("md.c.codeTaken")}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.st.tag")}</Label>
            <Input
              className="font-mono"
              value={f.tag}
              onChange={(e) => setF({ ...f, tag: e.target.value })}
            />
          </div>
        </div>
        {bin ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: bin?.id,
                  reason: reason.trim() || undefined,
                  storeId,
                  code: f.code.trim(),
                  tag: f.tag.trim(),
                },
                {
                  onSuccess: (b) => (toast.success(t("md.h.saved", { name: b.code })), onClose()),
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

function RetireDialog({
  what,
  id,
  name,
  onClose,
}: {
  what: "stores" | "bins" | "failure-codes";
  id: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const retire = useRetireRecord();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.h.offTitle", { name })}</DialogTitle>
          <DialogDescription>{t("md.st.offHint")}</DialogDescription>
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
                { kind: what, id, reason: reason.trim() },
                {
                  onSuccess: () => (toast.success(t("md.h.offDone", { name })), onClose()),
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

export { RetireDialog, StoresPage };
