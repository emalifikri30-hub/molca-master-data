import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoveRightIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  COMPONENT_LEVELS,
  LIFECYCLES,
  useCreateAsset,
  useMoveAsset,
  useRegistry,
  useUpdateAsset,
  type Asset,
  type AssetInput,
  type Registry,
} from "@/lib/md";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AssetTree, type AssetLevel, type AssetNode } from "@/components/molca/asset-tree";
import { PageTitle } from "@/components/shell/page-header";

import type { HierarchyNode } from "@/lib/types";

// Assets (Master Data): the site hierarchy with the assets placed on each work unit on the left, the selected
// asset on the right — register, edit and move in place. Assets not placed anywhere sit under their own node so
// none is lost. MAM and the other MolcaDx modules read these records; they never write them.

const LEVEL: Record<string, AssetLevel> = {
  enterprise: "enterprise",
  site: "site",
  area: "area",
  "work-center": "line",
  "work-unit": "cell",
};
const UNPLACED = "__unplaced";

function toTree(n: HierarchyNode, subs: Map<string, Asset[]>): AssetNode[] {
  if (n.level === "tenant" || n.level === "enterprise")
    return n.children.flatMap((c) => toTree(c, subs));
  const node = (
    id: string,
    name: string,
    tag: string,
    status: Asset["lifecycleStatus"],
  ): AssetNode => ({
    id,
    name,
    level: "equipment",
    status: status === "operational" ? "run" : status === "under_maintenance" ? "down" : "off",
    meta: tag,
    // sub-assets (subunit, maintainable item, part) sit under their parent, as ISO 14224 levels them
    children: (subs.get(id) ?? []).map((c) =>
      node(c.id, c.assetName || c.assetTag, c.assetTag, c.lifecycleStatus),
    ),
  });
  const assets = n.assets.map((a) => node(a.id, a.name || a.tag, a.tag, a.status));
  return [
    {
      id: n.id,
      name: n.name,
      level: LEVEL[n.level] ?? "area",
      children: [...n.children.flatMap((c) => toTree(c, subs)), ...assets],
    },
  ];
}

