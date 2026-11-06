import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { PeoplePage } from "@/components/md/PeoplePage";

export const Route = createFileRoute("/people")({ beforeLoad: requireAuth, component: PeoplePage });
