import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { ClassesPage } from "@/components/md/ClassesPage";

export const Route = createFileRoute("/classes")({
  beforeLoad: requireAuth,
  component: ClassesPage,
});
