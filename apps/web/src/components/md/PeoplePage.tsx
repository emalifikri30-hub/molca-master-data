import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BanIcon, PencilIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  CRAFTS,
  usePeople,
  useRegistry,
  useRetirePerson,
  useSavePerson,
  type Person,
  type PersonInput,
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
import { PageTitle } from "@/components/shell/page-header";
import { ReasonField } from "@/components/md/ReasonField";
import { CrewsPanel } from "@/components/md/CrewsPanel";
import { useCrews } from "@/lib/md";
import { StatStrip } from "@/components/molca/stat-strip";

// People & skills: who does the work — craft, skills, shift and the internal hourly rate. Maintenance syncs its
// crew from here and costs labour at the rate; the scheduler reads craft, skills and shift. List left (grouped
// by craft), the selected person right, edit and deactivate in place.

const rp = (v: string | number | null) =>
  v == null || v === "" ? "—" : `Rp ${Number(v).toLocaleString("id-ID")}`;

function PeoplePage() {
  const { t } = useTranslation();
  const { data: people, isPending } = usePeople();
  const { data: reg } = useRegistry();
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"people" | "crews">("people");
  const [addCrew, setAddCrew] = React.useState(false);
  const { data: crews } = useCrews();
  const [sel, setSel] = React.useState<string>();
  const [form, setForm] = React.useState<
    { mode: "new" } | { mode: "edit"; person: Person } | { mode: "off"; person: Person } | null
  >(null);
  const list = (people ?? [])
    .filter(
      (p) =>
        !query ||
        `${p.code} ${p.name} ${p.craft} ${p.skills.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.craft.localeCompare(b.craft) || a.name.localeCompare(b.name));
  const current = people?.find((p) => p.id === sel) ?? list[0];
  const sites = React.useMemo(() => {
    const out = new Map<string, string>();
    const walk = (n: NonNullable<typeof reg>["tree"]["root"]) => {
      if (n.level === "site") out.set(n.id, n.name);
      n.children.forEach(walk);
    };
    if (reg) walk(reg.tree.root);
    return out;
  }, [reg]);
  const crafts = [...new Set((people ?? []).map((p) => p.craft || "lain"))];
  const strip: [string, number, string | undefined][] = [
    [t("md.p.s.people"), people?.length ?? 0, undefined],
    ...crafts
      .slice(0, 4)
      .map(
        (c) =>
          [
            t(`md.p.craft.${c}`, { defaultValue: c }),
            (people ?? []).filter((p) => (p.craft || "lain") === c).length,
            undefined,
          ] as [string, number, undefined],
      ),
    [
      t("md.p.s.noRate"),
      (people ?? []).filter((p) => p.hourlyRate == null || Number(p.hourlyRate) === 0).length,
      "var(--sys-orange)",
    ],
    [t("md.p.s.noLogin"), (people ?? []).filter((p) => !p.username).length, undefined],
  ];

  return (
    <>
      <PageTitle
        title={t("md.nav.people")}
        subtitle={t("md.p.subtitle")}
        crumbs={current ? [t("md.nav.people"), current.name] : [t("md.nav.people")]}
        actions={
          <Button
            size="sm"
            onClick={() => (tab === "people" ? setForm({ mode: "new" }) : setAddCrew(true))}
          >
            <PlusIcon /> {tab === "people" ? t("md.p.add") : t("md.cr.add")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-4 xl:grid-cols-7"
          cells={strip.map(([label, value, tone]) => ({ label, value, tone }))}
        />
        <div
          className="inline-flex w-fit rounded-lg border bg-card p-0.5 text-[13px]"
          role="tablist"
        >
          {(["people", "crews"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-3 py-1",
                tab === k ? "bg-subtle font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "people"
                ? t("md.p.tabPeople", { n: people?.length ?? 0 })
                : t("md.p.tabCrews", { n: crews?.length ?? 0 })}
            </button>
          ))}
        </div>
        {tab === "crews" ? (
          <CrewsPanel
            people={people ?? []}
            sites={sites}
            adding={addCrew}
            onAdded={() => setAddCrew(false)}
          />
        ) : (
          <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
            <Card className="gap-3 self-start px-3 py-3 @3xl/shell:sticky @3xl/shell:top-16 @3xl/shell:max-h-[calc(100dvh-5rem)]">
              <InputGroup className="h-8">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("md.p.filter")}
                  aria-label={t("md.p.filter")}
                />
              </InputGroup>
              {isPending ? (
                <Skeleton className="h-64" />
              ) : list.length ? (
                <ul className="-mx-1 min-h-0 overflow-y-auto px-1 @3xl/shell:flex-1">
                  {list.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i === 0 || list[i - 1]!.craft !== p.craft ? (
                        <li className="px-2 pt-2 pb-1 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                          {t(`md.p.craft.${p.craft || "lain"}`, { defaultValue: p.craft })}
                        </li>
                      ) : null}
                      <li>
                        <button
                          type="button"
                          onClick={() => setSel(p.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-subtle",
                            current?.id === p.id && "bg-subtle font-medium",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="text-[11.5px] text-muted-foreground">
                            {p.shift ? t("md.p.shiftN", { n: p.shift }) : ""}
                          </span>
                        </button>
                      </li>
                    </React.Fragment>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {t("md.p.empty")}
                </p>
              )}
            </Card>
            {current ? (
              <Card>
                <CardHeader>
                  <div className="font-mono text-[12px] text-muted-foreground">{current.code}</div>
                  <CardTitle className="text-[17px]">{current.name}</CardTitle>
                  <CardDescription>
                    {t(`md.p.craft.${current.craft || "lain"}`, { defaultValue: current.craft })}
                    {current.siteId ? ` · ${sites.get(current.siteId) ?? ""}` : ""}
                  </CardDescription>
                  <CardAction className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setForm({ mode: "edit", person: current })}
                    >
                      <PencilIcon /> {t("md.assets.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ mode: "off", person: current })}
                    >
                      <BanIcon /> {t("md.h.deactivate")}
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <dl className="grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-4">
                    {(
                      [
                        [t("md.p.rate"), rp(current.hourlyRate)],
                        [
                          t("md.p.shift"),
                          current.shift
                            ? t("md.p.shiftN", { n: current.shift })
                            : t("md.p.dayShift"),
                        ],
                        [t("md.p.username"), current.username || "—"],
                        [t("md.p.phone"), current.phone || "—"],
                        [t("md.p.since"), current.validFrom],
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <div
                        key={k}
                        className="-mr-px -mb-px min-w-0 border-r border-b px-3.5 py-2.5"
                      >
                        <dt className="truncate text-[12px] text-muted-foreground">{k}</dt>
                        <dd className="mt-0.5 truncate text-[14px] font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <div className="mb-1.5 text-[12px] text-muted-foreground">
                      {t("md.p.skills")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {current.skills.length ? (
                        current.skills.map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[13px]">—</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{t("md.p.readers")}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
      {form?.mode === "off" ? (
        <RetirePersonDialog person={form.person} onClose={() => setForm(null)} />
      ) : form ? (
        <PersonDialog
          person={form.mode === "edit" ? form.person : undefined}
          sites={sites}
          taken={(people ?? []).map((p) => p.code)}
          onClose={() => setForm(null)}
          onSaved={setSel}
        />
      ) : null}
    </>
  );
}

function PersonDialog({
  person,
  sites,
  taken,
  onClose,
  onSaved,
}: {
  person?: Person;
  sites: Map<string, string>;
  taken: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSavePerson();
  const [f, setF] = React.useState<PersonInput>({
    code: person?.code ?? "",
    name: person?.name ?? "",
    username: person?.username ?? "",
    craft: person?.craft ?? "mekanik",
    skills: person?.skills ?? [],
    siteId: person?.siteId ?? [...sites.keys()][0] ?? "",
    shift: person?.shift ?? "",
    hourlyRate: person?.hourlyRate == null ? null : Number(person.hourlyRate),
    phone: person?.phone ?? "",
  });
  const [skill, setSkill] = React.useState("");
  const [reason, setReason] = React.useState("");
  const codeTaken = taken.some(
    (c) => c !== person?.code && c.toLowerCase() === f.code.trim().toLowerCase(),
  );
  const ready = f.code.trim() && f.name.trim() && !codeTaken && (!person || reason.trim());
  const addSkill = () => {
    const s = skill.trim();
    if (s && !f.skills.includes(s)) setF({ ...f, skills: [...f.skills, s] });
    setSkill("");
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {person ? t("md.assets.editTitle", { tag: person.name }) : t("md.p.add")}
          </DialogTitle>
          <DialogDescription>{t("md.p.formHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("md.p.code")} hint={codeTaken ? t("md.c.codeTaken") : undefined}>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="SBC-0101"
            />
          </Field>
          <Field label={t("md.f.name")}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("md.p.craftLabel")}>
            <NativeSelect value={f.craft} onChange={(e) => setF({ ...f, craft: e.target.value })}>
              {CRAFTS.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {t(`md.p.craft.${c}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.p.shift")}>
            <NativeSelect value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
              <NativeSelectOption value="">{t("md.p.dayShift")}</NativeSelectOption>
              {["1", "2", "3"].map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {t("md.p.shiftN", { n })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.p.rate")} hint={t("md.p.rateHint")}>
            <Input
              inputMode="numeric"
              value={f.hourlyRate ?? ""}
              onChange={(e) =>
                setF({
                  ...f,
                  hourlyRate:
                    e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")),
                })
              }
            />
          </Field>
          <Field label={t("md.p.site")}>
            <NativeSelect value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
              {[...sites].map(([id, name]) => (
                <NativeSelectOption key={id} value={id}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.p.username")} hint={t("md.p.usernameHint")}>
            <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </Field>
          <Field label={t("md.p.phone")}>
            <Input
              inputMode="tel"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
            />
          </Field>
          <Field label={t("md.p.skills")} wide>
            <div className="flex flex-wrap items-center gap-1.5">
              {f.skills.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1">
                  {s}
                  <button
                    type="button"
                    aria-label={`× ${s}`}
                    onClick={() => setF({ ...f, skills: f.skills.filter((x) => x !== s) })}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                className="h-8 w-48"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                onBlur={addSkill}
                placeholder={t("md.p.skillPlaceholder")}
              />
            </div>
          </Field>
        </div>
        {person ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: person?.id,
                  reason: reason.trim() || undefined,
                  ...f,
                  code: f.code.trim(),
                  name: f.name.trim(),
                },
                {
                  onSuccess: (p) => (
                    toast.success(t("md.h.saved", { name: p.name })),
                    onClose(),
                    onSaved(p.id)
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

function RetirePersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const { t } = useTranslation();
  const retire = useRetirePerson();
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.h.offTitle", { name: person.name })}</DialogTitle>
          <DialogDescription>{t("md.p.offHint")}</DialogDescription>
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
                { id: person.id, reason: reason.trim() },
                {
                  onSuccess: () => (
                    toast.success(t("md.h.offDone", { name: person.name })),
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

export { PeoplePage };
