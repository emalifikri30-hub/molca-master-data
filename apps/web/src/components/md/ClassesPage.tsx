import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  useRegistry,
  useRetire,
  useSaveClass,
  useSaveType,
  type AssetClass,
  type AssetType,
  type Registry,
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageTitle } from "@/components/shell/page-header";
import { ReasonField } from "@/components/md/ReasonField";
import { StatStrip } from "@/components/molca/stat-strip";

// Asset classes and types: what kind of machine an asset is (class: mixer, oven…) and its make and model (type).
// Classes on the left with how many types and assets use them, the selected class's types on the right — add,
// edit and retire in place. Retired records stop from today and keep their history.

type Form =
  | { kind: "class"; record?: AssetClass }
  | { kind: "type"; record?: AssetType; classId: string }
  | {
      kind: "retire";
      what: "asset-classes" | "asset-types";
      id: string;
      name: string;
      inUse: number;
    };

function ClassesPage() {
  const { t } = useTranslation();
  const { data: reg, isPending } = useRegistry();
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState<string>();
  const [form, setForm] = React.useState<Form | null>(null);

  const typesOf = (classId: string) => (reg?.types ?? []).filter((x) => x.assetClassId === classId);
  const assetsOfType = (typeId: string) =>
    (reg?.assets ?? []).filter((a) => a.assetTypeId === typeId).length;
  const assetsOfClass = (classId: string) =>
    typesOf(classId).reduce((n, x) => n + assetsOfType(x.id), 0);
  const classes = (reg?.classes ?? [])
    .filter((c) => !query || `${c.code} ${c.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = reg?.classes.find((c) => c.id === sel) ?? classes[0];
  const untyped = (reg?.assets ?? []).filter((a) => !a.assetTypeId).length;
  const unused = (reg?.types ?? []).filter((x) => !assetsOfType(x.id)).length;
  const strip: [string, number, string | undefined][] = [
    [t("md.home.classes"), reg?.classes.length ?? 0, undefined],
    [t("md.assets.s.types"), reg?.types.length ?? 0, undefined],
    [t("md.c.unused"), unused, undefined],
    [t("md.c.untyped"), untyped, "var(--sys-orange)"],
  ];

  return (
    <>
      <PageTitle
        title={t("md.nav.classes")}
        subtitle={t("md.c.subtitle")}
        crumbs={current ? [t("md.nav.classes"), current.name] : [t("md.nav.classes")]}
        actions={
          <Button size="sm" onClick={() => setForm({ kind: "class" })}>
            <PlusIcon /> {t("md.c.addClass")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-4"
          cells={strip.map(([label, value, tone]) => ({ label, value, tone }))}
        />
        <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <Card className="gap-3 self-start px-3 py-3 @3xl/shell:sticky @3xl/shell:top-16 @3xl/shell:max-h-[calc(100dvh-5rem)]">
            <InputGroup className="h-8">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("md.c.filter")}
                aria-label={t("md.c.filter")}
              />
            </InputGroup>
            {isPending ? (
              <Skeleton className="h-64" />
            ) : (
              <ul className="-mx-1 min-h-0 overflow-y-auto px-1 @3xl/shell:flex-1">
                {classes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSel(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-subtle",
                        current?.id === c.id && "bg-subtle font-medium",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="font-mono text-[11.5px] text-muted-foreground">
                        {c.code}
                      </span>
                      <span className="w-14 text-right text-[11.5px] text-muted-foreground tabular-nums">
                        {typesOf(c.id).length} · {assetsOfClass(c.id)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {reg && current ? (
            <Card>
              <CardHeader>
                <div className="font-mono text-[12px] text-muted-foreground">{current.code}</div>
                <CardTitle className="text-[17px]">{current.name}</CardTitle>
                <CardDescription>
                  {t("md.c.classHint", {
                    types: typesOf(current.id).length,
                    assets: assetsOfClass(current.id),
                  })}
                </CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" onClick={() => setForm({ kind: "type", classId: current.id })}>
                    <PlusIcon /> {t("md.c.addType")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setForm({ kind: "class", record: current })}
                  >
                    <PencilIcon /> {t("md.assets.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        kind: "retire",
                        what: "asset-classes",
                        id: current.id,
                        name: current.name,
                        inUse: assetsOfClass(current.id),
                      })
                    }
                  >
                    <BanIcon /> {t("md.c.retire")}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">{t("md.h.code")}</TableHead>
                      <TableHead>{t("md.f.name")}</TableHead>
                      <TableHead>{t("md.f.maker")}</TableHead>
                      <TableHead className="text-right">{t("md.assets.s.total")}</TableHead>
                      <TableHead className="w-24 pr-6" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typesOf(current.id).length ? (
                      typesOf(current.id).map((x) => (
                        <TableRow key={x.id}>
                          <TableCell className="pl-6 font-mono text-[12.5px]">{x.code}</TableCell>
                          <TableCell>{x.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {[x.manufacturer, x.model].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {assetsOfType(x.id)}
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("md.assets.edit")}
                              onClick={() =>
                                setForm({ kind: "type", record: x, classId: current.id })
                              }
                            >
                              <PencilIcon />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("md.c.retire")}
                              onClick={() =>
                                setForm({
                                  kind: "retire",
                                  what: "asset-types",
                                  id: x.id,
                                  name: x.name,
                                  inUse: assetsOfType(x.id),
                                })
                              }
                            >
                              <BanIcon />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          {t("md.c.noTypes")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      {reg && form?.kind === "class" ? (
        <ClassDialog
          reg={reg}
          record={form.record}
          onClose={() => setForm(null)}
          onSaved={setSel}
        />
      ) : null}
      {reg && form?.kind === "type" ? (
        <TypeDialog
          reg={reg}
          record={form.record}
          classId={form.classId}
          onClose={() => setForm(null)}
        />
      ) : null}
      {form?.kind === "retire" ? <RetireDialog {...form} onClose={() => setForm(null)} /> : null}
    </>
  );
}

const CODE = /^[A-Za-z0-9_-]+$/;

function ClassDialog({
  reg,
  record,
  onClose,
  onSaved,
}: {
  reg: Registry;
  record?: AssetClass;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveClass();
  const [f, setF] = React.useState({
    code: record?.code ?? "",
    name: record?.name ?? "",
    parentClassId: record?.parentClassId ?? "",
  });
  const [reason, setReason] = React.useState("");
  const taken = reg.classes.some(
    (c) => c.id !== record?.id && c.code.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = CODE.test(f.code) && !taken && f.name.trim() && (!record || reason.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {record ? t("md.assets.editTitle", { tag: record.name }) : t("md.c.addClass")}
          </DialogTitle>
          <DialogDescription>{t("md.c.classForm")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("md.h.code")}
            hint={
              taken
                ? t("md.c.codeTaken")
                : f.code && !CODE.test(f.code)
                  ? t("md.h.codeRule")
                  : undefined
            }
          >
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
            />
          </Field>
          <Field label={t("md.f.name")}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("md.c.parent")} wide>
            <NativeSelect
              value={f.parentClassId}
              onChange={(e) => setF({ ...f, parentClassId: e.target.value })}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {reg.classes
                .filter((c) => c.id !== record?.id)
                .map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
        </div>
        {record ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: record?.id,
                  reason: reason.trim() || undefined,
                  code: f.code.trim(),
                  name: f.name.trim(),
                  parentClassId: f.parentClassId,
                },
                {
                  onSuccess: (c) => (
                    toast.success(t("md.h.saved", { name: c.name })),
                    onClose(),
                    onSaved(c.id)
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

function TypeDialog({
  reg,
  record,
  classId,
  onClose,
}: {
  reg: Registry;
  record?: AssetType;
  classId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveType();
  const [f, setF] = React.useState({
    assetClassId: record?.assetClassId ?? classId,
    code: record?.code ?? "",
    name: record?.name ?? "",
    manufacturer: record?.manufacturer ?? "",
    model: record?.model ?? "",
  });
  const [reason, setReason] = React.useState("");
  const taken = reg.types.some(
    (x) => x.id !== record?.id && x.code.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = CODE.test(f.code) && !taken && f.name.trim() && (!record || reason.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {record ? t("md.assets.editTitle", { tag: record.name }) : t("md.c.addType")}
          </DialogTitle>
          <DialogDescription>{t("md.c.typeForm")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("md.h.code")}
            hint={
              taken
                ? t("md.c.codeTaken")
                : f.code && !CODE.test(f.code)
                  ? t("md.h.codeRule")
                  : undefined
            }
          >
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
            />
          </Field>
          <Field label={t("md.f.name")}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("md.c.maker")}>
            <Input
              value={f.manufacturer}
              onChange={(e) => setF({ ...f, manufacturer: e.target.value })}
            />
          </Field>
          <Field label={t("md.c.model")}>
            <Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
          </Field>
          <Field label={t("md.f.class")} wide>
            <NativeSelect
              value={f.assetClassId}
              onChange={(e) => setF({ ...f, assetClassId: e.target.value })}
            >
              {reg.classes.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {record ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: record?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  name: f.name.trim(),
                },
                {
                  onSuccess: (x) => (toast.success(t("md.h.saved", { name: x.name })), onClose()),
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
  inUse,
  onClose,
}: {
  what: "asset-classes" | "asset-types";
  id: string;
  name: string;
  inUse: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const retire = useRetire();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.c.retireTitle", { name })}</DialogTitle>
          <DialogDescription>
            {inUse ? t("md.c.retireInUse", { n: inUse }) : t("md.c.retireHint")}
          </DialogDescription>
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
                  onSuccess: () => (toast.success(t("md.c.retired", { name })), onClose()),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t("md.c.retire")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      <Label className="text-[12.5px]">{label}</Label>
      {children}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export { ClassesPage };
