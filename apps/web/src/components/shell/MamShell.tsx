import * as React from "react";
// the Maintenance app of MolcaDx MAM; in local development the MAM web on port 3600
const MAINTENANCE_WEB =
  (import.meta.env.VITE_MAINTENANCE_WEB_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://localhost:3600" : undefined);
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  Contrast,
  CpuIcon,
  NetworkIcon,
  ShapesIcon,
  UsersIcon,
  PackageIcon,
  WarehouseIcon,
  FileWarningIcon,
  Factory,
  HomeIcon,
  Languages,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  UserCog,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { devPersonas, logout, switchPersona } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { setLanguage } from "@/lib/i18n";
import { useAccess, useAssetTree, useMe } from "@/lib/queries";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoIcon } from "@/components/site/logo";
import { CrumbsContext, SiteContext } from "@/components/shell/page-header";

import type { HierarchyNode } from "@/lib/types";

// The Molca chrome, as on the Molca sites (Product Foundation and Design System: components/site/header.tsx and
// docs-shell.tsx): header with the app switcher and the plant scope on the left; search, language, contrast and
// theme on the right; a 272 px sidebar with folding groups, 14 px items and the white active pill, collapsible to
// an icon rail (⌘B). The product adds what an app needs: the person's menu. Only what the person may open is in
// the navigation (permissions and licence); the server checks again on every call.

type Route = {
  id: string;
  to:
    | "/"
    | "/assets"
    | "/hierarchy"
    | "/classes"
    | "/people"
    | "/parts"
    | "/stores"
    | "/failure-codes";
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group: "overview" | "maintenance" | "field";
  show: boolean;
};

type Site = { id: string; name: string; place?: string };

const SITE_KEY = "molca-site";
const SIDEBAR_KEY = "molca-sidebar";
const CONTRAST_KEY = "molca-contrast";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // not remembered
    }
  },
};

function useRoutes(): Route[] {
  const { t } = useTranslation();
  return [
    { id: "home", to: "/", label: t("nav.home"), icon: HomeIcon, group: "overview", show: true },
    {
      id: "assets",
      to: "/assets",
      label: t("nav.assets"),
      icon: CpuIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "hierarchy",
      to: "/hierarchy",
      label: t("md.nav.hierarchy"),
      icon: NetworkIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "classes",
      to: "/classes",
      label: t("md.nav.classes"),
      icon: ShapesIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "people",
      to: "/people",
      label: t("md.nav.people"),
      icon: UsersIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "parts",
      to: "/parts",
      label: t("md.nav.parts"),
      icon: PackageIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "stores",
      to: "/stores",
      label: t("md.nav.stores"),
      icon: WarehouseIcon,
      group: "maintenance",
      show: true,
    },
    {
      id: "failure-codes",
      to: "/failure-codes",
      label: t("md.nav.failureCodes"),
      icon: FileWarningIcon,
      group: "maintenance",
      show: true,
    },
  ] satisfies Route[];
}

/** Sites of the tenant from the hierarchy (the plant scope in the header). */
function sitesOf(root: HierarchyNode | undefined): Site[] {
  if (!root) return [];
  const out: Site[] = [];
  const walk = (n: HierarchyNode, enterprise?: string) => {
    if (n.level === "site") out.push({ id: n.id, name: n.name, place: enterprise });
    for (const c of n.children) walk(c, n.level === "enterprise" ? n.name : enterprise);
  };
  walk(root);
  return out;
}

// ---- header ------------------------------------------------------------------------------------------------

