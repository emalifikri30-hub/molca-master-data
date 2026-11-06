import { AsyncLocalStorage } from "node:async_hooks";

/** Who made a write (F-14 §9.1 `actor_*`, `source`). */
type AuditActor = {
  type: "user" | "service";
  /** IDP `sub` of the person or the job's service account. */
  subjectId: string;
  displayName: string;
  source: "ui" | "import" | "api" | "system";
};

type Row = Record<string, unknown>;

/** One row a repository wrote, with what it looked like before and after. */
type CapturedWrite = {
  table: string;
  kind: "insert" | "update" | "delete";
  before: Row | null;
  after: Row | null;
  actor: AuditActor;
};

type AuditContext = {
  actor: AuditActor;
  /** The reason the person gave for this save (AU-2), "" when none. */
  reason: string;
  writes: CapturedWrite[];
  /** Business actions a service declared, by entity type (e.g. ROUTING → release). */
  actions: Map<string, string>;
  /**
   * The save edits a draft (a BOM or routing not yet in force): its rows are
   * audited, but the reason is optional; `release` still needs one (F-14
   * rule 5, PO 2026-10-03, docs-molcadx#85 item 1; AUD-001 AC-14).
   */
  draftEdit?: boolean;
};

const store = new AsyncLocalStorage<AuditContext>();

/** Runs `work` with a fresh audit context; repositories record their writes into it. */
function runAudited<T>(context: AuditContext, work: () => Promise<T>): Promise<T> {
  return store.run(context, work);
}

function currentAudit(): AuditContext | undefined {
  return store.getStore();
}

/** Called by repositories after each write. Outside a request (seed, tests) it does nothing. */
function captureWrite(write: Omit<CapturedWrite, "actor">): void {
  const context = store.getStore();
  if (context) context.writes.push({ ...write, actor: context.actor });
}

/**
 * Declares the business action of this save for one entity type (F-14
 * core concept 9), e.g. `release` for a routing: its rows are written with
 * that action instead of create/update.
 */
function declareAuditAction(entityType: string, action: string): void {
  store.getStore()?.actions.set(entityType, action);
}

/** Marks this save as an edit of a draft: reason optional, except for a business action. */
function markDraftEdit(): void {
  const context = store.getStore();
  if (context) context.draftEdit = true;
}

/**
 * Writes made inside `work` are attributed to `actor` — a system job run from
 * a request (the shift generator), audited as the job, not the person.
 */
function asActor<T>(actor: AuditActor, work: () => Promise<T>): Promise<T> {
  const context = store.getStore();
  if (!context) return work();
  return store.run({ ...context, actor }, work);
}

export { asActor, captureWrite, currentAudit, declareAuditAction, markDraftEdit, runAudited };
export type { AuditActor, AuditContext, CapturedWrite, Row };
