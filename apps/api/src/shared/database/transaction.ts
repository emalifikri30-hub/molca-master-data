import { AsyncLocalStorage } from "node:async_hooks";

import { currentAudit } from "../audit/audit-context.js";

import type { PostgresDB } from "./postgres.js";

/**
 * The open transaction for the current async call chain, if any. Repositories
 * read through `connection(db)`, so a store joins a transaction without a
 * `tx` argument on every method.
 */
const ambient = new AsyncLocalStorage<PostgresDB>();

/** The open transaction, or `db` when none is open. */
function connection(db: PostgresDB): PostgresDB {
  return ambient.getStore() ?? db;
}

type TransactOptions = {
  /**
   * Inside an open transaction, run `work` in a SAVEPOINT: if it throws, only
   * its own writes roll back and the outer transaction carries on. Without
   * it, a failed query would leave the whole transaction unusable.
   */
  savepoint?: boolean;
};

/**
 * Runs `work` so that all of its writes commit together or not at all.
 * A nested call joins the outer transaction (or opens a savepoint when asked).
 * Throwing rolls back.
 */
type Transact = <T>(work: () => Promise<T>, options?: TransactOptions) => Promise<T>;

function createTransact(db: PostgresDB): Transact {
  return async <T>(work: () => Promise<T>, options: TransactOptions = {}): Promise<T> => {
    const open = ambient.getStore();
    if (open && !options.savepoint) return work();
    // drizzle turns a transaction opened on a transaction into a SAVEPOINT.
    const base = open ?? db;
    // Writes captured for the audit inside a rolled-back savepoint never
    // happened: drop them so they get no audit row.
    const audit = currentAudit();
    const mark = audit?.writes.length ?? 0;
    try {
      return await base.transaction((tx) => ambient.run(tx as unknown as PostgresDB, work));
    } catch (err) {
      if (audit) audit.writes.length = mark;
      throw err;
    }
  };
}

/** For services built without a database (unit tests with in-memory stores): runs `work` as is. */
const noTransaction: Transact = (work) => work();

export { connection, createTransact, noTransaction };
export type { Transact, TransactOptions };
