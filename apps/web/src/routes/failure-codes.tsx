import { createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth-guard";
import { FailureCodesPage } from "@/components/md/FailureCodesPage";

export const Route = createFileRoute("/failure-codes")({
  beforeLoad: requireAuth,
  component: FailureCodesPage,
});
