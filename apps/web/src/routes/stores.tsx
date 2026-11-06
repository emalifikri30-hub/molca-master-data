import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { StoresPage } from "@/components/md/StoresPage";

export const Route = createFileRoute("/stores")({ beforeLoad: requireAuth, component: StoresPage });
