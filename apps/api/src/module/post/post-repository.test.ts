import { describe, it, expect, vi } from "vite-plus/test";

import { PostReaderRepository, PostWriterRepository } from "./post-repository.js";

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
    query: { postTable: { findFirst } },
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

describe("PostReaderRepository", () => {
  it("paginatePost maps rows and total, forwarding limit/offset", async () => {
    const dataRows = [
      { id: "p1", content: "hi", mediaUrl: null, userId: "u1", createdAt: new Date() },
    ];
    const { db, rec } = makeReaderDb({ dataRows, countValue: 25 });
    const repo = new PostReaderRepository({ db, region: "sea" });

    const out = await repo.paginatePost({ limit: 10, offset: 20, filter: {} });

    expect(out.items).toEqual(dataRows);
    expect(out.totalElements).toBe(25);
    expect(rec.limit).toBe(10);
    expect(rec.offset).toBe(20);
  });

  it("paginatePost defaults total to 0 when the count row is missing", async () => {
    const { db } = makeReaderDb({ dataRows: [], countValue: 0 });
    const repo = new PostReaderRepository({ db, region: "sea" });

    const out = await repo.paginatePost({ limit: 10, offset: 0, filter: { q: "term" } });

    expect(out.items).toEqual([]);
    expect(out.totalElements).toBe(0);
  });

  it("getPost scopes the lookup by id and region", async () => {
    const post = { id: "p1", region: "sea" };
    const { db, findFirst } = makeReaderDb({ findFirst: post });
    const repo = new PostReaderRepository({ db, region: "sea" });

    const out = await repo.getPost("p1");

    expect(out).toBe(post);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "p1", region: "sea" } });
  });

  it("getPost returns undefined when not found", async () => {
    const { db } = makeReaderDb({ findFirst: undefined });
    const repo = new PostReaderRepository({ db, region: "sea" });

    expect(await repo.getPost("missing")).toBeUndefined();
  });
});

describe("PostWriterRepository", () => {
  it("createPost inserts with the configured region and returns the new id", async () => {
    const { db, rec } = makeWriterDb({ insertRow: { id: "new1" } });
    const repo = new PostWriterRepository({ db, region: "sea" });

    const out = await repo.createPost({
      content: "hi",
      mediaUrl: "https://x.test/a.png",
      userId: "u1",
      name: "test",
    });

    expect(out).toEqual({ id: "new1" });
    expect(rec.values).toMatchObject({
      content: "hi",
      mediaUrl: "https://x.test/a.png",
      userId: "u1",
      region: "sea",
    });
  });

  it("updatePost applies the patch and stamps updatedAt", async () => {
    const { db, rec } = makeWriterDb({ updateRow: { id: "p1" } });
    const repo = new PostWriterRepository({ db, region: "sea" });

    const out = await repo.updatePost("p1", { content: "edited" });

    expect(out).toEqual({ id: "p1" });
    expect(rec.set).toMatchObject({ content: "edited" });
    expect((rec.set as { updatedAt: unknown }).updatedAt).toBeInstanceOf(Date);
  });

  it("deletePost resolves without a return value", async () => {
    const { db, rec } = makeWriterDb({});
    const repo = new PostWriterRepository({ db, region: "sea" });

    await expect(repo.deletePost("p1")).resolves.toBeUndefined();
    expect(rec.where).toBeDefined();
  });
});