/** The MolcaDx app switcher (logo + app name), styled as the Molca site switcher. */
function AppSwitcher() {
  const { t } = useTranslation();
  const apps = [
    { id: "master-data", name: t("apps.masterData"), desc: t("apps.masterDataDesc"), url: "/" },
    {
      id: "maintenance",
      name: t("apps.maintenance"),
      desc: t("apps.maintenanceDesc"),
      url: MAINTENANCE_WEB,
    },
    {
      id: "users",
      name: t("apps.users"),
      desc: t("apps.usersDesc"),
      url: import.meta.env.VITE_USER_MANAGEMENT_WEB_URL as string | undefined,
    },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-2 rounded-lg pr-1.5 pl-1 text-[13.5px] font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted"
        aria-label={t("apps.switch")}
      >
        <LogoIcon className="h-[17px] text-foreground" />
        <span className="hidden whitespace-nowrap sm:inline">{t("apps.masterData")}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          MolcaDx
        </DropdownMenuLabel>
        {apps.map((a) => (
          <DropdownMenuItem
            key={a.id}
            asChild={!!a.url}
            disabled={!a.url}
            className="items-start gap-2.5 py-2"
          >
            {a.url ? (
              <a href={a.url}>
                <span className="grid flex-1 gap-0.5">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-[11.5px] leading-snug text-muted-foreground">{a.desc}</span>
                </span>
                {a.id === "master-data" && <Check className="mt-0.5 size-4 text-highlight" />}
              </a>
            ) : (
              <span className="grid flex-1 gap-0.5">
                <span className="font-medium">{a.name}</span>
                <span className="text-[11.5px] leading-snug text-muted-foreground">{a.desc}</span>
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Plant / site scope: it leads the header like the domain scope on the Molca sites; every page follows it. */
function SiteScope({
  sites,
  value,
  onChange,
}: {
  sites: Site[];
  value: Site | null;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background pr-1.5 pl-2 text-[13px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted"
            aria-label={t("shell.siteLabel", { site: value.name })}
          >
            <Factory className="size-3.5" />
            {value.name}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("shell.siteHint")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="pt-2 text-xs font-normal text-muted-foreground">
          {t("shell.switchSite")}
        </DropdownMenuLabel>
        {sites.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => onChange(s.id)}
            className="items-start gap-2.5 py-2"
          >
            <Factory className="mt-0.5 size-4" />
            <span className="grid flex-1 gap-0.5">
              <span className="font-medium">{s.name}</span>
              {s.place ? (
                <span className="text-[11.5px] text-muted-foreground">{s.place}</span>
              ) : null}
            </span>
            {s.id === value.id && <Check className="mt-0.5 size-4 text-highlight" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "id";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 font-mono text-[12px]"
          aria-label="Language"
          onClick={() => setLanguage(lang === "id" ? "en" : "id")}
        >
          <Languages className="size-3.5" />
          {lang.toUpperCase()}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
      </TooltipContent>
    </Tooltip>
  );
}

/** The "Increased contrast" variants of the palette (follows the OS setting until chosen). */
function ContrastToggle() {
  const { t } = useTranslation();
  const [more, setMore] = React.useState(() => {
    const saved = store.get(CONTRAST_KEY);
    return saved ? saved === "more" : window.matchMedia("(prefers-contrast: more)").matches;
  });
  React.useEffect(() => {
    document.documentElement.dataset.contrast = more ? "more" : "normal";
  }, [more]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={more ? "default" : "outline"}
          size="icon"
          className="hidden sm:inline-flex"
          aria-pressed={more}
          aria-label={t("shell.contrast")}
          onClick={() => {
            store.set(CONTRAST_KEY, more ? "normal" : "more");
            setMore(!more);
          }}
        >
          <Contrast />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56 text-center">
        <div className="flex flex-col gap-0.5">
          <b className="font-semibold">
            {t("shell.contrast")}: {more ? t("shell.on") : t("shell.off")}
          </b>
          <span className="opacity-70">{t("shell.contrastHint")}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { t } = useTranslation();
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("shell.theme")}
          onClick={() => {
            document.documentElement.classList.toggle("dark", !dark);
            store.set("theme", dark ? "light" : "dark");
            setDark(!dark);
          }}
        >
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{dark ? t("shell.toLight") : t("shell.toDark")}</TooltipContent>
    </Tooltip>
  );
}

// Demo only: switch to the demo person of another role (BFF dev mode); absent when the BFF lists no personas.
function DemoRoles() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { data: personas } = useQuery({
    queryKey: ["dev-personas"],
    queryFn: devPersonas,
    staleTime: Infinity,
  });
  if (!personas?.length) return null;
  const label = (u: string) =>
    u.startsWith("demo-") ? t(`roles.${u.slice(5)}`) : t("shell.demoDefault", { name: u });
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <UserCog />
          {t("shell.demoSwitch")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          <DropdownMenuRadioGroup
            value={me?.preferredUsername ?? ""}
            onValueChange={(u) => void switchPersona(u).catch(() => undefined)}
          >
            {personas.map((u) => (
              <DropdownMenuRadioItem key={u} value={u}>
                {label(u)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

function UserMenu({ name, detail }: { name: string; detail: string }) {
  const { t } = useTranslation();
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={t("shell.account")}
      >
        <Avatar size="sm">
          <AvatarFallback className="text-[10.5px]">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="text-[13px] font-medium text-foreground">{name}</div>
          <div className="text-xs font-normal text-muted-foreground">{detail}</div>
        </DropdownMenuLabel>
        <DemoRoles />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          {t("shell.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- search ------------------------------------------------------------------------------------------------

function SearchDialog({
  open,
  onOpenChange,
  routes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routes: Route[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: tree } = useAssetTree();
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const assets: { id: string; tag: string; name: string }[] = [];
  const walk = (n: HierarchyNode) => {
    for (const a of n.assets) assets.push(a);
    for (const c of n.children) walk(c);
  };
  if (tree) walk(tree.root);
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shell.search")}
      description={t("shell.searchHint")}
    >
      <Command>
        <CommandInput placeholder={t("shell.searchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{t("shell.noResults")}</CommandEmpty>
          <CommandGroup heading={t("shell.pages")}>
            {routes.map((r) => (
              <CommandItem
                key={r.id}
                value={`page ${r.label}`}
                onSelect={() => go(() => void navigate({ to: r.to }))}
              >
                <r.icon />
                {r.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t("shell.assets")}>
            {assets.map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.tag} ${a.name}`}
                onSelect={() =>
                  go(() => void navigate({ to: "/assets/$assetId", params: { assetId: a.id } }))
                }
              >
                <CpuIcon />
                <span className="font-mono text-[12px] text-muted-foreground">{a.tag}</span>{" "}
                {a.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// ---- sidebar -----------------------------------------------------------------------------------------------

function CollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
          aria-expanded={!collapsed}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? t("shell.expand") : t("shell.collapse")}{" "}
        <kbd className="ml-1 font-mono opacity-70">⌘B</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

function useFolded() {
  const key = "molca-nav-folded:maintenance";
  const [folded, setFolded] = React.useState<string[]>(() => {
    try {
      return JSON.parse(store.get(key) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const toggle = (g: string) =>
    setFolded((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      store.set(key, JSON.stringify(next));
      return next;
    });
  return { folded, toggle };
}

function SidebarNav({
  routes,
  active,
  rail = false,
  onToggle,
  onSearch,
  onNavigate,
}: {
  routes: Route[];
  active: string;
  rail?: boolean;
  onToggle?: () => void;
  onSearch: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { folded, toggle } = useFolded();
  const groups = (["overview", "maintenance", "field"] as const)
    .map((g) => ({ id: g, title: t(`nav.${g}`), items: routes.filter((r) => r.group === g) }))
    .filter((g) => g.items.length);

  if (rail) {
    return (
      <nav className="flex flex-col items-center gap-1" aria-label={t("shell.navigation")}>
        {onToggle && (
          <div className="mb-1">
            <CollapseButton collapsed onToggle={onToggle} />
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("shell.search")}
              onClick={onSearch}
              className="mb-3 grid size-10 place-items-center rounded-xl border bg-card text-muted-foreground shadow-xs hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("shell.search")} ⌘K</TooltipContent>
        </Tooltip>
        {groups.map((g, gi) => (
          <div key={g.id} className="flex flex-col items-center gap-1">
            {gi > 0 && <span className="my-2 h-px w-6 bg-border" />}
            {g.items.map((r) => {
              const on = r.id === active;
              return (
                <Tooltip key={r.id}>
                  <TooltipTrigger asChild>
                    <Link
                      to={r.to}
                      aria-label={r.label}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "grid size-10 place-items-center rounded-xl border transition-colors",
                        on
                          ? "border-border bg-card text-foreground shadow-xs"
                          : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
                      )}
                    >
                      <r.icon className="size-[18px]" strokeWidth={on ? 2 : 1.6} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span className="opacity-60">{g.title} · </span>
                    {r.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={t("shell.navigation")}>
      <div className="mb-5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap rounded-xl border bg-card px-3 text-[14px] text-muted-foreground shadow-xs transition-colors hover:text-foreground"
        >
          <Search className="size-4" />
          {t("shell.search")}
          <span className="ml-auto flex gap-1">
            <kbd className="grid h-5 min-w-5 place-items-center rounded-md border bg-background px-1 font-sans text-[11px] shadow-xs">
              ⌘
            </kbd>
            <kbd className="grid h-5 min-w-5 place-items-center rounded-md border bg-background px-1 font-sans text-[11px] shadow-xs">
              K
            </kbd>
          </span>
        </button>
        {onToggle && <CollapseButton collapsed={false} onToggle={onToggle} />}
      </div>
      <div className="space-y-4">
        {groups.map((g) => {
          const hasActive = g.items.some((r) => r.id === active);
          const open = hasActive || !folded.includes(g.id);
          const id = `nav-group-${g.id}`;
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => !hasActive && toggle(g.id)}
                aria-expanded={open}
                aria-controls={id}
                className={cn(
                  "group/fold flex w-full items-center justify-between rounded-md px-2.5 py-1 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground",
                  !hasActive && "hover:text-foreground",
                )}
              >
                {g.title}
                <span className="flex items-center gap-1.5 normal-case tracking-normal">
                  {!open && (
                    <span className="text-[11px] tabular-nums opacity-70">{g.items.length}</span>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      !open && "-rotate-90",
                      hasActive && "opacity-30",
                    )}
                  />
                </span>
              </button>
              {open && (
                <ul id={id} className="mt-1 space-y-0.5">
                  {g.items.map((r) => {
                    const on = r.id === active;
                    return (
                      <li key={r.id}>
                        <Link
                          to={r.to}
                          onClick={onNavigate}
                          aria-current={on ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl border px-2.5 py-[7px] text-[14px] transition-colors",
                            on
                              ? "border-border bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_1px_1px_rgb(0_0_0/0.03)]"
                              : "border-transparent text-foreground/75 hover:bg-card/70 hover:text-foreground",
                          )}
                        >
                          <r.icon
                            className={cn(
                              "size-[18px] shrink-0",
                              on ? "text-foreground" : "text-muted-foreground",
                            )}
                            strokeWidth={on ? 2 : 1.6}
                          />
                          <span className="truncate">{r.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ---- shell -------------------------------------------------------------------------------------------------

function MamShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useMe();
  const { data: access } = useAccess();
  const { data: tree } = useAssetTree();
  const routes = useRoutes();
  const [crumbs, setCrumbs] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => store.get(SIDEBAR_KEY) === "collapsed");
  const sites = sitesOf(tree?.root);
  const [siteId, setSiteId] = React.useState(() => store.get(SITE_KEY) ?? "");
  const site = sites.find((s) => s.id === siteId) ?? sites[0] ?? null;

  const active =
    routes
      .filter((r) => (r.to === "/" ? pathname === "/" : pathname.startsWith(r.to)))
      .sort((a, b) => b.to.length - a.to.length)[0]?.id ?? "home";

  // the page's breadcrumb names the browser tab
  React.useEffect(() => {
    document.title = crumbs.length
      ? `${crumbs[crumbs.length - 1]} · ${t("apps.masterData")} · MolcaDx MAM`
      : `${t("apps.masterData")} · MolcaDx MAM`;
  }, [crumbs, t]);

  const toggleCollapsed = React.useCallback(
    () =>
      setCollapsed((c) => {
        store.set(SIDEBAR_KEY, c ? "expanded" : "collapsed");
        return !c;
      }),
    [],
  );
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((o) => !o);
      }
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const roles = access?.roles ?? [];
  const detail = [
    roles.map((r) => t(`roles.${r}`, { defaultValue: r })).join(", "),
    tree?.tenant.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CrumbsContext.Provider value={setCrumbs}>
      <SiteContext.Provider value={site}>
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
          <div className="flex h-15 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenu(true)}
              aria-label={t("shell.openNav")}
            >
              <Menu />
            </Button>
            <AppSwitcher />
            <nav
              className="ml-2 hidden min-w-0 items-center gap-1 md:flex xl:ml-4"
              aria-label={t("shell.scope")}
            >
              <SiteScope
                sites={sites}
                value={site}
                onChange={(id) => {
                  setSiteId(id);
                  store.set(SITE_KEY, id);
                }}
              />
            </nav>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearch(true)}
              aria-label={t("shell.search")}
            >
              <Search />
            </Button>
            <LanguageToggle />
            <ContrastToggle />
            <ThemeToggle />
            <UserMenu name={access?.userName ?? me?.preferredUsername ?? ""} detail={detail} />
          </div>
          <SearchDialog open={search} onOpenChange={setSearch} routes={routes} />
        </header>
        <div className="flex">
          <aside
            className={cn(
              "sticky top-15 hidden h-[calc(100vh-3.75rem)] shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
              collapsed ? "w-[72px]" : "w-[272px]",
            )}
          >
            <div className={cn("flex-1 overflow-y-auto py-5", collapsed ? "px-3" : "px-4")}>
              <SidebarNav
                routes={routes}
                active={active}
                rail={collapsed}
                onToggle={toggleCollapsed}
                onSearch={() => setSearch(true)}
              />
              {!collapsed && (
                <div className="mt-6 rounded-xl border bg-card p-3.5">
                  <LifeBuoy className="size-4 text-highlight" />
                  <div className="mt-2 text-[13px] font-semibold">{t("shell.helpTitle")}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("shell.helpHint")}</p>
                </div>
              )}
            </div>
          </aside>
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetContent
              side="left"
              className="w-72 overflow-y-auto p-4"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <SheetHeader className="p-0 pb-4">
                <SheetTitle>{t("shell.navigation")}</SheetTitle>
              </SheetHeader>
              <div className="mb-5 flex items-center justify-between border-b pb-4 text-xs text-muted-foreground">
                {t("shell.site")}
                <SiteScope
                  sites={sites}
                  value={site}
                  onChange={(id) => {
                    setSiteId(id);
                    store.set(SITE_KEY, id);
                  }}
                />
              </div>
              <SidebarNav
                routes={routes}
                active={active}
                onSearch={() => setSearch(true)}
                onNavigate={() => setMenu(false)}
              />
            </SheetContent>
          </Sheet>
          <main className="@container/shell min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </SiteContext.Provider>
    </CrumbsContext.Provider>
  );
}

export { MamShell };
