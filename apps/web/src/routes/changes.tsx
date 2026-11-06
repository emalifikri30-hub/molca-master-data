import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { ChangesPage } from "@/components/md/ChangesPage";

export const Route = createFileRoute("/changes")({
  beforeLoad: requireAuth,
  component: ChangesPage,
});
