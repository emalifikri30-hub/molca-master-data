import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { HierarchyPage } from "@/components/md/HierarchyPage";

export const Route = createFileRoute("/hierarchy")({
  beforeLoad: requireAuth,
  component: HierarchyPage,
});
