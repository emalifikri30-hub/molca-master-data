import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, CrownIcon, PencilIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  useCrews,
  useRetireCrew,
  useSaveCrew,
  type Crew,
  type CrewInput,
  type Person,
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
import { ReasonField } from "@/components/md/ReasonField";

// Crews (regu): people who work together on a site and shift under a leader. List left, the selected crew right
// with its members, their craft and the crew's labour cost per hour; add, edit and deactivate in place.

const rp = (v: number) => `Rp ${v.toLocaleString("id-ID")}`;

function CrewsPanel({
  people,
  sites,
  adding,
  onAdded,
}: {
  people: Person[];
  sites: Map<string, string>;
  adding: boolean;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const { data: crews, isPending } = useCrews();
  const [sel, setSel] = React.useState<string>();
  const [form, setForm] = React.useState<
    { mode: "new" } | { mode: "edit"; crew: Crew } | { mode: "off"; crew: Crew } | null
  >(null);
  React.useEffect(() => {
    if (adding) setForm({ mode: "new" });
  }, [adding]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const current = crews?.find((c) => c.id === sel) ?? crews?.[0];
  const members = current
    ? current.memberIds.map((id) => byId.get(id)).filter((p): p is Person => !!p)
    : [];
  const perHour = members.reduce((s, p) => s + Number(p.hourlyRate ?? 0), 0);
  const close = () => {
    setForm(null);
    onAdded();
  };

  return (
    <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <Card className="gap-1 self-start px-3 py-3">
        {isPending ? (
          <Skeleton className="h-40" />
        ) : crews?.length ? (
          <ul>
            {crews.map((c) => (
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
                  <span className="text-[11.5px] text-muted-foreground tabular-nums">
                    {t("md.p.members", { n: c.memberIds.length })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("md.cr.empty")}</p>
        )}
      </Card>
      {current ? (
        <Card>
          <CardHeader>
            <div className="font-mono text-[12px] text-muted-foreground">{current.code}</div>
            <CardTitle className="text-[17px]">{current.name}</CardTitle>
            <CardDescription>
              {[
                sites.get(current.siteId),
                current.shift ? t("md.p.shiftN", { n: current.shift }) : t("md.p.dayShift"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
            <CardAction className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForm({ mode: "edit", crew: current })}
              >
                <PencilIcon /> {t("md.assets.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setForm({ mode: "off", crew: current })}
              >
                <BanIcon /> {t("md.h.deactivate")}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 px-0">
            <dl className="grid grid-cols-3 gap-x-4 px-6 text-[13px]">
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("md.cr.leader")}</dt>
                <dd>{byId.get(current.leaderId)?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("md.p.s.people")}</dt>
                <dd className="tabular-nums">{members.length}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("md.cr.perHour")}</dt>
                <dd className="tabular-nums">{rp(perHour)}</dd>
              </div>
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{t("md.f.name")}</TableHead>
                  <TableHead>{t("md.p.craftLabel")}</TableHead>
                  <TableHead>{t("md.p.skills")}</TableHead>
                  <TableHead className="pr-6 text-right">{t("md.p.rate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <span className="inline-flex items-center gap-1.5">
                        {p.id === current.leaderId ? (
                          <CrownIcon
                            className="size-3.5 text-[var(--sys-orange)]"
                            aria-label={t("md.cr.leader")}
                          />
                        ) : null}
                        {p.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t(`md.p.craft.${p.craft || "lain"}`, { defaultValue: p.craft })}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {p.skills.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {p.hourlyRate ? rp(Number(p.hourlyRate)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {form?.mode === "off" ? (
        <RetireCrew crew={form.crew} onClose={close} />
      ) : form ? (
        <CrewDialog
          crew={form.mode === "edit" ? form.crew : undefined}
          people={people}
          sites={sites}
          taken={(crews ?? []).map((c) => c.code)}
          onClose={close}
          onSaved={setSel}
        />
      ) : null}
    </div>
  );
}

function CrewDialog({
  crew,
  people,
  sites,
  taken,
  onClose,
  onSaved,
}: {
  crew?: Crew;
  people: Person[];
  sites: Map<string, string>;
  taken: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveCrew();
  const [f, setF] = React.useState<CrewInput>({
    code: crew?.code ?? "",
    name: crew?.name ?? "",
    siteId: crew?.siteId ?? [...sites.keys()][0] ?? "",
    shift: crew?.shift ?? "",
    leaderId: crew?.leaderId ?? "",
    memberIds: crew?.memberIds ?? [],
  });
  const [reason, setReason] = React.useState("");
  const codeTaken = taken.some(
    (c) => c !== crew?.code && c.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = f.code.trim() && f.name.trim() && !codeTaken && (!crew || reason.trim());
  const toggle = (id: string) =>
    setF({
      ...f,
      memberIds: f.memberIds.includes(id)
        ? f.memberIds.filter((x) => x !== id)
        : [...f.memberIds, id],
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {crew ? t("md.assets.editTitle", { tag: crew.name }) : t("md.cr.add")}
          </DialogTitle>
          <DialogDescription>{t("md.cr.formHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.h.code")}</Label>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="REG-S1"
            />
            {codeTaken ? (
              <p className="text-[12px] text-muted-foreground">{t("md.c.codeTaken")}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.f.name")}</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.p.shift")}</Label>
            <NativeSelect value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
              <NativeSelectOption value="">{t("md.p.dayShift")}</NativeSelectOption>
              {["1", "2", "3"].map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {t("md.p.shiftN", { n })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.cr.leader")}</Label>
            <NativeSelect
              value={f.leaderId}
              onChange={(e) =>
                setF({
                  ...f,
                  leaderId: e.target.value,
                  memberIds:
                    e.target.value && !f.memberIds.includes(e.target.value)
                      ? [...f.memberIds, e.target.value]
                      : f.memberIds,
                })
              }
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {people.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-[12.5px]">
              {t("md.cr.membersLabel", { n: f.memberIds.length })}
            </Label>
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
              {people.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-subtle"
                >
                  <Checkbox
                    checked={f.memberIds.includes(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {p.shift ? t("md.p.shiftN", { n: p.shift }) : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {crew ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: crew?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  name: f.name.trim(),
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

function RetireCrew({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const { t } = useTranslation();
  const retire = useRetireCrew();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.h.offTitle", { name: crew.name })}</DialogTitle>
          <DialogDescription>{t("md.cr.offHint")}</DialogDescription>
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
                { id: crew.id, reason: reason.trim() },
                {
                  onSuccess: () => (
                    toast.success(t("md.h.offDone", { name: crew.name })),
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

export { CrewsPanel };
