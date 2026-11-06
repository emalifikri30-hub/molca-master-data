import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { SparePartsPage } from "@/components/md/SparePartsPage";

export const Route = createFileRoute("/parts")({
  beforeLoad: requireAuth,
  component: SparePartsPage,
});
