import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";

// Each page names itself inside the one shell. The shell stays mounted across pages (sidebar state, ⌘K), so a
// page hands its breadcrumbs up (plain strings, stable) and renders its own title row with the same markup and
// type scale as the AppShell header of the Design System.

const CrumbsContext = React.createContext<(crumbs: string[]) => void>(() => undefined);

/** The site chosen in the top bar (global context, DS App navigation). */
const SiteContext = React.createContext<{ id: string; name: string } | null>(null);
const useSite = () => React.useContext(SiteContext);

function useCrumbs(crumbs: string[]) {
  const set = React.useContext(CrumbsContext);
  const key = crumbs.join("\u0000");
  React.useEffect(() => {
    set(key ? key.split("\u0000") : []);
  }, [set, key]);
}

/** Page header as on the Molca sites (PF components/docs/page-header.tsx): breadcrumb, title, one line of
 * context, and — for an app — the page's actions on the right. */
function PageTitle({
  title,
  subtitle,
  actions,
  crumbs,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: string[];
}) {
  const { t } = useTranslation();
  const trail = [t("app.product"), ...(crumbs ?? [title])];
  useCrumbs(trail.slice(1));
  return (
    <header className="mb-6">
      <nav
        aria-label={t("shell.breadcrumb")}
        className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
      >
        {trail.map((c, i) => (
          <span key={`${c}-${i}`} className="inline-flex items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3" /> : null}
            <span className={i === trail.length - 1 ? "font-medium text-foreground" : undefined}>
              {c}
            </span>
          </span>
        ))}
      </nav>
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(28px,3.4vw,38px)] font-semibold leading-[1.1] tracking-[-0.035em]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-[15px] leading-[1.45] text-foreground/70">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export { CrumbsContext, PageTitle, SiteContext, useCrumbs, useSite };
