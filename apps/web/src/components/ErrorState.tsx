import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { OctagonAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Root errorComponent (DS Empty). Reached when a loader or guard *throws* — which, thanks to getMe() mapping
// 401/403 to null, means something is actually broken rather than "the user isn't signed in".
function ErrorState({ error, reset }: { error: Error; reset?: () => void }) {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <OctagonAlertIcon className="text-danger" />
        </EmptyMedia>
        <EmptyTitle>{t("errors.title")}</EmptyTitle>
        <EmptyDescription>{error.message || t("errors.unreachable")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        {reset ? (
          <Button variant="outline" size="sm" onClick={reset}>
            {t("errors.retry")}
          </Button>
        ) : null}
        <Button size="sm" asChild>
          <Link to="/">{t("errors.home")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export { ErrorState };
