import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CompassIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Root notFoundComponent (DS Empty): an unmatched URL, or a loader that threw notFound().
function NotFoundState() {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle>{t("errors.notFound")}</EmptyTitle>
        <EmptyDescription>{t("errors.notFoundHint")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" asChild>
          <Link to="/">{t("errors.home")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export { NotFoundState };
