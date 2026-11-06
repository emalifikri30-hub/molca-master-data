import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckIcon, PrinterIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useRegistry, type Asset, type Registry } from "@/lib/md";
import {
  qrSvg,
  useAssetLabels,
  useLabelStatus,
  usePrintLabels,
  type AssetLabel,
  type LabelStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageTitle } from "@/components/shell/page-header";
import { StatStrip } from "@/components/molca/stat-strip";

// QR labels of the assets (sub-feature of the asset register): which asset has a label on the machine, which were
// printed but not put up, which are damaged, which have none. Pick assets, print them on A4 (10 labels of
// 90 × 50 mm), and mark each one installed once it hangs on the machine.

type Filter = "none" | "printed" | "installed" | "damaged" | "all";
const STATUS_COLOR: Record<LabelStatus | "none", string> = {
  none: "var(--muted-foreground)",
  printed: "var(--sys-orange)",
  installed: "var(--sys-green)",
  damaged: "var(--sys-red)",
  retired: "var(--muted-foreground)",
};

function Dot({ status }: { status: LabelStatus | "none" }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

/** Where an asset stands: its own placement, or its parent's (sub-assets hang under their machine). */
function placeOf(reg: Registry, a: Asset): string {
  let cur: Asset | undefined = a;
  for (let i = 0; cur && i < 6; i++) {
    const p = reg.placements.find((x) => x.assetId === cur!.id);
    if (p) return (reg.paths.get(p.workUnitId) ?? []).join(" › ");
    cur = reg.assets.find((x) => x.id === cur!.parentAssetId);
  }
  return "";
}

function LabelsPage({ ids }: { ids?: string[] }) {
  const { t } = useTranslation();
  const { data: reg } = useRegistry();
  const { data: labels } = useAssetLabels();
  const print = usePrintLabels();
  const mark = useLabelStatus();
  const [filter, setFilter] = React.useState<Filter>(ids?.length ? "all" : "none");
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(ids ?? []));
  const [sheet, setSheet] = React.useState<Asset[] | null>(null);

  const byAsset = React.useMemo(() => new Map((labels ?? []).map((l) => [l.assetId, l])), [labels]);
  const statusOf = (a: Asset): LabelStatus | "none" => byAsset.get(a.id)?.status ?? "none";
  const live = (reg?.assets ?? []).filter((a) => a.lifecycleStatus !== "decommissioned");
  const rows = live
    .filter((a) => filter === "all" || statusOf(a) === filter)
    .filter((a) => `${a.assetTag} ${a.assetName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  const count = (s: LabelStatus | "none") => live.filter((a) => statusOf(a) === s).length;
  const chosen = live.filter((a) => picked.has(a.id));
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const doPrint = async (assets: Asset[]) => {
    setSheet(assets);
    // the sheet renders first, then the browser's print dialog opens on it
    await new Promise((r) => setTimeout(r, 300));
    window.print();
    try {
      await print.mutateAsync(assets.map((a) => a.id));
      toast.success(t("lbl.printed", { n: assets.length }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const setStatus = (a: Asset, status: "installed" | "damaged") =>
    void mark.mutateAsync({ assetId: a.id, status }).then(
      () => toast.success(t(`lbl.marked.${status}`, { tag: a.assetTag })),
      (e: unknown) => toast.error(errorMessage(e)),
    );

  return (
    <>
      <div className="print:hidden">
        <PageTitle
          title={t("lbl.title")}
          subtitle={t("lbl.subtitle")}
          crumbs={[t("nav.assets"), t("lbl.title")]}
          actions={
            <Button size="sm" disabled={!chosen.length} onClick={() => void doPrint(chosen)}>
              <PrinterIcon /> {t("lbl.print", { n: chosen.length })}
            </Button>
          }
        />
        <div className="flex flex-col gap-3">
          <StatStrip
            cols="sm:grid-cols-3 xl:grid-cols-5"
            cells={[
              { label: t("lbl.s.assets"), value: live.length },
              { label: t("lbl.s.installed"), value: count("installed"), status: "ok" },
              { label: t("lbl.s.printed"), value: count("printed"), tone: "var(--sys-orange)" },
              { label: t("lbl.s.damaged"), value: count("damaged"), tone: "var(--sys-red)" },
              { label: t("lbl.s.none"), value: count("none"), tone: "var(--sys-orange)" },
            ]}
          />
          <Card className="gap-0 p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <InputGroup className="h-8 w-full sm:w-64">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("lbl.search")}
                />
              </InputGroup>
              <div className="max-w-full overflow-x-auto">
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={filter}
                  onValueChange={(v) => v && setFilter(v as Filter)}
                >
                  {(["none", "printed", "installed", "damaged", "all"] as const).map((f) => (
                    <ToggleGroupItem key={f} value={f}>
                      {t(`lbl.f.${f}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  setPicked(
                    rows.length && rows.every((a) => picked.has(a.id))
                      ? new Set()
                      : new Set(rows.map((a) => a.id)),
                  )
                }
              >
                {rows.length && rows.every((a) => picked.has(a.id))
                  ? t("lbl.none")
                  : t("lbl.all", { n: rows.length })}
              </Button>
            </div>
            <ul className="divide-y">
              {rows.map((a) => {
                const l = byAsset.get(a.id);
                const st = statusOf(a);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]"
                  >
                    <Checkbox
                      checked={picked.has(a.id)}
                      onCheckedChange={(v) => toggle(a.id, v === true)}
                      aria-label={a.assetTag}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/assets/$assetId"
                        params={{ assetId: a.id }}
                        className="hover:underline"
                      >
                        <span className="font-mono text-[12.5px]">{a.assetTag}</span>{" "}
                        <span className="text-muted-foreground">{a.assetName}</span>
                      </Link>
                      {reg ? (
                        <div className="truncate text-[12px] text-muted-foreground">
                          {placeOf(reg, a)}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid min-w-40 text-[12.5px]">
                      <span className="inline-flex items-center gap-1.5">
                        <Dot status={st} />
                        {t(`lbl.st.${st}`)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">{detail(l, t)}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => void doPrint([a])}>
                        <PrinterIcon /> {t("lbl.printOne")}
                      </Button>
                      {st === "printed" || st === "damaged" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(a, "installed")}
                        >
                          <CheckIcon /> {t("lbl.install")}
                        </Button>
                      ) : null}
                      {st === "installed" ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("lbl.damaged")}
                          title={t("lbl.damaged")}
                          onClick={() => setStatus(a, "damaged")}
                        >
                          <TriangleAlertIcon />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!rows.length ? (
                <li className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  {t("lbl.empty")}
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
      {sheet ? <PrintSheet assets={sheet} reg={reg} /> : null}
    </>
  );
}

function detail(l: AssetLabel | undefined, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!l) return "—";
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "");
  if (l.status === "installed")
    return t("lbl.d.installed", { at: d(l.installedAt), by: l.installedBy, n: l.printCount });
  return t("lbl.d.printed", { at: d(l.lastPrintedAt), by: l.lastPrintedBy, n: l.printCount });
}

/** The A4 sheet that only shows when printing: 2 × 5 labels of 90 × 50 mm. */
function PrintSheet({ assets, reg }: { assets: Asset[]; reg?: Registry }) {
  const [codes, setCodes] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    void Promise.all(assets.map(async (a) => [a.id, await qrSvg(a.id)] as const)).then((xs) =>
      setCodes(Object.fromEntries(xs)),
    );
  }, [assets]);
  const parentTag = (id: string) => reg?.assets.find((x) => x.id === id)?.assetTag;
  return (
    <div className="label-sheet hidden print:block">
      {/* only the sheet prints: the app around it (shell, sidebar, dialogs) stays off the paper */}
      <style>{`@page { size: A4; margin: 12mm 15mm; }
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .label-sheet, .label-sheet * { visibility: visible !important; }
          .label-sheet { position: absolute; left: 0; top: 0; }
        }`}</style>
      <div className="grid grid-cols-2" style={{ width: "180mm" }}>
        {assets.map((a) => (
          <div
            key={a.id}
            className="flex break-inside-avoid items-center gap-[4mm] border border-dashed border-neutral-400 p-[4mm] text-black"
            style={{ width: "90mm", height: "50mm" }}
          >
            {codes[a.id] ? (
              <img src={codes[a.id]} alt="" style={{ width: "36mm", height: "36mm" }} />
            ) : null}
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <div
                className={cn(
                  "font-bold leading-tight",
                  a.assetTag.length > 14 ? "text-[11pt]" : "text-[15pt]",
                )}
              >
                {a.assetTag}
              </div>
              <div className="mt-[1mm] text-[8.5pt] leading-snug">{a.assetName}</div>
              {a.parentAssetId && parentTag(a.parentAssetId) ? (
                <div className="mt-[1mm] text-[7pt] text-neutral-500">
                  bagian dari {parentTag(a.parentAssetId)}
                </div>
              ) : null}
              <div className="mt-auto text-[6.5pt] text-neutral-500">
                Scan untuk buka aset · MolcaDx
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The label of one asset on its detail: the QR, where the label stands, and print / installed / damaged. */
function AssetLabelCard({ asset, reg }: { asset: Asset; reg: Registry }) {
  const { t } = useTranslation();
  const { data: labels } = useAssetLabels();
  const print = usePrintLabels();
  const mark = useLabelStatus();
  const [qr, setQr] = React.useState("");
  const [sheet, setSheet] = React.useState(false);
  React.useEffect(() => void qrSvg(asset.id).then(setQr), [asset.id]);
  const l = labels?.find((x) => x.assetId === asset.id);
  const st: LabelStatus | "none" = l?.status ?? "none";
  const doPrint = async () => {
    setSheet(true);
    await new Promise((r) => setTimeout(r, 300));
    window.print();
    setSheet(false);
    await print.mutateAsync([asset.id]).then(
      () => toast.success(t("lbl.printed", { n: 1 })),
      (e: unknown) => toast.error(errorMessage(e)),
    );
  };
  const set = (status: "installed" | "damaged") =>
    void mark.mutateAsync({ assetId: asset.id, status }).then(
      () => toast.success(t(`lbl.marked.${status}`, { tag: asset.assetTag })),
      (e: unknown) => toast.error(errorMessage(e)),
    );
  return (
    <Card className="gap-3 p-4 print:hidden">
      <div className="flex flex-wrap items-start gap-4">
        {qr ? (
          <img src={qr} alt={t("lbl.card")} className="size-24 rounded-md border bg-white p-1.5" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{t("lbl.card")}</div>
          <div className="text-[12.5px] text-muted-foreground">{t("lbl.cardHint")}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] font-medium">
            <Dot status={st} /> {t(`lbl.st.${st}`)}
          </div>
          <div className="text-[12px] text-muted-foreground">{l ? detail(l, t) : null}</div>
          {t(`lbl.next.${st}`) ? (
            <div className="mt-1 text-[12px] text-muted-foreground">{t(`lbl.next.${st}`)}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void doPrint()}>
            <PrinterIcon /> {t("lbl.printOne")}
          </Button>
          {st === "printed" || st === "damaged" ? (
            <Button size="sm" variant="outline" onClick={() => set("installed")}>
              <CheckIcon /> {t("lbl.install")}
            </Button>
          ) : null}
          {st === "installed" ? (
            <Button size="sm" variant="ghost" onClick={() => set("damaged")}>
              <TriangleAlertIcon /> {t("lbl.damaged")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/assets/labels">{t("lbl.manage")}</Link>
          </Button>
        </div>
      </div>
      {sheet ? <PrintSheet assets={[asset]} reg={reg} /> : null}
    </Card>
  );
}

export { AssetLabelCard, LabelsPage };
