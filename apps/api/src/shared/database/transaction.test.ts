import { describe, expect, it } from "vite-plus/test";

import { captureWrite, runAudited } from "../audit/audit-context.js";
import { connection, createTransact } from "./transaction.js";

import type { AuditActor, AuditContext } from "../audit/audit-context.js";
import type { PostgresDB } from "./postgres.js";

const ACTOR: AuditActor = { type: "user", subjectId: "s", displayName: "S", source: "ui" };

/** A db double whose `transaction` hands out a distinct tx object. */
function fakeDb() {
  const calls: string[] = [];
  const tx = { name: "tx" };
  const db = {
    name: "db",
    transaction: async <T>(fn: (t: unknown) => Promise<T>) => {
      calls.push("begin");
      try {
        const out = await fn(tx);
        calls.push("commit");
        return out;
      } catch (err) {
        calls.push("rollback");
        throw err;
      }
    },
  };
  return { db: db as unknown as PostgresDB, tx, calls };
}

describe("transact", () => {
  it("reads through the open transaction inside, the db outside", async () => {
    const { db, tx, calls } = fakeDb();
    const transact = createTransact(db);
    expect(connection(db)).toBe(db);
    const seen = await transact(async () => connection(db));
    expect(seen).toBe(tx);
    expect(calls).toEqual(["begin", "commit"]);
  });

  it("joins an outer transaction instead of opening a second one", async () => {
    const { db, calls } = fakeDb();
    const transact = createTransact(db);
    await transact(() => transact(async () => undefined));
    expect(calls).toEqual(["begin", "commit"]);
  });

  it("rolls back when the work throws", async () => {
    const { db, calls } = fakeDb();
    const transact = createTransact(db);
    await expect(
      transact(async () => {
        throw new Error("half-way");
      }),
    ).rejects.toThrow("half-way");
    expect(calls).toEqual(["begin", "rollback"]);
  });

  it("opens a savepoint inside an open transaction when asked", async () => {
    const calls: string[] = [];
    const savepoint = { name: "savepoint" };
    const tx = {
      name: "tx",
      transaction: async <T>(fn: (t: unknown) => Promise<T>) => {
        calls.push("savepoint");
        return fn(savepoint);
      },
    };
    const db = {
      transaction: async <T>(fn: (t: unknown) => Promise<T>) => {
        calls.push("begin");
        return fn(tx);
      },
    } as unknown as PostgresDB;
    const transact = createTransact(db);
    const seen = await transact(() => transact(async () => connection(db), { savepoint: true }));
    expect(seen).toBe(savepoint);
    expect(calls).toEqual(["begin", "savepoint"]);
  });

  it("forgets the audit writes of a rolled-back savepoint", async () => {
    const tx = { transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn({}) };
    const db = {
      transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx),
    } as unknown as PostgresDB;
    const transact = createTransact(db);
    const context: AuditContext = { actor: ACTOR, reason: "", writes: [], actions: new Map() };
    await runAudited(context, () =>
      transact(async () => {
        captureWrite({ table: "area", kind: "insert", before: null, after: { id: "kept" } });
        await transact(
          async () => {
            captureWrite({ table: "area", kind: "insert", before: null, after: { id: "lost" } });
            throw new Error("date failed");
          },
          { savepoint: true },
        ).catch(() => undefined);
      }),
    );
    expect(context.writes.map((w) => w.after?.id)).toEqual(["kept"]);
  });
});
