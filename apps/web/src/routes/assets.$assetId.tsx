import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { AssetsRegistry } from "@/components/md/AssetsRegistry";

// An asset opens selected in the tree: the hierarchy stays in view while you work on it.
export const Route = createFileRoute("/assets/$assetId")({
  beforeLoad: requireAuth,
  component: AssetRoute,
});

function AssetRoute() {
  const { assetId } = Route.useParams();
  return <AssetsRegistry selectedId={assetId} />;
}
