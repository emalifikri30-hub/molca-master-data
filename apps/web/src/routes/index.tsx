import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BoxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  MapPinOffIcon,
  ShapesIcon,
  UserXIcon,
  WalletIcon,
} from "lucide-react";

import { requireAuth } from "@/lib/auth-guard";
import {
  LIFECYCLES,
  useCrews,
  useFailureCodes,
  useItems,
  usePeople,
  useRegistry,
  useStoresBins,
  type Asset,
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/shell/page-header";
import {
  BarList,
  STATUS_COLOR,
  StatusDot,
  Tiles,
  locatedIds,
  type Tile,
} from "@/components/md/parts";

import type { HierarchyNode } from "@/lib/types";

// Overview as a data-health room (like the Maintenance war room): what is incomplete comes first — tiles that open
// the page that fixes it, then the queue of records to tidy, then what the master data holds (assets per area,
// lifecycle, classes, crew). Every module reads these records, so a gap here shows up everywhere.

export const Route = createFileRoute("/")({ beforeLoad: requireAuth, component: Home });

type Issue = {
  key: string;
  what: string;
  title: string;
  meta: string;
  to: "/assets" | "/hierarchy" | "/classes" | "/people" | "/parts" | "/stores" | "/failure-codes";
  assetId?: string;
  tone: string;
};

function Home() {
  const { t, i18n } = useTranslation();
  const { data: reg, isPending } = useRegistry();
  const { data: people } = usePeople();
  const { data: crews } = useCrews();
  const { data: items } = useItems();
  const { data: storesBins } = useStoresBins();
  const { data: codes } = useFailureCodes();
  const [page, setPage] = React.useState(0);

  const located = React.useMemo(() => (reg ? locatedIds(reg) : new Set<string>()), [reg]);
  const units = React.useMemo(() => {
    const out: { node: HierarchyNode; path: string[] }[] = [];
    const walk = (n: HierarchyNode, path: string[]) => {
      if (n.level === "work-unit") out.push({ node: n, path });
      n.children.forEach((c) => walk(c, [...path, c.name]));
    };
    if (reg) walk(reg.tree.root, []);
    return out;
  }, [reg]);
  const assets = reg?.assets ?? [];
  const untyped = assets.filter((a) => !a.assetTypeId && a.componentLevel === "equipment_unit");
  const unplaced = assets.filter((a) => !located.has(a.id));
  const emptyUnits = units.filter((u) => !u.node.assets.length);
  const unusedTypes = (reg?.types ?? []).filter((x) => !assets.some((a) => a.assetTypeId === x.id));
  const noRate = (people ?? []).filter((p) => !p.hourlyRate || Number(p.hourlyRate) === 0);
  const noLogin = (people ?? []).filter((p) => !p.username);
  const noPrice = (items ?? []).filter((i) => i.unitCost == null || Number(i.unitCost) === 0);
  const untagged = (storesBins?.bins ?? []).filter((b) => !b.tag);
  const codeClasses = [...new Set((codes ?? []).map((c) => c.iso14224Class))];
  const thinClasses = codeClasses.filter((cls) =>
    (["mode", "mechanism", "cause"] as const).some(
      (k) => !(codes ?? []).some((c) => c.iso14224Class === cls && c.kind === k),
    ),
  );

  const tiles: Tile[] = [
    {
      icon: CpuIcon,
      label: t("md.home.t.untyped"),
      n: untyped.length,
      sub: t("md.home.t.untypedSub"),
      to: "/assets",
      hot: true,
    },
    {
      icon: MapPinOffIcon,
      label: t("md.home.t.unplaced"),
      n: unplaced.length,
      sub: t("md.home.t.unplacedSub"),
      to: "/assets",
      hot: true,
    },
    {
      icon: BoxIcon,
      label: t("md.home.t.emptyUnits"),
      n: emptyUnits.length,
      sub: t("md.home.t.emptyUnitsSub", { n: units.length }),
      to: "/hierarchy",
    },
    {
      icon: ShapesIcon,
      label: t("md.home.t.unusedTypes"),
      n: unusedTypes.length,
      sub: t("md.home.t.unusedTypesSub", { n: reg?.types.length ?? 0 }),
      to: "/classes",
    },
    {
      icon: WalletIcon,
      label: t("md.home.t.noRate"),
      n: noRate.length,
      sub: t("md.home.t.noRateSub"),
      to: "/people",
      hot: true,
    },
    {
      icon: UserXIcon,
      label: t("md.home.t.noLogin"),
      n: noLogin.length,
      sub: t("md.home.t.noLoginSub", { n: people?.length ?? 0 }),
      to: "/people",
    },
    {
      icon: WalletIcon,
      label: t("md.home.t.noPrice"),
      n: noPrice.length,
      sub: t("md.home.t.noPriceSub", { n: items?.length ?? 0 }),
      to: "/parts",
      hot: true,
    },
    {
      icon: BoxIcon,
      label: t("md.home.t.untagged"),
      n: untagged.length,
      sub: t("md.home.t.untaggedSub", { n: storesBins?.bins.length ?? 0 }),
      to: "/stores",
    },
    {
      icon: ShapesIcon,
      label: t("md.home.t.thinCodes"),
      n: thinClasses.length,
      sub: t("md.home.t.thinCodesSub", { n: codeClasses.length }),
      to: "/failure-codes",
    },
  ];

  // one queue, most harmful first: records other modules cannot use correctly
  const issues: Issue[] = [
    ...unplaced.map((a) => ({
      key: a.id,
      what: t("md.home.q.unplaced"),
      title: a.assetName || a.assetTag,
      meta: a.assetTag,
      to: "/assets" as const,
      assetId: a.id,
      tone: "var(--sys-orange)",
    })),
    ...untyped.map((a) => ({
      key: `t${a.id}`,
      what: t("md.home.q.untyped"),
      title: a.assetName || a.assetTag,
      meta: a.assetTag,
      to: "/assets" as const,
      assetId: a.id,
      tone: "var(--sys-orange)",
    })),
    ...noRate.map((p) => ({
      key: p.id,
      what: t("md.home.q.noRate"),
      title: p.name,
      meta: p.code,
      to: "/people" as const,
      tone: "var(--sys-orange)",
    })),
    ...emptyUnits.map((u) => ({
      key: u.node.id,
      what: t("md.home.q.emptyUnit"),
      title: u.path.slice(-2).join(" › "),
      meta: u.node.code,
      to: "/hierarchy" as const,
      tone: "var(--muted-foreground)",
    })),
    ...unusedTypes.map((x) => ({
      key: x.id,
      what: t("md.home.q.unusedType"),
      title: x.name,
      meta: x.code,
      to: "/classes" as const,
      tone: "var(--muted-foreground)",
    })),
    ...noPrice.map((i) => ({
      key: i.id,
      what: t("md.home.q.noPrice"),
      title: i.name,
      meta: i.code,
      to: "/parts" as const,
      tone: "var(--sys-orange)",
    })),
    ...thinClasses.map((c) => ({
      key: `fc${c}`,
      what: t("md.home.q.thinCodes"),
      title: c,
      meta: "ISO 14224",
      to: "/failure-codes" as const,
      tone: "var(--muted-foreground)",
    })),
    ...untagged.map((b) => ({
      key: b.id,
      what: t("md.home.q.untagged"),
      title: b.code,
      meta: (storesBins?.stores ?? []).find((x) => x.id === b.storeId)?.code ?? "",
      to: "/stores" as const,
      tone: "var(--muted-foreground)",
    })),
    ...noLogin.map((p) => ({
      key: `l${p.id}`,
      what: t("md.home.q.noLogin"),
      title: p.name,
      meta: p.code,
      to: "/people" as const,
      tone: "var(--muted-foreground)",
    })),
  ];
  const PAGE = 10;
  const pages = Math.max(1, Math.ceil(issues.length / PAGE));
  const at = Math.min(page, pages - 1);

  // assets per area (placed directly under it), and per lifecycle state
  const areas = React.useMemo(() => {
    const out: { key: string; label: string; value: number }[] = [];
    const count = (n: HierarchyNode): number =>
      n.assets.length + n.children.reduce((s, c) => s + count(c), 0);
    const walk = (n: HierarchyNode) => {
      if (n.level === "area") out.push({ key: n.id, label: n.name, value: count(n) });
      else n.children.forEach(walk);
    };
    if (reg) walk(reg.tree.root);
    return out.sort((a, b) => b.value - a.value);
  }, [reg]);
  const byStatus = LIFECYCLES.map((s) => ({
    s,
    n: assets.filter((a) => a.lifecycleStatus === s).length,
  })).filter((x) => x.n);
  const classes = (reg?.classes ?? [])
    .map((c) => ({
      key: c.id,
      label: c.name,
      value: assets.filter(
        (a) => reg?.types.find((x) => x.id === a.assetTypeId)?.assetClassId === c.id,
      ).length,
    }))
    .filter((c) => c.value)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const crafts = [...new Set((people ?? []).map((p) => p.craft || "lain"))]
    .map((c) => ({
      key: c,
      label: t(`md.p.craft.${c}`, { defaultValue: c }),
      value: (people ?? []).filter((p) => (p.craft || "lain") === c).length,
    }))
    .sort((a, b) => b.value - a.value);
  const site = reg?.tree.root.children.flatMap((e) => e.children).find((n) => n.level === "site");
  const today = new Date().toLocaleDateString(i18n.language === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <PageTitle
        title={t("md.home.title")}
        subtitle={[reg?.tree.tenant.name, site?.name, today].filter(Boolean).join(" · ")}
        crumbs={[t("nav.home")]}
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-3">
          <Tiles tiles={tiles} />
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t("md.home.queue")}</CardTitle>
                <CardDescription>{t("md.home.queueHint", { n: issues.length })}</CardDescription>
                {pages > 1 ? (
                  <CardAction className="flex items-center gap-1 text-[12px] text-muted-foreground tabular-nums">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="‹"
                      disabled={at === 0}
                      onClick={() => setPage(at - 1)}
                    >
                      <ChevronLeftIcon />
                    </Button>
                    {at + 1} / {pages}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="›"
                      disabled={at >= pages - 1}
                      onClick={() => setPage(at + 1)}
                    >
                      <ChevronRightIcon />
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                {issues.length ? (
                  <ul className="divide-y">
                    {issues.slice(at * PAGE, at * PAGE + PAGE).map((r) => (
                      <li key={r.key}>
                        <Link
                          {...(r.assetId
                            ? { to: "/assets/$assetId" as const, params: { assetId: r.assetId } }
                            : { to: r.to })}
                          className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-[13px] hover:bg-subtle/50"
                        >
                          <span
                            className="flex items-center gap-1.5 text-[12px]"
                            style={{ color: r.tone }}
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ background: r.tone }}
                            />
                            <span className="truncate">{r.what}</span>
                          </span>
                          <span className="truncate">{r.title}</span>
                          <span className="font-mono text-[11.5px] text-muted-foreground">
                            {r.meta}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    {t("md.home.clean")}
                  </p>
                )}
              </CardContent>
            </Card>
            <div className="grid content-start gap-3">
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>{t("md.home.byArea")}</CardTitle>
                  <CardDescription>
                    {t("md.home.byAreaHint", { n: assets.length, units: units.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BarList rows={areas} />
                </CardContent>
              </Card>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>{t("md.home.lifecycle")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2.5">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {byStatus.map((x) => (
                      <span
                        key={x.s}
                        title={`${t(`md.lifecycle.${x.s}`)} ${x.n}`}
                        style={{
                          width: `${(x.n / Math.max(1, assets.length)) * 100}%`,
                          background: STATUS_COLOR[x.s as Asset["lifecycleStatus"]],
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                    {byStatus.map((x) => (
                      <span key={x.s} className="inline-flex items-center gap-1.5">
                        <StatusDot status={x.s as Asset["lifecycleStatus"]} />
                        {t(`md.lifecycle.${x.s}`)}{" "}
                        <b className="font-semibold tabular-nums">{x.n}</b>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t("md.home.classesTop")}</CardTitle>
                <CardDescription>
                  {t("md.home.classesHint", {
                    classes: reg?.classes.length ?? 0,
                    types: reg?.types.length ?? 0,
                  })}
                </CardDescription>
                <CardAction>
                  <Link to="/classes" className="text-[13px] text-primary hover:underline">
                    {t("md.home.open")}
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BarList rows={classes} color="var(--chart-2)" />
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t("md.home.crew")}</CardTitle>
                <CardDescription>
                  {t("md.home.crewHint", {
                    people: people?.length ?? 0,
                    crews: crews?.length ?? 0,
                  })}
                </CardDescription>
                <CardAction>
                  <Link to="/people" className="text-[13px] text-primary hover:underline">
                    {t("md.home.open")}
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BarList rows={crafts} color="var(--chart-3)" />
              </CardContent>
            </Card>
          </div>
          <p className="text-[12px] text-muted-foreground">{t("md.home.note")}</p>
        </div>
      )}
    </>
  );
}
