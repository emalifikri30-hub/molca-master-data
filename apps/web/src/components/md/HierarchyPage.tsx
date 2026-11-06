import * as React from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon } from "lucide-react";

import { useRegistry } from "@/lib/md";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetTree, type AssetLevel, type AssetNode } from "@/components/molca/asset-tree";
import { PageTitle } from "@/components/shell/page-header";

import type { HierarchyNode } from "@/lib/types";

// Site hierarchy (ISA-95: enterprise › site › area › work center › work unit): the structure every module places
// its records in. Left the tree, right the selected node with its children and the assets under it.

const LEVEL: Record<string, AssetLevel> = {
  enterprise: "enterprise",
  site: "site",
  area: "area",
  "work-center": "line",
  "work-unit": "cell",
};

function toTree(n: HierarchyNode): AssetNode[] {
  if (n.level === "tenant") return n.children.flatMap(toTree);
  const count = (x: HierarchyNode): number =>
    x.assets.length + x.children.reduce((s, c) => s + count(c), 0);
  return [
    {
      id: n.id,
      name: n.name,
      level: LEVEL[n.level] ?? "area",
      meta: `${n.code} · ${count(n)}`,
      children: n.children.flatMap(toTree),
    },
  ];
}

function HierarchyPage() {
  const { t } = useTranslation();
  const { data: reg, isPending } = useRegistry();
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState<string>();
  const nodes = React.useMemo(() => (reg ? toTree(reg.tree.root) : []), [reg]);
  const all = React.useMemo(() => {
    const out = new Map<string, { node: HierarchyNode; path: string[] }>();
    const walk = (n: HierarchyNode, path: string[]) => {
      out.set(n.id, { node: n, path });
      n.children.forEach((c) => walk(c, [...path, c.name]));
    };
    if (reg) walk(reg.tree.root, []);
    return out;
  }, [reg]);
  const levels = ["enterprise", "site", "area", "work-center", "work-unit"] as const;
  const counts = levels.map((l) => [...all.values()].filter((x) => x.node.level === l).length);
  const current = (sel && all.get(sel)) || [...all.values()].find((x) => x.node.level === "site");
  const assetsUnder = (n: HierarchyNode): HierarchyNode["assets"] => [
    ...n.assets,
    ...n.children.flatMap(assetsUnder),
  ];

  return (
    <>
      <PageTitle
        title={t("md.nav.hierarchy")}
        subtitle={t("md.h.subtitle")}
        crumbs={[t("md.nav.hierarchy")]}
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-5">
          {levels.map((l, i) => (
            <div key={l} className="-mr-px -mb-px border-r border-b px-3.5 py-2.5">
              <div className="truncate text-[12px] text-muted-foreground">
                {t(`md.h.level.${l}`)}
              </div>
              <div className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight tabular-nums">
                {counts[i]}
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
              <div className="-mx-1 min-h-0 overflow-y-auto px-1 @3xl/shell:flex-1">
                <AssetTree
                  nodes={nodes}
                  label={t("md.nav.hierarchy")}
                  query={query}
                  selectedId={current?.node.id}
                  onSelect={(n) => setSel(n.id)}
                  defaultExpanded={nodes.map((n) => n.id)}
                />
              </div>
            )}
          </Card>
          {current ? (
            <div className="flex min-w-0 flex-col gap-3">
              <Card>
                <CardHeader>
                  <div className="font-mono text-[12px] text-muted-foreground">
                    {current.node.code}
                  </div>
                  <CardTitle className="text-[17px]">{current.node.name}</CardTitle>
                  <CardDescription>
                    {t(`md.h.level.${current.node.level}`)} · {current.path.join(" › ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[12px] text-muted-foreground">
                      {t("md.h.children", { n: current.node.children.length })}
                    </div>
                    <ul className="space-y-0.5">
                      {current.node.children.length ? (
                        current.node.children.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setSel(c.id)}
                            >
                              {c.name}
                            </button>{" "}
                            <span className="font-mono text-[11.5px] text-muted-foreground">
                              {c.code}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li>—</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-[12px] text-muted-foreground">
                      {t("md.h.assets", { n: assetsUnder(current.node).length })}
                    </div>
                    <ul className="space-y-0.5">
                      {assetsUnder(current.node)
                        .slice(0, 12)
                        .map((a) => (
                          <li key={a.id}>
                            <span className="font-mono text-[12px]">{a.tag}</span> {a.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
              <p className="text-[12px] text-muted-foreground">{t("md.h.editNote")}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export { HierarchyPage };
