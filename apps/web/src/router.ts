import { createRouter } from "@tanstack/react-router";

import { queryClient } from "@/lib/query-client";
import { routeTree } from "@/routeTree.gen";

// Kept JSX-free (.ts, not .tsx) so oxlint's react/only-export-components never
// applies here — it only scans .tsx/.jsx.
const router = createRouter({
  routeTree,
  context: { queryClient },
  // Preload on hover/focus. React Query already owns data freshness, so don't add
  // a second staleness layer on top of the query cache.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

// Registers this router's types globally, so <Link to>, useSearch, useParams and
// redirect() are all checked against the real route tree.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
