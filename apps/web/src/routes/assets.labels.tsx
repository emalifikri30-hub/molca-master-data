import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { LabelsPage } from "@/components/md/LabelsPage";

// QR labels, under the asset register. ?ids=a,b preselects assets (the Maintenance app's "QR label" lands here).
export const Route = createFileRoute("/assets/labels")({
  beforeLoad: requireAuth,
  validateSearch: (s: Record<string, unknown>): { ids?: string } => ({
    ids: typeof s.ids === "string" ? s.ids : undefined,
  }),
  component: function Labels() {
    const { ids } = Route.useSearch();
    return <LabelsPage ids={ids?.split(",").filter(Boolean)} />;
  },
});
