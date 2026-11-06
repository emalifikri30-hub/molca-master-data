import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

import { PostService } from "./post-service.js";

import type { PostReader, PostWriter } from "./post-repository.js";
import type { Post } from "./post.js";
import type { CommentClientContract } from "@molca/contract-client";
import type { Logger } from "@molca/utils";

const POST: Post = {
  id: "p1",
  content: "hello",
  mediaUrl: "https://google.com",
  userId: "u1",
  region: "sea",
  name: "test",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService() {
  const reader = {
    paginatePost: vi.fn(),
    getPost: vi.fn(),
  } satisfies Record<keyof PostReader, ReturnType<typeof vi.fn>>;
  const writer = {
    createPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
  } satisfies Record<keyof PostWriter, ReturnType<typeof vi.fn>>;
  const commentClient = {
    exists: vi.fn(),
    getMany: vi.fn(),
    getManyByPostId: vi.fn().mockResolvedValue([]),
  } satisfies Record<keyof CommentClientContract, ReturnType<typeof vi.fn>>;
  const error = vi.fn();
  const withMetadata = vi.fn(() => ({ error }));
  const logger = { withMetadata } as unknown as Logger;

  const service = new PostService({
    postReaderRepository: reader as unknown as PostReader,
    postWriterRepository: writer as unknown as PostWriter,
    commentClient: commentClient as unknown as CommentClientContract,
    logger,
  });

  return { service, reader, writer, commentClient, logger, withMetadata, error };
}

describe("PostService.getPagedPost", () => {
  it("translates page/size into limit/offset and returns paged meta", async () => {
    const { service, reader } = makeService();
    reader.paginatePost.mockResolvedValue({ items: [POST], totalElements: 25 });

    const out = await service.getPagedPost(2, 10, { q: "hi" });

    expect(reader.paginatePost).toHaveBeenCalledWith({
      limit: 10,
      offset: 10,
      filter: { q: "hi" },
    });
    expect(out.items).toEqual([POST]);
    expect(out.meta).toMatchObject({ page: 2, size: 10, totalElements: 25, totalPages: 3 });
  });

  it("uses a zero offset for the first page", async () => {
    const { service, reader } = makeService();
    reader.paginatePost.mockResolvedValue({ items: [], totalElements: 0 });

    await service.getPagedPost(1, 20, {});

    expect(reader.paginatePost).toHaveBeenCalledWith({ limit: 20, offset: 0, filter: {} });
  });
});

describe("PostService.getPost", () => {
  it("returns the post enriched with its comments when found", async () => {
    const { service, reader, commentClient } = makeService();
    reader.getPost.mockResolvedValue(POST);
    const comments = [{ id: "c1", name: "Ann", content: "nice post" }];
    commentClient.getManyByPostId.mockResolvedValue(comments);

    const out = await service.getPost("p1");

    expect(commentClient.getManyByPostId).toHaveBeenCalledWith("p1");
    expect(out).toEqual({ ...POST, comments });
  });

  it("throws a 404 HTTPException when not found", async () => {
    const { service, reader, commentClient } = makeService();
    reader.getPost.mockResolvedValue(undefined);

    await expect(service.getPost("missing")).rejects.toMatchObject({
      status: 404,
      message: "post not found",
    });
    expect(commentClient.getManyByPostId).not.toHaveBeenCalled();
  });
});

describe("PostService write operations", () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it("createPost delegates to the writer and returns the id", async () => {
    ctx.writer.createPost.mockResolvedValue({ id: "new1" });

    const input = { content: "hi", mediaUrl: "https://x.test/a.png", userId: "u1", name: "test" };
    const out = await ctx.service.createPost(input);

    expect(ctx.writer.createPost).toHaveBeenCalledWith(input);
    expect(out).toEqual({ id: "new1" });
  });

  it("updatePost delegates to the writer", async () => {
    ctx.writer.updatePost.mockResolvedValue({ id: "p1" });

    const out = await ctx.service.updatePost("p1", { content: "edited" });

    expect(ctx.writer.updatePost).toHaveBeenCalledWith("p1", { content: "edited" });
    expect(out).toEqual({ id: "p1" });
  });

  it('deletePost returns "ok" on success', async () => {
    ctx.writer.deletePost.mockResolvedValue(undefined);

    expect(await ctx.service.deletePost("p1")).toBe("ok");
    expect(ctx.writer.deletePost).toHaveBeenCalledWith("p1");
  });

  it("logs and rethrows when a write fails", async () => {
    const boom = new Error("db down");
    ctx.writer.createPost.mockRejectedValue(boom);

    await expect(
      ctx.service.createPost({
        content: "hi",
        mediaUrl: "https://molca.id",
        userId: "u1",
        name: "test",
      }),
    ).rejects.toBe(boom);

    expect(ctx.withMetadata).toHaveBeenCalledTimes(1);
    expect(ctx.withMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ event: "post_create", err: { name: "Error", message: "db down" } }),
    );
    expect(ctx.error).toHaveBeenCalledWith("post_create");
  });
});
