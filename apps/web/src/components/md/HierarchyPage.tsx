import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BanIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { errorMessage } from "@/lib/api";
import {
  CHILD_LEVEL,
  WORK_CENTER_TYPES,
  useCreateNode,
  useDeactivateNode,
  useImpact,
  useNode,
  useRegistry,
  useUpdateNode,
  type Asset,
  type EditableLevel,
  type NodeInput,
  type WorkCenterType,
} from "@/lib/md";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ReasonField } from "@/components/md/ReasonField";
import { AssetDialog } from "@/components/md/AssetsRegistry";
import { StatusDot, Strip } from "@/components/md/parts";

import type { HierarchyNode } from "@/lib/types";

// Site hierarchy (ISA-95: enterprise › site › area › work center › work unit, then ISO 14224 below it: equipment
// unit › subunit › maintainable item › part): the structure every module places its records in. Left the tree, right the selected node — add a child, edit, or deactivate it in place. A node
// is never deleted: deactivating shows its impact first (sub-nodes, placed assets, open jobs) and stops it from a date.

const LEVEL: Record<string, AssetLevel> = {
  enterprise: "enterprise",
  site: "site",
  area: "area",
  "work-center": "line",
  "work-unit": "cell",
};
const LEVELS = ["enterprise", "site", "area", "work-center", "work-unit"] as const;
/** ISO 14224 below the work unit: equipment unit › subunit › maintainable item › part. */
const NEXT_ASSET_LEVEL: Partial<Record<Asset["componentLevel"], Asset["componentLevel"]>> = {
  equipment_unit: "subunit",
  subunit: "maintainable_item",
  maintainable_item: "part",
};

const ISO_LEVEL: Record<string, AssetLevel> = {
  equipment_unit: "equipment",
  subunit: "subunit",
  maintainable_item: "item",
  part: "part",
};
const assetStatus = (s: Asset["lifecycleStatus"]) =>
  (s === "operational" ? "run" : s === "under_maintenance" ? "down" : "off") as AssetNode["status"];

/** The ISA-95 hierarchy, continued below each work unit into its assets and their ISO 14224 sub-assets. */
function toTree(
  n: HierarchyNode,
  subs: Map<string, Asset[]>,
  byId: Map<string, Asset>,
): AssetNode[] {
  if (n.level === "tenant") return n.children.flatMap((c) => toTree(c, subs, byId));
  const count = (x: HierarchyNode): number =>
    x.assets.length + x.children.reduce((s, c) => s + count(c), 0);
  const asset = (a: Asset): AssetNode => ({
    id: a.id,
    name: a.assetName || a.assetTag,
    level: ISO_LEVEL[a.componentLevel] ?? "equipment",
    status: assetStatus(a.lifecycleStatus),
    meta: a.assetTag,
    children: (subs.get(a.id) ?? []).map(asset),
  });
  const placed = n.assets.map((x) => byId.get(x.id)).filter((a): a is Asset => !!a);
  return [
    {
      id: n.id,
      name: n.name,
      level: LEVEL[n.level] ?? "area",
      meta: `${n.code} · ${count(n)}`,
      children: [...n.children.flatMap((c) => toTree(c, subs, byId)), ...placed.map(asset)],
    },
  ];
}

type Form =
  | { mode: "add"; parent: HierarchyNode; level: EditableLevel }
  | { mode: "edit"; node: HierarchyNode }
  | { mode: "off"; node: HierarchyNode };
type AssetForm = {
  workUnitId?: string;
  parentAssetId?: string;
  componentLevel?: Asset["componentLevel"];
};

function HierarchyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: reg, isPending } = useRegistry();
  const [query, setQuery] = React.useState("");
  // ?asset=<id> (from the Maintenance app) opens that asset selected
  const [sel, setSel] = React.useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("asset") ?? undefined,
  );
  const [form, setForm] = React.useState<Form | null>(null);
  const [assetForm, setAssetForm] = React.useState<AssetForm | null>(null);
  const byId = React.useMemo(() => new Map((reg?.assets ?? []).map((a) => [a.id, a])), [reg]);
  const subs = React.useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of reg?.assets ?? [])
      if (a.parentAssetId) m.set(a.parentAssetId, [...(m.get(a.parentAssetId) ?? []), a]);
    return m;
  }, [reg]);
  const nodes = React.useMemo(
    () => (reg ? toTree(reg.tree.root, subs, byId) : []),
    [reg, subs, byId],
  );
  const all = React.useMemo(() => {
    const out = new Map<string, { node: HierarchyNode; path: string[] }>();
    const walk = (n: HierarchyNode, path: string[]) => {
      out.set(n.id, { node: n, path });
      n.children.forEach((c) => walk(c, [...path, c.name]));
    };
    if (reg) walk(reg.tree.root, []);
    return out;
  }, [reg]);
  const counts = LEVELS.map((l) => [...all.values()].filter((x) => x.node.level === l).length);
  const assetLevels = (["equipment_unit", "subunit", "maintainable_item", "part"] as const).map(
    (l) => (reg?.assets ?? []).filter((a) => a.componentLevel === l).length,
  );
  const selectedAsset = sel ? byId.get(sel) : undefined;
  const current = selectedAsset
    ? undefined
    : (sel && all.get(sel)) || [...all.values()].find((x) => x.node.level === "site");
  const assetsUnder = (n: HierarchyNode): HierarchyNode["assets"] => [
    ...n.assets,
    ...n.children.flatMap(assetsUnder),
  ];
  const node = current?.node;
  const childLevel = node ? CHILD_LEVEL[node.level as keyof typeof CHILD_LEVEL] : undefined;
  const editable = node && node.level !== "tenant" && node.level !== "enterprise";
  const unitOf = (assetId: string): string | undefined => {
    const p = reg?.placements.find((x) => x.assetId === assetId)?.workUnitId;
    if (p) return p;
    const parent = byId.get(assetId)?.parentAssetId;
    return parent ? unitOf(parent) : undefined;
  };
  const typeName = (a: Asset) => reg?.types.find((x) => x.id === a.assetTypeId)?.name ?? "—";

  return (
    <>
      <PageTitle
        title={t("md.nav.hierarchy")}
        subtitle={t("md.h.subtitle")}
        crumbs={
          selectedAsset
            ? [t("md.nav.hierarchy"), selectedAsset.assetTag]
            : node
              ? [t("md.nav.hierarchy"), node.name]
              : [t("md.nav.hierarchy")]
        }
      />
      <div className="flex flex-col gap-3">
        <Strip
          cols="sm:grid-cols-5 xl:grid-cols-9"
          cells={[
            ...LEVELS.map((l, i) => ({ label: t(`md.h.level.${l}`), value: counts[i] })),
            ...(["equipment_unit", "subunit", "maintainable_item", "part"] as const).map(
              (l, i) => ({ label: t(`md.level.${l}`), value: assetLevels[i] }),
            ),
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
                placeholder={t("md.h.filter")}
                aria-label={t("md.h.filter")}
              />
            </InputGroup>
            {isPending ? (
              <Skeleton className="h-64" />
            ) : (
              <div className="-mx-1 min-h-0 overflow-y-auto px-1 @3xl/shell:flex-1">
                <AssetTree
                  nodes={nodes}
                  label={t("md.nav.hierarchy")}
                  query={query}
                  selectedId={selectedAsset?.id ?? node?.id}
                  onSelect={(n) => setSel(n.id)}
                  defaultExpanded={nodes.map((n) => n.id)}
                />
              </div>
            )}
          </Card>

          {selectedAsset && reg ? (
            <Card className="self-start">
              <CardHeader>
                <div className="font-mono text-[12px] text-muted-foreground">
                  {selectedAsset.assetTag}
                </div>
                <CardTitle className="text-[17px]">
                  {selectedAsset.assetName || selectedAsset.assetTag}
                </CardTitle>
                <CardDescription>
                  {t(`md.level.${selectedAsset.componentLevel}`)} ·{" "}
                  {(reg.paths.get(unitOf(selectedAsset.id) ?? "") ?? []).join(" › ") ||
                    t("md.assets.unplaced")}
                </CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  {NEXT_ASSET_LEVEL[selectedAsset.componentLevel] ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setAssetForm({
                          parentAssetId: selectedAsset.id,
                          componentLevel: NEXT_ASSET_LEVEL[selectedAsset.componentLevel],
                        })
                      }
                    >
                      <PlusIcon />{" "}
                      {t("md.h.addLevel", {
                        level: t(`md.level.${NEXT_ASSET_LEVEL[selectedAsset.componentLevel]}`),
                      })}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigate({
                        to: "/assets/$assetId",
                        params: { assetId: selectedAsset.id },
                      })
                    }
                  >
                    <ExternalLinkIcon /> {t("md.h.openAsset")}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <dl className="grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-4">
                  {(
                    [
                      [
                        t("md.f.status"),
                        <span key="s" className="inline-flex items-center gap-1.5">
                          <StatusDot status={selectedAsset.lifecycleStatus} />
                          {t(`md.lifecycle.${selectedAsset.lifecycleStatus}`)}
                        </span>,
                      ],
                      [t("md.f.type"), typeName(selectedAsset)],
                      [t("md.f.parent"), byId.get(selectedAsset.parentAssetId)?.assetTag ?? "—"],
                      [t("md.f.serial"), selectedAsset.serialNumber || "—"],
                    ] as [string, React.ReactNode][]
                  ).map(([k, v]) => (
                    <div key={k} className="-mr-px -mb-px min-w-0 border-r border-b px-3.5 py-2.5">
                      <dt className="text-[12px] text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 truncate text-[14px] font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <AssetsTable
                  title={t("md.f.children", { n: (subs.get(selectedAsset.id) ?? []).length })}
                  rows={subs.get(selectedAsset.id) ?? []}
                  typeName={typeName}
                  onPick={setSel}
                  empty={t("md.h.noSub")}
                />
              </CardContent>
            </Card>
          ) : current && node ? (
            <Card className="self-start">
              <CardHeader>
                <div className="font-mono text-[12px] text-muted-foreground">{node.code}</div>
                <CardTitle className="text-[17px]">{node.name}</CardTitle>
                <CardDescription>
                  {t(`md.h.level.${node.level}`)} · {current.path.slice(0, -1).join(" › ") || "—"}
                </CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  {node.level === "work-unit" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setAssetForm({ workUnitId: node.id, componentLevel: "equipment_unit" })
                      }
                    >
                      <PlusIcon /> {t("md.h.addAsset")}
                    </Button>
                  ) : childLevel ? (
                    <Button
                      size="sm"
                      onClick={() => setForm({ mode: "add", parent: node, level: childLevel })}
                    >
                      <PlusIcon /> {t("md.h.add", { level: t(`md.h.level.${childLevel}`) })}
                    </Button>
                  ) : null}
                  {editable ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setForm({ mode: "edit", node })}
                      >
                        <PencilIcon /> {t("md.assets.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm({ mode: "off", node })}
                      >
                        <BanIcon /> {t("md.h.deactivate")}
                      </Button>
                    </>
                  ) : null}
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-5">
                {node.children.length ? (
                  <section className="grid gap-2">
                    <h4 className="text-[13.5px] font-semibold">
                      {t("md.h.children", { n: node.children.length })}
                    </h4>
                    <div className="overflow-hidden rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="pl-4">{t("md.f.name")}</TableHead>
                            <TableHead>{t("md.h.code")}</TableHead>
                            <TableHead className="w-[40%]">{t("md.assets.s.total")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {node.children.map((c) => {
                            const n = assetsUnder(c).length;
                            const max = Math.max(
                              1,
                              ...node.children.map((x) => assetsUnder(x).length),
                            );
                            return (
                              <TableRow
                                key={c.id}
                                className="cursor-pointer"
                                onClick={() => setSel(c.id)}
                              >
                                <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                                <TableCell className="font-mono text-[12px] text-muted-foreground">
                                  {c.code}
                                </TableCell>
                                <TableCell>
                                  <span className="flex items-center gap-2">
                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                      <span
                                        className="block h-full rounded-full bg-[var(--chart-1)]"
                                        style={{ width: `${(n / max) * 100}%` }}
                                      />
                                    </span>
                                    <span className="w-8 text-right tabular-nums">{n}</span>
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                ) : null}
                <AssetsTable
                  title={
                    node.level === "work-unit"
                      ? t("md.h.onUnit", { n: node.assets.length })
                      : t("md.h.assets", { n: assetsUnder(node).length })
                  }
                  rows={(node.level === "work-unit" ? node.assets : assetsUnder(node))
                    .map((a) => byId.get(a.id))
                    .filter((a): a is Asset => !!a)}
                  typeName={typeName}
                  onPick={setSel}
                  empty={node.level === "work-unit" ? t("md.h.emptyUnit") : "—"}
                  limit={15}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("md.h.note")}</p>
      </div>
      {form?.mode === "off" ? (
        <DeactivateDialog
          node={form.node}
          onClose={() => setForm(null)}
          onDone={() => setSel(undefined)}
        />
      ) : form ? (
        <NodeDialog form={form} onClose={() => setForm(null)} onSaved={(id) => setSel(id)} />
      ) : null}
      {reg && assetForm ? (
        <AssetDialog
          reg={reg}
          defaults={assetForm}
          onClose={() => setAssetForm(null)}
          onCreated={(id) => setSel(id)}
        />
      ) : null}
    </>
  );
}

/** Assets as a compact table: status, tag, name, level, type; a row opens the asset in the tree. */
function AssetsTable({
  title,
  rows,
  typeName,
  onPick,
  empty,
  limit,
}: {
  title: string;
  rows: Asset[];
  typeName: (a: Asset) => string;
  onPick: (id: string) => void;
  empty: string;
  limit?: number;
}) {
  const { t } = useTranslation();
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <section className="grid gap-2">
      <h4 className="text-[13.5px] font-semibold">{title}</h4>
      {rows.length ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("md.f.tag")}</TableHead>
                <TableHead>{t("md.f.name")}</TableHead>
                <TableHead>{t("md.f.level")}</TableHead>
                <TableHead className="pr-4">{t("md.f.type")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => onPick(a.id)}>
                  <TableCell className="pl-4">
                    <span className="inline-flex items-center gap-2 font-mono text-[12px]">
                      <StatusDot status={a.lifecycleStatus} />
                      {a.assetTag}
                    </span>
                  </TableCell>
                  <TableCell>{a.assetName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`md.level.${a.componentLevel}`)}
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{typeName(a)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {limit && rows.length > limit ? (
            <div className="border-t px-4 py-1.5 text-[12px] text-muted-foreground">
              +{rows.length - limit}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function NodeDialog({
  form,
  onClose,
  onSaved,
}: {
  form: Exclude<Form, { mode: "off" }>;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const level = (form.mode === "add" ? form.level : form.node.level) as EditableLevel;
  const { data: existing } = useNode(
    form.mode === "edit" ? level : null,
    form.mode === "edit" ? form.node.id : null,
  );
  const create = useCreateNode();
  const update = useUpdateNode();
  const [f, setF] = React.useState<NodeInput>({
    code: form.mode === "edit" ? form.node.code : "",
    name: form.mode === "edit" ? form.node.name : "",
    type: "production_line",
    timezone: "Asia/Jakarta",
  });
  React.useEffect(() => {
    if (existing)
      setF((x) => ({
        ...x,
        type: existing.type ?? x.type,
        timezone: existing.timezone ?? x.timezone,
      }));
  }, [existing]);
  const [reason, setReason] = React.useState("");
  const pattern = level === "work-unit" ? /^[A-Za-z0-9_]+$/ : /^[A-Za-z0-9_-]+$/;
  const codeOk = pattern.test(f.code);
  const ready = f.name.trim() && codeOk && (form.mode === "add" || reason.trim());
  const input: NodeInput = {
    code: f.code.trim(),
    name: f.name.trim(),
    ...(level === "work-center" ? { type: f.type } : {}),
    ...(level === "site" ? { timezone: f.timezone } : {}),
  };
  const done = { onError: (e: unknown) => toast.error(errorMessage(e)) };
  const save = () =>
    form.mode === "add"
      ? create.mutate(
          { level, parentId: form.parent.id, ...input },
          {
            ...done,
            onSuccess: (n) => (
              toast.success(t("md.h.created", { name: n.name })),
              onClose(),
              onSaved(n.id)
            ),
          },
        )
      : update.mutate(
          { level, id: form.node.id, ...input, reason: reason.trim() },
          {
            ...done,
            onSuccess: () => (toast.success(t("md.h.saved", { name: input.name })), onClose()),
          },
        );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.mode === "add"
              ? t("md.h.add", { level: t(`md.h.level.${level}`) })
              : t("md.assets.editTitle", { tag: form.node.name })}
          </DialogTitle>
          <DialogDescription>
            {form.mode === "add"
              ? t("md.h.addHint", { parent: form.parent.name })
              : t(`md.h.level.${level}`)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.h.code")}</Label>
            <Input
              className="font-mono"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
            />
            {f.code && !codeOk ? (
              <p className="text-[12px] text-destructive">
                {t(level === "work-unit" ? "md.h.codeRuleUnit" : "md.h.codeRule")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px]">{t("md.f.name")}</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          {level === "work-center" ? (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-[12.5px]">{t("md.h.type")}</Label>
              <NativeSelect
                value={f.type}
                onChange={(e) => setF({ ...f, type: e.target.value as WorkCenterType })}
              >
                {WORK_CENTER_TYPES.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {t(`md.h.wcType.${x}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {level === "site" ? (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-[12.5px]">{t("md.h.timezone")}</Label>
              <NativeSelect
                value={f.timezone}
                onChange={(e) => setF({ ...f, timezone: e.target.value })}
              >
                {["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"].map((z) => (
                  <NativeSelectOption key={z} value={z}>
                    {z}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}
        </div>
        {form.mode === "edit" ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!ready || create.isPending || update.isPending} onClick={save}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  node,
  onClose,
  onDone,
}: {
  node: HierarchyNode;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const kind = node.level as EditableLevel;
  const { data: impact, isPending, error } = useImpact(kind, node.id);
  const off = useDeactivateNode();
  const [reason, setReason] = React.useState("");
  const blocked = (impact?.blockers.length ?? 0) > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("md.h.offTitle", { name: node.name })}</DialogTitle>
          <DialogDescription>{t("md.h.offHint")}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-16" />
        ) : error ? (
          <p className="text-[13px] text-destructive">{errorMessage(error)}</p>
        ) : impact ? (
          <div className="grid gap-2 text-[13px]">
            <p>{t("md.h.offChildren", { n: impact.descendantCount })}</p>
            {blocked ? (
              <div className="rounded-lg border border-[var(--sys-orange)]/40 bg-[var(--sys-orange)]/5 p-3">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <TriangleAlertIcon className="size-4 text-[var(--sys-orange)]" />{" "}
                  {t("md.h.offBlocked", { n: impact.blockers.length })}
                </div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {impact.blockers.slice(0, 8).map((b, i) => (
                    <li key={i}>{b.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {impact && !blocked ? <ReasonField value={reason} onChange={setReason} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!impact || blocked || !reason.trim() || off.isPending}
            onClick={() =>
              off.mutate(
                { kind, id: node.id, reason: reason.trim() },
                {
                  onSuccess: () => (
                    toast.success(t("md.h.offDone", { name: node.name })),
                    onClose(),
                    onDone()
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

export { HierarchyPage };
