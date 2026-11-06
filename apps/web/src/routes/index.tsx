import { Link, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, CpuIcon, NetworkIcon } from "lucide-react";

import { requireAuth } from "@/lib/auth-guard";
import { useRegistry } from "@/lib/md";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/shell/page-header";

// Overview: what master data holds for this tenant, and where to maintain it.
export const Route = createFileRoute("/")({ beforeLoad: requireAuth, component: Home });

function Home() {
  const { t } = useTranslation();
  const { data: reg } = useRegistry();
  const placed = new Set(reg?.placements.map((p) => p.assetId));
  const strip: [string, number][] = [
    [t("md.home.units"), reg?.tree.counts.workUnits ?? 0],
    [t("md.assets.s.total"), reg?.assets.length ?? 0],
    [t("md.assets.s.unplaced"), (reg?.assets ?? []).filter((a) => !placed.has(a.id)).length],
    [t("md.assets.s.types"), reg?.types.length ?? 0],
    [t("md.home.classes"), reg?.classes.length ?? 0],
  ];
  const cards = [
    {
      to: "/assets" as const,
      icon: CpuIcon,
      title: t("nav.assets"),
      body: t("md.home.assetsHint"),
    },
    {
      to: "/hierarchy" as const,
      icon: NetworkIcon,
      title: t("md.nav.hierarchy"),
      body: t("md.home.hierarchyHint"),
    },
  ];
  return (
    <>
      <PageTitle
        title={t("md.home.title")}
        subtitle={reg?.tree.tenant.name ?? ""}
        crumbs={[t("nav.home")]}
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-5">
          {strip.map(([k, v]) => (
            <div key={k} className="-mr-px -mb-px border-r border-b px-3.5 py-2.5">
              <div className="truncate text-[12px] text-muted-foreground">{k}</div>
              <div className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight tabular-nums">
                {v}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.to} to={c.to}>
              <Card className="h-full transition-colors hover:bg-subtle/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <c.icon className="size-4" /> {c.title}{" "}
                    <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>{c.body}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("md.home.note")}</p>
      </div>
    </>
  );
}
