import { useEffect } from "react";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { onSessionExpired } from "@/lib/http";
import { mamKey, meKey } from "@/lib/queries";
import { ErrorState } from "@/components/ErrorState";
import { NotFoundState } from "@/components/NotFoundState";
import { MamShell } from "@/components/shell/MamShell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => <ErrorState error={error as Error} reset={reset} />,
  notFoundComponent: NotFoundState,
});

function RootLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // The axios refresh interceptor lives outside React; when a refresh fails it
  // broadcasts here. Drop the cached session and feed, then bounce to /login
  // carrying the current URL so signing back in returns the user to it.
  useEffect(() => {
    return onSessionExpired(() => {
      queryClient.setQueryData(meKey, null);
      queryClient.removeQueries({ queryKey: mamKey });

      const { pathname, href } = router.state.location;
      // Load-bearing: without it, a 401 fired while already on /login nests the
      // redirect into itself (/login?redirect=%2Flogin%3Fredirect%3D…).
      if (pathname === "/login") return;
      void router.navigate({
        to: "/login",
        search: { redirect: href, reason: "expired" },
        replace: true,
      });
    });
  }, [queryClient, router]);

  // the technician app (/m) has its own phone shell; sign-in has no shell
  const bare = useRouterState({
    select: (s) => s.location.pathname.startsWith("/m") || s.location.pathname.startsWith("/login"),
  });
  return (
    <TooltipProvider>
      {bare ? (
        <Outlet />
      ) : (
        <MamShell>
          <Outlet />
        </MamShell>
      )}
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}
