import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckIcon, Undo2Icon, XIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useAccess } from "@/lib/queries";
import {
  useChangeRequests,
  useDecideChange,
  useWithdrawChange,
  type ChangeRequest,
} from "@/lib/changes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageTitle } from "@/components/shell/page-header";
import { StatStrip } from "@/components/molca/stat-strip";

// Change approval (PRD Workflow & approval): retiring an asset, deactivating catalogue records or hierarchy nodes
// and manual revaluations wait here for a second person. Approving replays the change as the approver.

const COLOR: Record<ChangeRequest["status"], string> = {
  pending: "var(--sys-orange)",
  approved: "var(--sys-green)",
  rejected: "var(--sys-red)",
  withdrawn: "var(--muted-foreground)",
  failed: "var(--sys-red)",
};
const when = (s?: string | null) =>
  s
    ? new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(s))
    : "";

function ChangesPage() {
  const { t } = useTranslation();
  const { data } = useChangeRequests();
  const [filter, setFilter] = React.useState<"pending" | "all">("pending");
  const rows = (data ?? []).filter((r) => filter === "all" || r.status === "pending");
  const n = (s: ChangeRequest["status"]) => (data ?? []).filter((r) => r.status === s).length;
  return (
    <>
      <PageTitle title={t("chg.title")} subtitle={t("chg.subtitle")} crumbs={[t("chg.title")]} />
      <div className="flex flex-col gap-3">
        <StatStrip
          cols="sm:grid-cols-5"
          cells={[
            {
              label: t("chg.st.pending"),
              value: n("pending"),
              tone: n("pending") ? "var(--sys-orange)" : undefined,
            },
            { label: t("chg.st.approved"), value: n("approved") },
            { label: t("chg.st.rejected"), value: n("rejected") },
            { label: t("chg.st.withdrawn"), value: n("withdrawn") },
            {
              label: t("chg.st.failed"),
              value: n("failed"),
              tone: n("failed") ? "var(--sys-red)" : undefined,
            },
          ]}
        />
        <Card className="gap-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <p className="text-[12.5px] text-muted-foreground">{t("chg.hint")}</p>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={filter}
              onValueChange={(v) => v && setFilter(v as typeof filter)}
            >
              <ToggleGroupItem value="pending">{t("chg.st.pending")}</ToggleGroupItem>
              <ToggleGroupItem value="all">{t("chg.all")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ul className="divide-y">
            {rows.map((r) => (
              <Row key={r.id} r={r} />
            ))}
            {!rows.length ? (
              <li className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                {t("chg.empty")}
              </li>
            ) : null}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Row({ r }: { r: ChangeRequest }) {
  const { t } = useTranslation();
  const { data: access } = useAccess();
  const decide = useDecideChange();
  const withdraw = useWithdrawChange();
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const mine = access?.userId === r.makerId;
  const what =
    r.action === "revalue" && r.body?.newCost != null
      ? ` → Rp ${Number(r.body.newCost).toLocaleString("id-ID")}`
      : "";
  const done = (msg: string) => () => toast.success(msg);
  const fail = (e: unknown) => toast.error(errorMessage(e));
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: COLOR[r.status] }}
        />
        <div className="min-w-0 flex-1 text-[13px]">
          <div className="font-medium">
            {t(`chg.action.${r.action}`, { defaultValue: r.action })} ·{" "}
            {t(`chg.entity.${r.entity}`, { defaultValue: r.entity })}{" "}
            <span className="font-mono text-[12px] text-muted-foreground">
              {r.entityLabel || r.entityId}
            </span>
            {what}
          </div>
          <div className="text-[12px] text-muted-foreground">
            {t("chg.by", { name: r.makerName || "—", at: when(r.createdAt) })} · “{r.reason}”
          </div>
          {r.status !== "pending" ? (
            <div
              className={cn(
                "text-[12px]",
                r.status === "failed" ? "text-[var(--sys-red)]" : "text-muted-foreground",
              )}
            >
              {t(`chg.st.${r.status}`)}
              {r.decidedByName ? ` · ${r.decidedByName}` : ""} {when(r.decidedAt)}
              {r.decisionNote ? ` · ${r.decisionNote}` : ""}
            </div>
          ) : null}
        </div>
        {r.status === "pending" ? (
          <div className="flex flex-wrap gap-2">
            {mine ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => withdraw.mutateAsync(r.id).then(done(t("chg.withdrawn")), fail)}
              >
                <Undo2Icon /> {t("chg.withdraw")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide
                      .mutateAsync({ id: r.id, decision: "approve" })
                      .then(done(t("chg.approved")), fail)
                  }
                >
                  <CheckIcon /> {t("chg.approve")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(!rejecting)}>
                  <XIcon /> {t("chg.reject")}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {rejecting ? (
        <div className="flex flex-wrap gap-2 pl-5">
          <Textarea
            rows={2}
            className="min-w-60 flex-1"
            placeholder={t("chg.reason")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={note.trim().length < 3}
            onClick={() =>
              decide
                .mutateAsync({ id: r.id, decision: "reject", note: note.trim() })
                .then(done(t("chg.rejected")), fail)
            }
          >
            {t("chg.reject")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export { ChangesPage };
