import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, PencilIcon, PlusIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useFailureCodes, useSaveFailureCode, type FailureCode } from "@/lib/md";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/molca/stat-strip";
import { PageTitle } from "@/components/shell/page-header";
import { ReasonField } from "@/components/md/ReasonField";
import { RetireDialog } from "@/components/md/StoresPage";

// Failure codes (ISO 14224 Table B.6 style): the modes, mechanisms and causes technicians code a failure with, per
// equipment class, plus the plant's own. Classes on the left, the selected class's three code lists side by side.

const KINDS = ["mode", "mechanism", "cause"] as const;
type Form =
  | { kind: "code"; cls: string; code?: FailureCode; defaultKind?: FailureCode["kind"] }
  | { kind: "off"; code: FailureCode };

function FailureCodesPage() {
  const { t, i18n } = useTranslation();
  const { data: codes, isPending } = useFailureCodes();
  const [sel, setSel] = React.useState<string>();
  const [form, setForm] = React.useState<Form | null>(null);
  const all = codes ?? [];
  const classes = [...new Set(all.map((c) => c.iso14224Class))].sort();
  const current = sel ?? classes[0];
  const label = (c: FailureCode) => (i18n.language === "en" ? c.labelEn : c.labelId);
  const count = (cls: string, k?: FailureCode["kind"]) =>
    all.filter((c) => c.iso14224Class === cls && (!k || c.kind === k)).length;
  const incomplete = classes.filter((cls) => KINDS.some((k) => !count(cls, k)));

  return (
    <>
      <PageTitle
        title={t("md.fc.title")}
        subtitle={t("md.fc.subtitle")}
        crumbs={current ? [t("md.fc.title"), current] : [t("md.fc.title")]}
        actions={
          <Button size="sm" onClick={() => setForm({ kind: "code", cls: current ?? "" })}>
            <PlusIcon /> {t("md.fc.add")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-5"
          cells={[
            { label: t("md.fc.s.classes"), value: classes.length, sub: t("md.fc.s.classesSub") },
            ...KINDS.map((k) => ({
              label: t(`md.fc.kind.${k}`),
              value: all.filter((c) => c.kind === k).length,
              sub: t(`md.fc.kindSub.${k}`),
            })),
            {
              label: t("md.fc.s.incomplete"),
              value: incomplete.length,
              sub: t("md.fc.s.incompleteSub"),
              status: incomplete.length ? ("warn" as const) : ("ok" as const),
            },
          ]}
        />
        <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <Card className="gap-1 self-start px-3 py-3">
            {isPending ? (
              <Skeleton className="h-48" />
            ) : (
              <ul>
                {classes.map((cls) => (
                  <li key={cls}>
                    <button
                      type="button"
                      onClick={() => setSel(cls)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-subtle",
                        current === cls && "bg-subtle font-medium",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{cls}</span>
                      {incomplete.includes(cls) ? (
                        <span
                          aria-label={t("md.fc.s.incomplete")}
                          className="size-1.5 rounded-full bg-[var(--sys-orange)]"
                        />
                      ) : null}
                      <span className="text-[11.5px] text-muted-foreground tabular-nums">
                        {KINDS.map((k) => count(cls, k)).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {current ? (
            <div className="grid content-start gap-3 lg:grid-cols-3">
              {KINDS.map((k) => {
                const rows = all
                  .filter((c) => c.iso14224Class === current && c.kind === k)
                  .sort((a, b) => a.code.localeCompare(b.code));
                return (
                  <Card key={k} className="gap-2">
                    <CardHeader>
                      <CardTitle>{t(`md.fc.kind.${k}`)}</CardTitle>
                      <CardDescription>{t(`md.fc.kindSub.${k}`)}</CardDescription>
                      <CardAction>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("md.fc.add")}
                          onClick={() => setForm({ kind: "code", cls: current, defaultKind: k })}
                        >
                          <PlusIcon />
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="px-3">
                      {rows.length ? (
                        <ul className="divide-y">
                          {rows.map((c) => (
                            <li
                              key={c.id}
                              className="group flex items-start gap-2 px-1 py-1.5 text-[13px]"
                            >
                              <span className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground">
                                {c.code}
                              </span>
                              <span className="min-w-0 flex-1">
                                {label(c)}
                                {c.custom ? (
                                  <Badge variant="secondary" className="ml-1.5 align-middle">
                                    {t("md.fc.custom")}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="flex shrink-0 opacity-0 group-hover:opacity-100">
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("md.assets.edit")}
                                  onClick={() => setForm({ kind: "code", cls: current, code: c })}
                                >
                                  <PencilIcon />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("md.h.deactivate")}
                                  onClick={() => setForm({ kind: "off", code: c })}
                                >
                                  <BanIcon />
                                </Button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-lg border border-dashed px-3 py-3 text-[12.5px] text-muted-foreground">
                          {t("md.fc.none")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("md.fc.note")}</p>
      </div>
      {form?.kind === "code" ? (
        <CodeDialog
          cls={form.cls}
          code={form.code}
          defaultKind={form.defaultKind}
          classes={classes}
          onClose={() => setForm(null)}
          onSaved={setSel}
        />
      ) : form?.kind === "off" ? (
        <RetireDialog
          what="failure-codes"
          id={form.code.id}
          name={`${form.code.code} · ${label(form.code)}`}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}

function CodeDialog({
  cls,
  code,
  defaultKind,
  classes,
  onClose,
  onSaved,
}: {
  cls: string;
  code?: FailureCode;
  defaultKind?: FailureCode["kind"];
  classes: string[];
  onClose: () => void;
  onSaved: (cls: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveFailureCode();
  const [f, setF] = React.useState({
    iso14224Class: code?.iso14224Class ?? cls,
    kind: code?.kind ?? defaultKind ?? ("mode" as FailureCode["kind"]),
    code: code?.code ?? "",
    labelId: code?.labelId ?? "",
    labelEn: code?.labelEn ?? "",
    custom: code?.custom ?? true,
  });
  const [reason, setReason] = React.useState("");
  const ready =
    f.iso14224Class.trim() &&
    f.code.trim() &&
    f.labelId.trim() &&
    f.labelEn.trim() &&
    (!code || reason.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {code ? t("md.assets.editTitle", { tag: code.code }) : t("md.fc.add")}
          </DialogTitle>
          <DialogDescription>{t("md.fc.formHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.fc.class")}</Label>
            <Input
              list="md-fc-classes"
              className="font-mono"
              value={f.iso14224Class}
              onChange={(e) => setF({ ...f, iso14224Class: e.target.value.toUpperCase() })}
            />
            <datalist id="md-fc-classes">
              {classes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.fc.kindLabel")}</Label>
            <NativeSelect
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value as FailureCode["kind"] })}
            >
              {KINDS.map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {t(`md.fc.kind.${k}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.h.code")}</Label>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
              placeholder="BRD"
            />
          </div>
          <div />
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.fc.labelId")}</Label>
            <Input value={f.labelId} onChange={(e) => setF({ ...f, labelId: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.fc.labelEn")}</Label>
            <Input value={f.labelEn} onChange={(e) => setF({ ...f, labelEn: e.target.value })} />
          </div>
        </div>
        {code ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: code?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  iso14224Class: f.iso14224Class.trim(),
                },
                {
                  onSuccess: () => (
                    toast.success(t("md.h.saved", { name: f.code })),
                    onClose(),
                    onSaved(f.iso14224Class.trim())
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

export { FailureCodesPage };