function AssetsRegistry({ selectedId }: { selectedId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: reg, isPending } = useRegistry();
  const [query, setQuery] = React.useState("");
  const [form, setForm] = React.useState<
    { mode: "new" } | { mode: "edit"; asset: Asset } | { mode: "move"; asset: Asset } | null
  >(() =>
    // ?new=1 opens the form at once (the Maintenance app's "Add asset" lands here)
    new URLSearchParams(window.location.search).has("new") ? { mode: "new" } : null,
  );
  // ?edit=1 on an asset opens its edit form once the records are in
  const editAsked = React.useRef(new URLSearchParams(window.location.search).has("edit"));

  const placedIds = React.useMemo(() => new Set(reg?.placements.map((p) => p.assetId)), [reg]);
  const byParent = React.useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of reg?.assets ?? [])
      if (a.parentAssetId) m.set(a.parentAssetId, [...(m.get(a.parentAssetId) ?? []), a]);
    return m;
  }, [reg]);
  // placed = on a work unit itself, or under a parent that is (sub-assets follow their parent)
  const located = React.useMemo(() => {
    const ok = new Set<string>();
    const mark = (id: string) => {
      ok.add(id);
      (byParent.get(id) ?? []).forEach((c) => mark(c.id));
    };
    placedIds.forEach(mark);
    return ok;
  }, [placedIds, byParent]);
  const unplaced = React.useMemo(
    () =>
      (reg?.assets ?? []).filter(
        (a) =>
          !located.has(a.id) &&
          !(
            a.parentAssetId &&
            byParent.has(a.parentAssetId) &&
            reg?.assets.some((p) => p.id === a.parentAssetId)
          ),
      ),
    [reg, located, byParent],
  );
  const nodes = React.useMemo(() => {
    if (!reg) return [];
    const base = toTree(reg.tree.root, byParent);
    if (!unplaced.length) return base;
    const node = (a: Asset): AssetNode => ({
      id: a.id,
      name: a.assetName || a.assetTag,
      level: "equipment",
      status: "off",
      meta: a.assetTag,
      children: (byParent.get(a.id) ?? []).map(node),
    });
    return [
      ...base,
      {
        id: UNPLACED,
        name: t("md.assets.unplaced"),
        level: "area" as AssetLevel,
        children: unplaced.map(node),
      },
    ];
  }, [reg, unplaced, byParent, t]);
  const byId = React.useMemo(() => new Map((reg?.assets ?? []).map((a) => [a.id, a])), [reg]);
  const selected =
    (selectedId && byId.get(selectedId)) || reg?.assets.find((a) => placedIds.has(a.id));
  React.useEffect(() => {
    if (!editAsked.current || !selected || selected.id !== selectedId) return;
    editAsked.current = false;
    setForm({ mode: "edit", asset: selected });
  }, [selected, selectedId]);

  const count = (s: Asset["lifecycleStatus"]) =>
    reg?.assets.filter((a) => a.lifecycleStatus === s).length ?? 0;
  const strip: [string, number, string | undefined][] = [
    [t("md.assets.s.total"), reg?.assets.length ?? 0, undefined],
    [t("md.assets.s.placed"), located.size, undefined],
    [t("md.assets.s.unplaced"), unplaced.length, "var(--sys-orange)"],
    [t("md.lifecycle.operational"), count("operational"), undefined],
    [t("md.lifecycle.under_maintenance"), count("under_maintenance"), "var(--sys-orange)"],
    [t("md.lifecycle.idle"), count("idle"), undefined],
    [t("md.lifecycle.decommissioned"), count("decommissioned"), "var(--muted-foreground)"],
    [t("md.assets.s.types"), reg?.types.length ?? 0, undefined],
  ];

  return (
    <>
      <PageTitle
        title={t("nav.assets")}
        subtitle={t("md.assets.subtitle", { tenant: reg?.tree.tenant.name ?? "" })}
        crumbs={selected ? [t("nav.assets"), selected.assetTag] : [t("nav.assets")]}
        actions={
          <Button size="sm" onClick={() => setForm({ mode: "new" })}>
            <PlusIcon /> {t("md.assets.add")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-4 xl:grid-cols-8">
          {strip.map(([k, v, c]) => (
            <div key={k} className="-mr-px -mb-px border-r border-b px-3.5 py-2.5">
              <div className="truncate text-[12px] text-muted-foreground">{k}</div>
              <div
                className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight tabular-nums"
                style={{ color: v ? c : "var(--muted-foreground)" }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 @3xl/shell:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
          <Card className="gap-3 self-start px-3 py-3 @3xl/shell:sticky @3xl/shell:top-16 @3xl/shell:max-h-[calc(100dvh-5rem)]">
            <InputGroup className="h-8">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("assets.filter")}
                aria-label={t("assets.filter")}
              />
            </InputGroup>
            {isPending ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="-mx-1 min-h-0 overflow-y-auto px-1 [scrollbar-gutter:stable] @3xl/shell:flex-1">
                <AssetTree
                  nodes={nodes}
                  label={t("md.assets.tree")}
                  query={query}
                  selectedId={selected?.id}
                  onSelect={(n) =>
                    byId.has(n.id) &&
                    void navigate({
                      to: "/assets/$assetId",
                      params: { assetId: n.id },
                      replace: true,
                    })
                  }
                  defaultExpanded={nodes.map((n) => n.id)}
                />
              </div>
            )}
          </Card>
          {reg && selected ? (
            <AssetDetail
              reg={reg}
              asset={selected}
              onEdit={() => setForm({ mode: "edit", asset: selected })}
              onMove={() => setForm({ mode: "move", asset: selected })}
            />
          ) : null}
        </div>
      </div>
      {reg && form?.mode === "move" ? (
        <MoveDialog reg={reg} asset={form.asset} onClose={() => setForm(null)} />
      ) : reg && form ? (
        <AssetDialog
          reg={reg}
          asset={form.mode === "edit" ? form.asset : undefined}
          onClose={() => setForm(null)}
          onCreated={(id) => void navigate({ to: "/assets/$assetId", params: { assetId: id } })}
        />
      ) : null}
    </>
  );
}

function AssetDetail({
  reg,
  asset,
  onEdit,
  onMove,
}: {
  reg: Registry;
  asset: Asset;
  onEdit: () => void;
  onMove: () => void;
}) {
  const { t } = useTranslation();
  const placement =
    reg.placements.find((p) => p.assetId === asset.id && p.placementRole === "primary") ??
    reg.placements.find((p) => p.assetId === asset.id);
  const type = reg.types.find((x) => x.id === asset.assetTypeId);
  const cls = type ? reg.classes.find((c) => c.id === type.assetClassId) : undefined;
  const parent = reg.assets.find((a) => a.id === asset.parentAssetId);
  const children = reg.assets.filter((a) => a.parentAssetId === asset.id);
  const facts: [string, string][] = (
    [
      [t("md.f.status"), t(`md.lifecycle.${asset.lifecycleStatus}`)],
      [t("md.f.level"), t(`md.level.${asset.componentLevel}`)],
      [t("md.f.type"), type ? `${type.name}` : ""],
      [t("md.f.class"), cls?.name ?? ""],
      [t("md.f.maker"), type ? [type.manufacturer, type.model].filter(Boolean).join(" · ") : ""],
      [t("md.f.serial"), asset.serialNumber],
      [t("md.f.commissioned"), asset.commissioningDate],
      [t("md.f.placedSince"), placement?.validFrom ?? ""],
      ...Object.entries(asset.attributes).map(
        ([k, v]) => [k.replace(/_/g, " "), v] as [string, string],
      ),
    ] as [string, string][]
  ).filter((f) => !!f[1]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[12px] text-muted-foreground">{asset.assetTag}</div>
              <CardTitle className="text-[17px]">{asset.assetName || asset.assetTag}</CardTitle>
              <CardDescription>
                {placement
                  ? (reg.paths.get(placement.workUnitId) ?? []).join(" › ")
                  : t("md.assets.unplaced")}
              </CardDescription>
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={onMove}>
                <MoveRightIcon /> {t("md.assets.move")}
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit}>
                <PencilIcon /> {t("md.assets.edit")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3 xl:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="truncate text-[12px] capitalize text-muted-foreground">{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="gap-2">
        <CardHeader>
          <CardTitle>{t("md.assets.structure")}</CardTitle>
          <CardDescription>{t("md.assets.structureHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <div className="text-[12px] text-muted-foreground">{t("md.f.parent")}</div>
            <div>{parent ? `${parent.assetTag} · ${parent.assetName}` : "—"}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted-foreground">
              {t("md.f.children", { n: children.length })}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {children.length ? (
                children.map((c) => (
                  <li key={c.id}>
                    {c.assetTag} · {c.assetName}{" "}
                    <span className="text-muted-foreground">
                      ({t(`md.level.${c.componentLevel}`)})
                    </span>
                  </li>
                ))
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
      <p className="text-[12px] text-muted-foreground">{t("md.assets.readers")}</p>
    </div>
  );
}

/** Work units as options, labelled with their path and whether they already hold a primary asset. */
function unitOptions(reg: Registry) {
  return [...reg.paths.entries()]
    .map(([id, path]) => ({
      id,
      label: path.join(" › "),
      taken: reg.placements.some((p) => p.workUnitId === id && p.placementRole === "primary"),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
/** A work unit holds one primary asset: the next one placed there is secondary. */
const roleFor = (reg: Registry, unit: string) =>
  reg.placements.some((p) => p.workUnitId === unit && p.placementRole === "primary")
    ? "secondary"
    : "primary";

function AssetDialog({
  reg,
  asset,
  onClose,
  onCreated,
}: {
  reg: Registry;
  asset?: Asset;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const [f, setF] = React.useState<AssetInput & { workUnitId: string }>({
    assetTag: asset?.assetTag ?? "",
    assetName: asset?.assetName ?? "",
    assetTypeId: asset?.assetTypeId ?? "",
    serialNumber: asset?.serialNumber ?? "",
    parentAssetId: asset?.parentAssetId ?? "",
    componentLevel: asset?.componentLevel ?? "equipment_unit",
    lifecycleStatus: asset?.lifecycleStatus ?? "operational",
    commissioningDate: asset?.commissioningDate ?? "",
    attributes: asset?.attributes ?? {},
    workUnitId: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const tagTaken =
    !asset && reg.assets.some((a) => a.assetTag.toLowerCase() === f.assetTag.trim().toLowerCase());
  const ready = f.assetTag.trim() && !tagTaken;
  const busy = create.isPending || update.isPending;
  const save = () => {
    const { workUnitId, ...input } = f;
    const done = { onError: (e: unknown) => toast.error(errorMessage(e)) };
    if (asset)
      update.mutate(
        { id: asset.id, ...input },
        {
          ...done,
          onSuccess: () => (toast.success(t("md.assets.saved", { tag: f.assetTag })), onClose()),
        },
      );
    else
      create.mutate(
        {
          ...input,
          workUnitId: workUnitId || undefined,
          role: workUnitId ? roleFor(reg, workUnitId) : undefined,
        },
        {
          ...done,
          onSuccess: (a) => (
            toast.success(t("md.assets.created", { tag: a.assetTag })),
            onClose(),
            onCreated(a.id)
          ),
        },
      );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {asset ? t("md.assets.editTitle", { tag: asset.assetTag }) : t("md.assets.add")}
          </DialogTitle>
          <DialogDescription>{t("md.assets.formHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("md.f.tag")} hint={tagTaken ? t("md.assets.tagTaken") : undefined}>
            <Input
              value={f.assetTag}
              onChange={(e) => set("assetTag", e.target.value)}
              placeholder="MIXHEC1A"
              className="font-mono"
            />
          </Field>
          <Field label={t("md.f.name")}>
            <Input value={f.assetName} onChange={(e) => set("assetName", e.target.value)} />
          </Field>
          <Field label={t("md.f.type")}>
            <NativeSelect
              value={f.assetTypeId}
              onChange={(e) => set("assetTypeId", e.target.value)}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {reg.types.map((x) => (
                <NativeSelectOption key={x.id} value={x.id}>
                  {x.code} · {x.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.f.level")}>
            <NativeSelect
              value={f.componentLevel}
              onChange={(e) =>
                set("componentLevel", e.target.value as AssetInput["componentLevel"])
              }
            >
              {COMPONENT_LEVELS.map((l) => (
                <NativeSelectOption key={l} value={l}>
                  {t(`md.level.${l}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.f.status")}>
            <NativeSelect
              value={f.lifecycleStatus}
              onChange={(e) =>
                set("lifecycleStatus", e.target.value as AssetInput["lifecycleStatus"])
              }
            >
              {LIFECYCLES.map((l) => (
                <NativeSelectOption key={l} value={l}>
                  {t(`md.lifecycle.${l}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.f.parent")}>
            <NativeSelect
              value={f.parentAssetId}
              onChange={(e) => set("parentAssetId", e.target.value)}
            >
              <NativeSelectOption value="">—</NativeSelectOption>
              {reg.assets
                .filter((a) => a.id !== asset?.id)
                .map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.assetTag} · {a.assetName}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <Field label={t("md.f.serial")}>
            <Input value={f.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
          </Field>
          <Field label={t("md.f.commissioned")}>
            <Input
              type="date"
              value={f.commissioningDate}
              onChange={(e) => set("commissioningDate", e.target.value)}
            />
          </Field>
          {!asset ? (
            <Field label={t("md.f.workUnit")} hint={t("md.assets.workUnitHint")} wide>
              <NativeSelect
                value={f.workUnitId}
                onChange={(e) => set("workUnitId", e.target.value)}
              >
                <NativeSelectOption value="">{t("md.assets.noPlacement")}</NativeSelectOption>
                {unitOptions(reg).map((u) => (
                  <NativeSelectOption key={u.id} value={u.id}>
                    {u.label}
                    {u.taken ? ` · ${t("md.assets.secondary")}` : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!ready || busy} onClick={save}>
            {asset ? t("common.save") : t("md.assets.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({ reg, asset, onClose }: { reg: Registry; asset: Asset; onClose: () => void }) {
  const { t } = useTranslation();
  const move = useMoveAsset();
  const current = reg.placements.find((p) => p.assetId === asset.id)?.workUnitId ?? "";
  const [unit, setUnit] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.assets.moveTitle", { tag: asset.assetTag })}</DialogTitle>
          <DialogDescription>{t("md.assets.moveHint")}</DialogDescription>
        </DialogHeader>
        <Field label={t("md.f.workUnit")}>
          <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)}>
            <NativeSelectOption value="">—</NativeSelectOption>
            {unitOptions(reg)
              .filter((u) => u.id !== current)
              .map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.label}
                  {u.taken ? ` · ${t("md.assets.secondary")}` : ""}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!unit || move.isPending}
            onClick={() =>
              move.mutate(
                { assetId: asset.id, workUnitId: unit, role: roleFor(reg, unit) },
                {
                  onSuccess: () => (
                    toast.success(t("md.assets.moved", { tag: asset.assetTag })),
                    onClose()
                  ),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t("md.assets.move")}
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

export { AssetsRegistry };
