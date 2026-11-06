import { auditedTable, str } from "./audit-entities.js";
import { scopeHint } from "./audit-scope.js";

import type { AuditChange, CreateAuditLog } from "../../module/mes/audit-log/audit-log.js";
import type { AuditContext, CapturedWrite, Row } from "./audit-context.js";
import type { AuditedTable } from "./audit-entities.js";

/** Not business fields: never listed in `changes` (dates go to effective_from/to). */
const NOT_CHANGES = new Set([
  "id",
  "region",
  "createdAt",
  "updatedAt",
  "validFrom",
  "validTo",
  "deletedAt",
]);

/** The column that ends a record: `valid_to`, or `deleted_at` on the reason tables. */
function endField(row: Row): "validTo" | "deletedAt" | null {
  if ("validTo" in row) return "validTo";
  if ("deletedAt" in row) return "deletedAt";
  return null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Every business field that changed; `create` lists every field with `before` empty. */
function diff(before: Row | null, after: Row | null): AuditChange[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (NOT_CHANGES.has(field)) continue;
    const from = before?.[field] ?? null;
    const to = after?.[field] ?? null;
    if (!same(from, to)) changes.push({ field, before: from, after: to });
  }
  return changes;
}

/** A child row as it reads inside its parent's change: its business fields only. */
function summary(row: Row, parentField: string): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (NOT_CHANGES.has(key) || key === parentField) continue;
    out[key] = value;
  }
  return out;
}

const dateOf = (value: unknown): string | null => (value == null ? null : str(value).slice(0, 10));

type Write = CapturedWrite & { config: AuditedTable };

/** One row's writes in this request folded into one: first `before`, last `after`. */
function merge(writes: Write[]): Write[] {
  const byRow = new Map<string, Write>();
  const out: Write[] = [];
  for (const write of writes) {
    const id = str((write.after ?? write.before)?.id);
    const key = `${write.table}|${id}`;
    const seen = byRow.get(key);
    if (!seen) {
      const copy = { ...write };
      byRow.set(key, copy);
      out.push(copy);
      continue;
    }
    if (seen.kind === "insert" && write.kind === "delete") {
      // Created and removed in one save: nothing to record.
      out.splice(out.indexOf(seen), 1);
      byRow.delete(key);
      continue;
    }
    // Insert then update stays an insert; update then delete becomes a delete.
    seen.after = write.after;
    if (write.kind === "delete") seen.kind = "delete";
  }
  return out;
}

const isClose = (w: Write) => {
  if (w.kind !== "update" || !w.before || !w.after) return false;
  const field = endField(w.after);
  return field !== null && w.before[field] == null && w.after[field] != null;
};

const isReopen = (w: Write) => {
  if (w.kind !== "update" || !w.before || !w.after) return false;
  const field = endField(w.after);
  return field !== null && w.before[field] != null && w.after[field] == null;
};

function entityTypeOf(config: AuditedTable, row: Row): string {
  return typeof config.entityType === "function" ? config.entityType(row) : config.entityType;
}

function codeOf(config: AuditedTable, row: Row): string {
  if (config.code) return config.code(row);
  return str(row.code ?? row.assetTag ?? row.tagName ?? row.name ?? row.label ?? row.id);
}

function siteOf(config: AuditedTable, row: Row): string | null {
  if (config.siteId) return config.siteId(row);
  return typeof row.siteId === "string" && row.siteId !== "" ? row.siteId : null;
}

/** An audit row plus the record it describes, so child changes can find their parent. */
type Built = { row: CreateAuditLog; record: Row };

function build(
  write: Write,
  action: string,
  record: Row,
  fields: Partial<CreateAuditLog>,
  context: AuditContext,
): Built {
  const { config, actor } = write;
  const entityType = entityTypeOf(config, record);
  const declared = context.actions.get(entityType);
  const finalAction = declared && (action === "update" || action === "create") ? declared : action;
  return {
    record,
    row: {
      action: finalAction,
      entityType,
      entityId: str(record.id),
      entityCode: codeOf(config, record),
      previousVersionEntityId: null,
      effectiveFrom: null,
      effectiveTo: null,
      changes: [],
      importBatchId: null,
      siteId: siteOf(config, record),
      scope: scopeHint(entityType, record),
      actorType: actor.type,
      actorSubjectId: actor.subjectId,
      actorDisplayName: actor.displayName,
      source: actor.source,
      reason: actor.type === "service" ? "" : context.reason,
      ...fields,
    },
  };
}

