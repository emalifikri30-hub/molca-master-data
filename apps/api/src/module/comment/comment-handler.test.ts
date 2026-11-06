import { createMiddleware } from "hono/factory";
import { describe, it, expect, vi } from "vite-plus/test";

import { createCommentHandler } from "./comment-handler.js";

import type { TCommentService } from "./comment-service.js";
import type { AuthMiddleware, AuthEnv } from "@molca/mes";

const authMw = createMiddleware<AuthEnv>(async (c, next) => {
  c.set("jwtPayload", { sub: "1", name: "Test User", resource_access: {} });
  await next();
}) as AuthMiddleware;

function makeApp() {
  const commentService = {
    getPagedComment: vi.fn(),
    getComment: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  } satisfies Record<keyof TCommentService, ReturnType<typeof vi.fn>>;

  const app = createCommentHandler({
    commentService: commentService as unknown as TCommentService,
    authMw,
  });
  return { app, commentService };
}

const JSON_HEADERS = { "content-type": "application/json" };

describe("GET /", () => {
  it("returns 200 with data and meta from the service", async () => {
    const { app, commentService } = makeApp();
    const meta = { page: 1, size: 10, totalElements: 1, totalPages: 1, first: true, last: true };
    commentService.getPagedComment.mockResolvedValue({ items: [{ id: "p1" }], meta });

    const res = await app.request("/?page=1&size=10");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual([{ id: "p1" }]);
    expect(body.meta).toEqual(meta);
    expect(commentService.getPagedComment).toHaveBeenCalledWith(1, 10, { q: undefined });
  });

  it("forwards the q filter when supplied", async () => {
    const { app, commentService } = makeApp();
    commentService.getPagedComment.mockResolvedValue({ items: [], meta: {} });

    await app.request("/?q=hello");
    expect(commentService.getPagedComment).toHaveBeenCalledWith(1, 10, { q: "hello" });
  });

  it("returns 400 when size exceeds the maximum", async () => {
    const { app, commentService } = makeApp();

    const res = await app.request("/?size=999");
    expect(res.status).toBe(400);
    expect(commentService.getPagedComment).not.toHaveBeenCalled();
  });
});

describe("comment /", () => {
  it("creates a post with an injected userId and returns 201", async () => {
    const { app, commentService } = makeApp();
    commentService.createComment.mockResolvedValue({ id: "new1" });

    const res = await app.request("/", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "hello", postId: "01KTYJYT0DNDDXXRNAR7GJHD67" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({ id: "new1" });
    expect(commentService.createComment).toHaveBeenCalledWith({
      content: "hello",
      userId: "1",
      postId: "01KTYJYT0DNDDXXRNAR7GJHD67",
      name: "Test User",
    });
  });

  it("returns 400 for an invalid body", async () => {
    const { app, commentService } = makeApp();

    const res = await app.request("/", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "", mediaUrl: "not-a-url" }),
    });

    expect(res.status).toBe(400);
    expect(commentService.createComment).not.toHaveBeenCalled();
  });
});

describe("GET /:id", () => {
  it("returns 200 with the post", async () => {
    const { app, commentService } = makeApp();
    commentService.getComment.mockResolvedValue({ id: "p1", content: "hi" });

    const res = await app.request("/p1");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "p1", content: "hi" });
    expect(commentService.getComment).toHaveBeenCalledWith("p1");
  });
});

describe("PUT /:id", () => {
  it("updates with a partial body and returns 200", async () => {
    const { app, commentService } = makeApp();
    commentService.updateComment.mockResolvedValue({ id: "p1" });

    const res = await app.request("/p1", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "edited" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "p1" });
    expect(commentService.updateComment).toHaveBeenCalledWith("p1", { content: "edited" });
  });
});

describe("DELETE /:id", () => {
  it('returns 200 with "ok"', async () => {
    const { app, commentService } = makeApp();
    commentService.deleteComment.mockResolvedValue("ok");

    const res = await app.request("/p1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBe("ok");
    expect(commentService.deleteComment).toHaveBeenCalledWith("p1");
  });
});
