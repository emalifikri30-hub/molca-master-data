import { describe, it, expect, vi, beforeEach } from "vite-plus/test";

import { CommentService } from "./comment-service.js";

import type { CommentReader, CommentWriter } from "./comment-repository.js";
import type { Comment } from "./comment.js";
import type { Logger } from "@molca/utils";

const POST: Comment = {
  id: "p1",
  content: "hello",
  userId: "u1",
  region: "sea",
  name: "test",
  postId: "1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService() {
  const reader = {
    paginateComment: vi.fn(),
    getComment: vi.fn(),
    existById: vi.fn(),
    findSummariesByIds: vi.fn(),
    findByPostId: vi.fn(),
  } satisfies Record<keyof CommentReader, ReturnType<typeof vi.fn>>;
  const writer = {
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  } satisfies Record<keyof CommentWriter, ReturnType<typeof vi.fn>>;
  const error = vi.fn();
  const withMetadata = vi.fn(() => ({ error }));
  const logger = { withMetadata } as unknown as Logger;

  const service = new CommentService({
    commentReaderRepository: reader as unknown as CommentReader,
    commentWriterRepository: writer as unknown as CommentWriter,
    logger,
  });

  return { service, reader, writer, logger, withMetadata, error };
}

describe("CommentService.getPagedComment", () => {
  it("translates page/size into limit/offset and returns paged meta", async () => {
    const { service, reader } = makeService();
    reader.paginateComment.mockResolvedValue({ items: [POST], totalElements: 25 });

    const out = await service.getPagedComment(2, 10, { q: "hi" });

    expect(reader.paginateComment).toHaveBeenCalledWith({
      limit: 10,
      offset: 10,
      filter: { q: "hi" },
    });
    expect(out.items).toEqual([POST]);
    expect(out.meta).toMatchObject({ page: 2, size: 10, totalElements: 25, totalPages: 3 });
  });

  it("uses a zero offset for the first page", async () => {
    const { service, reader } = makeService();
    reader.paginateComment.mockResolvedValue({ items: [], totalElements: 0 });

    await service.getPagedComment(1, 20, {});

    expect(reader.paginateComment).toHaveBeenCalledWith({ limit: 20, offset: 0, filter: {} });
  });
});

describe("CommentService.getComment", () => {
  it("returns the post when found", async () => {
    const { service, reader } = makeService();
    reader.getComment.mockResolvedValue(POST);

    expect(await service.getComment("p1")).toBe(POST);
  });

  it("throws a 404 HTTPException when not found", async () => {
    const { service, reader } = makeService();
    reader.getComment.mockResolvedValue(undefined);

    await expect(service.getComment("missing")).rejects.toMatchObject({
      status: 404,
      message: "comment not found",
    });
  });
});

describe("CommentService write operations", () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it("createComment delegates to the writer and returns the id", async () => {
    ctx.writer.createComment.mockResolvedValue({ id: "new1" });

    const input = { content: "hi", userId: "u1", name: "test", postId: "1" };
    const out = await ctx.service.createComment(input);

    expect(ctx.writer.createComment).toHaveBeenCalledWith(input);
    expect(out).toEqual({ id: "new1" });
  });

  it("updateComment delegates to the writer", async () => {
    ctx.writer.updateComment.mockResolvedValue({ id: "p1" });

    const out = await ctx.service.updateComment("p1", { content: "edited" });

    expect(ctx.writer.updateComment).toHaveBeenCalledWith("p1", { content: "edited" });
    expect(out).toEqual({ id: "p1" });
  });

  it('deleteComment returns "ok" on success', async () => {
    ctx.writer.deleteComment.mockResolvedValue(undefined);

    expect(await ctx.service.deleteComment("p1")).toBe("ok");
    expect(ctx.writer.deleteComment).toHaveBeenCalledWith("p1");
  });

  it("logs and rethrows when a write fails", async () => {
    const boom = new Error("db down");
    ctx.writer.createComment.mockRejectedValue(boom);

    await expect(
      ctx.service.createComment({ content: "hi", userId: "u1", postId: "1", name: "test" }),
    ).rejects.toBe(boom);

    expect(ctx.withMetadata).toHaveBeenCalledTimes(1);
    expect(ctx.withMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "comment_create",
        err: { name: "Error", message: "db down" },
      }),
    );
    expect(ctx.error).toHaveBeenCalledWith("comment_create");
  });
});