/** Rows for one table's writes: close + insert of one record = one `update` (F-14 §9.2). */
function tableRows(writes: Write[], context: AuditContext): Built[] {
  const { config } = writes[0];
  const closes = writes.filter(isClose);
  const inserts = writes.filter((w) => w.kind === "insert");
  const paired = new Map<Write, Write>();
  for (const insert of inserts) {
    const close = config.versionKey
      ? closes.find(
          (c) =>
            ![...paired.values()].includes(c) &&
            config.versionKey!(c.before!) === config.versionKey!(insert.after!),
        )
      : closes.length === 1 && inserts.length === 1
        ? closes[0]
        : undefined;
    if (close) paired.set(insert, close);
  }
  const closedByEdit = new Set(paired.values());

  const out: Built[] = [];
  for (const write of writes) {
    if (closedByEdit.has(write)) continue;
    const before = write.before;
    const after = write.after;
    if (write.kind === "insert" && after) {
      const close = paired.get(write);
      if (close?.before && close.after) {
        const end = endField(close.after);
        out.push(
          build(
            write,
            "update",
            after,
            {
              previousVersionEntityId: str(close.before.id),
              effectiveFrom: dateOf(after.validFrom),
              effectiveTo: end ? dateOf(close.after[end]) : null,
              changes: diff(close.before, after),
            },
            context,
          ),
        );
      } else {
        out.push(
          build(
            write,
            "create",
            after,
            { effectiveFrom: dateOf(after.validFrom), changes: diff(null, after) },
            context,
          ),
        );
      }
    } else if (write.kind === "delete" && before) {
      out.push(build(write, "delete", before, { changes: diff(before, null) }, context));
    } else if (before && after) {
      const end = endField(after);
      if (isClose(write)) {
        out.push(
          build(
            write,
            "deactivate",
            after,
            { effectiveTo: end ? dateOf(after[end]) : null, changes: diff(before, after) },
            context,
          ),
        );
      } else if (isReopen(write)) {
        out.push(build(write, "reactivate", after, { changes: diff(before, after) }, context));
      } else {
        const changes = diff(before, after);
        // A write that changed no business field (only a timestamp) records nothing.
        if (changes.length > 0) out.push(build(write, "update", after, { changes }, context));
      }
    }
  }
  return out;
}

/**
 * Turns the writes one request made into its audit rows (F-14 §9.1–9.2).
 * Child-table writes (BOM lines, a step's checks) fold into one change on
 * their parent's row; a parent with no row of its own in this save gets an
 * `update` row carrying only that change.
 */
function buildAuditRows(context: AuditContext, transactionId: string): CreateAuditLog[] {
  const audited: Write[] = [];
  for (const write of context.writes) {
    const config = auditedTable(write.table);
    if (config) audited.push({ ...write, config });
  }

  const byTable = new Map<string, Write[]>();
  const children: Write[] = [];
  for (const write of merge(audited)) {
    if (write.config.rollUp) {
      children.push(write);
      continue;
    }
    const list = byTable.get(write.table) ?? [];
    list.push(write);
    byTable.set(write.table, list);
  }

  const built: Built[] = [];
  for (const writes of byTable.values()) built.push(...tableRows(writes, context));

  // Fold child writes into their parent: one {field, before: [...], after: [...]} each.
  const folded = new Map<string, { write: Write; field: string; before: Row[]; after: Row[] }>();
  for (const write of children) {
    const rollUp = write.config.rollUp!;
    const row = (write.after ?? write.before)!;
    const parentId = rollUp.parentId(row);
    const key = `${rollUp.entityType}|${parentId}|${rollUp.field}`;
    const entry = folded.get(key) ?? { write, field: rollUp.field, before: [], after: [] };
    const parentField = Object.keys(row).find((k) => row[k] === parentId) ?? "";
    if (write.before) entry.before.push(summary(write.before, parentField));
    if (write.after) entry.after.push(summary(write.after, parentField));
    folded.set(key, entry);
  }
  for (const [key, entry] of folded) {
    const [entityType, parentId] = key.split("|");
    const change: AuditChange = { field: entry.field, before: entry.before, after: entry.after };
    const parent = built.find(
      (b) =>
        b.row.entityType === entityType &&
        (str(b.record.id) === parentId || str(b.record.stepId) === parentId),
    );
    if (parent) {
      parent.row.changes = [...parent.row.changes, change];
      continue;
    }
    const declared = context.actions.get(entityType);
    const { actor } = entry.write;
    built.push({
      record: {},
      row: {
        action: declared ?? "update",
        entityType,
        entityId: parentId,
        entityCode: "",
        previousVersionEntityId: null,
        effectiveFrom: null,
        effectiveTo: null,
        changes: [change],
        importBatchId: null,
        siteId: null,
        actorType: actor.type,
        actorSubjectId: actor.subjectId,
        actorDisplayName: actor.displayName,
        source: actor.source,
        reason: actor.type === "service" ? "" : context.reason,
      },
    });
  }

  return built.map((b) => ({
    ...b.row,
    transactionId,
    // A draft edit needs no reason; a business action (release) still does, and so does every
    // row of a save that declares one (PRD-003 AUD-001 rule 5: the draft exception is the only
    // one). Releasing runs the draft check too, so the flag alone isn't enough.
    ...(context.draftEdit && context.actions.size === 0 && { reasonOptional: true }),
  }));
}

export { buildAuditRows, diff };
