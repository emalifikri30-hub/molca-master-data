import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { AssetsRegistry } from "@/components/md/AssetsRegistry";

export const Route = createFileRoute("/assets/")({
  beforeLoad: requireAuth,
  component: () => <AssetsRegistry />,
});
