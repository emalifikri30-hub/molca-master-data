import { describe, it, expect, vi } from "vite-plus/test";

import { CommentReaderRepository, CommentWriterRepository } from "./comment-repository.js";

import type { PostgresDB } from "../../shared/database/postgres.js";

// A minimal chainable/thenable stand-in for the drizzle query builder. Every
// builder method returns the same node, and awaiting the node resolves to the
// canned result for that query.
type Rec = Record<string, unknown>;

function thenableNode(result: unknown, rec: Rec, methods: string[]) {
  const node: Record<string, unknown> = {
    // Deliberately thenable to mimic drizzle's awaitable query builder.
    // eslint-disable-next-line unicorn/no-thenable
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const m of methods) {
    node[m] = (arg: unknown) => {
      if (arg !== undefined) rec[m] = arg;
      return node;
    };
  }
  return node;
}

function makeReaderDb(opts: { dataRows?: unknown[]; countValue?: number; findFirst?: unknown }) {
  const rec: Rec = {};
  const findFirst = vi.fn().mockResolvedValue(opts.findFirst);
  const db = {
    select: (projection: Record<string, unknown>) =>
      "value" in projection
        ? thenableNode([{ value: opts.countValue }], rec, ["from", "where"])
        : thenableNode(opts.dataRows ?? [], rec, ["from", "where", "orderBy", "limit", "offset"]),
    query: { commentTable: { findFirst } },
  };
  return { db: db as unknown as PostgresDB, rec, findFirst };
}

function makeWriterDb(opts: { insertRow?: unknown; updateRow?: unknown }) {
  const rec: Rec = {};
  const db = {
    insert: () => thenableNode([opts.insertRow], rec, ["values", "returning"]),
    update: () => thenableNode([opts.updateRow], rec, ["set", "where", "returning"]),
    delete: () => thenableNode(undefined, rec, ["where"]),
  };
  return { db: db as unknown as PostgresDB, rec };
}

describe("CommentReaderRepository", () => {
  it("paginateComment maps rows and total, forwarding limit/offset", async () => {
    const dataRows = [{ id: "p1", content: "hi", userId: "u1", createdAt: new Date() }];
    const { db, rec } = makeReaderDb({ dataRows, countValue: 25 });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    const out = await repo.paginateComment({ limit: 10, offset: 20, filter: {} });

    expect(out.items).toEqual(dataRows);
    expect(out.totalElements).toBe(25);
    expect(rec.limit).toBe(10);
    expect(rec.offset).toBe(20);
  });

  it("paginateComment defaults total to 0 when the count row is missing", async () => {
    const { db } = makeReaderDb({ dataRows: [], countValue: 0 });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    const out = await repo.paginateComment({ limit: 10, offset: 0, filter: { q: "term" } });

    expect(out.items).toEqual([]);
    expect(out.totalElements).toBe(0);
  });

  it("getComment scopes the lookup by id and region", async () => {
    const comment = { id: "p1", region: "sea" };
    const { db, findFirst } = makeReaderDb({ findFirst: comment });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    const out = await repo.getComment("p1");

    expect(out).toBe(comment);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "p1", region: "sea" } });
  });

  it("existById scopes the lookup by id and region", async () => {
    const comment = { id: "p1", region: "sea" };
    const { db, findFirst } = makeReaderDb({ findFirst: comment });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    const out = await repo.existById("p1");
    expect(out).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "p1", region: "sea" } });
  });

  it("getComment returns undefined when not found", async () => {
    const { db } = makeReaderDb({ findFirst: undefined });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    expect(await repo.getComment("missing")).toBeUndefined();
  });

  it("existById return false when not found", async () => {
    const { db, findFirst } = makeReaderDb({ findFirst: undefined });
    const repo = new CommentReaderRepository({ db, region: "sea" });

    const out = await repo.existById("p2");
    expect(out).toBe(false);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "p2", region: "sea" } });
  });
});

describe("CommentWriterRepository", () => {
  it("createComment inserts with the configured region and returns the new id", async () => {
    const { db, rec } = makeWriterDb({ insertRow: { id: "new1" } });
    const repo = new CommentWriterRepository({ db, region: "sea" });

    const out = await repo.createComment({
      content: "hi",
      userId: "u1",
      name: "test",
      postId: "1",
    });

    expect(out).toEqual({ id: "new1" });
    expect(rec.values).toMatchObject({
      content: "hi",
      userId: "u1",
      region: "sea",
    });
  });

  it("updateComment applies the patch and stamps updatedAt", async () => {
    const { db, rec } = makeWriterDb({ updateRow: { id: "p1" } });
    const repo = new CommentWriterRepository({ db, region: "sea" });

    const out = await repo.updateComment("p1", { content: "edited" });

    expect(out).toEqual({ id: "p1" });
    expect(rec.set).toMatchObject({ content: "edited" });
    expect((rec.set as { updatedAt: unknown }).updatedAt).toBeInstanceOf(Date);
  });

  it("deleteComment resolves without a return value", async () => {
    const { db, rec } = makeWriterDb({});
    const repo = new CommentWriterRepository({ db, region: "sea" });

    await expect(repo.deleteComment("p1")).resolves.toBeUndefined();
    expect(rec.where).toBeDefined();
  });
});
