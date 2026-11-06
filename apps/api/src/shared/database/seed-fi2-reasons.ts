// FI-2 downtime and reject reasons, from the tags the gateway sheet declares
// (F-05 REF, F-04 §9.7). Molca's PLCs expose one register per reason: every
// `downtime_reason` register is a downtime reason, every per-cause `reject`
// register a reject reason, and each tag then points at its reason.
// - All downtime reasons are `unplanned` (PO 2026-10-03): the sheet only has
//   faults and alarms; planned stops and small stops are classed by hand.
// - A register and its numbered twin (`NG_Seal_Overload`, `NG_Seal_Overload_2`)
//   are one reason, as F-04 §9.7's own example says.
// - Reject totals (Total_NG_Prod, NG_Condition_Count, Reject_Count) count every
//   reject, not one cause: they get no reason.
// - A `reject_reason` occurrence signal (Defective_Print, Empty_Sachet, PO
//   2026-10-03) names one cause, so it points at its reject reason too.

import { and, eq, inArray, like } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assetTagTable, downtimeReasonTable, rejectReasonTable } from "./schema/schema.js";

import type { PlannedTag } from "./seed-fi2-nodes.js";

const REJECT_TOTALS = new Set(["Total_NG_Prod", "NG_Condition_Count", "Reject_Count"]);

/** Readable names where the register name says too little. */
const REJECT_NAMES: Record<string, string> = {
  NG_Over_Count: "Overweight",
  NG_Under_Count: "Underweight",
};

/** One reason per register, its numbered twin folded in: `X_2` → `X`. */
function reasonKey(tagName: string): string {
  return tagName.replace(/_+$/, "").replace(/_2$/, "");
}

const code = (key: string) => key.toUpperCase();
const words = (key: string) => key.replaceAll("_", " ").replace(/\s+/g, " ").trim();
const downtimeId = (key: string) => `dr-${key.toLowerCase()}`;
const rejectId = (key: string) => `rr-${key.toLowerCase()}`;

function rejectName(key: string): string {
  return REJECT_NAMES[key] ?? words(key.replace(/^NG_/, ""));
}

/** A per-cause `reject` register, or a `reject_reason` occurrence signal. */
function isPerCauseReject(tag: Pick<PlannedTag, "tagName" | "tagRole">): boolean {
  if (tag.tagRole === "reject_reason") return true;
  return tag.tagRole === "reject" && !REJECT_TOTALS.has(tag.tagName);
}

/** The reason a seeded tag points at, or "" when its role carries none. */
function reasonOf(tag: Pick<PlannedTag, "tagName" | "tagRole">): {
  downtimeReasonId: string;
  rejectReasonId: string;
} {
  const key = reasonKey(tag.tagName);
  if (tag.tagRole === "downtime_reason")
    return { downtimeReasonId: downtimeId(key), rejectReasonId: "" };
  if (isPerCauseReject(tag)) return { downtimeReasonId: "", rejectReasonId: rejectId(key) };
  return { downtimeReasonId: "", rejectReasonId: "" };
}

/**
 * Writes the reasons the planned tags carry and points each tag at its
 * reason. Run after the tags are inserted.
 */
export async function seedFi2Reasons(
  db: NodePgDatabase,
  region: string,
  tenantId: string,
  tags: ReadonlyArray<PlannedTag>,
): Promise<{ downtime: number; reject: number }> {
  const downtime = new Map<string, string>();
  const reject = new Map<string, string>();
  for (const tag of tags) {
    const key = reasonKey(tag.tagName);
    if (tag.tagRole === "downtime_reason") downtime.set(key, words(key));
    else if (isPerCauseReject(tag)) reject.set(key, rejectName(key));
  }

  await db
    .delete(downtimeReasonTable)
    .where(and(eq(downtimeReasonTable.tenantId, tenantId), like(downtimeReasonTable.id, "dr-%")));
  await db
    .delete(rejectReasonTable)
    .where(and(eq(rejectReasonTable.tenantId, tenantId), like(rejectReasonTable.id, "rr-%")));
  if (downtime.size) {
    await db.insert(downtimeReasonTable).values(
      [...downtime].map(([key, name]) => ({
        id: downtimeId(key),
        region,
        tenantId,
        code: code(key),
        name,
        downtimeCategory: "unplanned" as const,
      })),
    );
  }
  if (reject.size) {
    await db.insert(rejectReasonTable).values(
      [...reject].map(([key, name]) => ({
        id: rejectId(key),
        region,
        tenantId,
        code: code(key),
        name,
      })),
    );
  }

  // Point every tag at its reason (several registers may share one).
  const byReason = new Map<string, { column: "downtime" | "reject"; names: Set<string> }>();
  for (const tag of tags) {
    const { downtimeReasonId, rejectReasonId } = reasonOf(tag);
    const id = downtimeReasonId || rejectReasonId;
    if (!id) continue;
    const entry = byReason.get(id) ?? {
      column: downtimeReasonId ? ("downtime" as const) : ("reject" as const),
      names: new Set<string>(),
    };
    entry.names.add(tag.tagName);
    byReason.set(id, entry);
  }
  for (const [id, { column, names }] of byReason) {
    await db
      .update(assetTagTable)
      .set(column === "downtime" ? { downtimeReasonId: id } : { rejectReasonId: id })
      .where(
        and(
          eq(assetTagTable.region, region),
          eq(assetTagTable.tenantId, tenantId),
          column === "downtime"
            ? eq(assetTagTable.tagRole, "downtime_reason")
            : inArray(assetTagTable.tagRole, ["reject", "reject_reason"]),
          inArray(assetTagTable.tagName, [...names]),
        ),
      );
  }
  return { downtime: downtime.size, reject: reject.size };
}
