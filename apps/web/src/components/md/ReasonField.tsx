import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** The reason every change carries into the audit log (AUD-001: a person's edit without a reason is refused). */
function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12.5px]">{t("md.reason.label")}</Label>
      <Textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("md.reason.placeholder")}
      />
      <p className="text-[12px] text-muted-foreground">{t("md.reason.hint")}</p>
    </div>
  );
}

export { ReasonField };
