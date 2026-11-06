import { createMiddleware } from "hono/factory";
import { describe, it, expect, vi } from "vite-plus/test";

import { createPostHandler } from "./post-handler.js";

import type { TPostService } from "./post-service.js";
import type { AuthMiddleware, AuthEnv } from "@molca/mes";

const authMw = createMiddleware<AuthEnv>(async (c, next) => {
  c.set("jwtPayload", { sub: "1", name: "Test User", resource_access: {} });
  await next();
}) as AuthMiddleware;

function makeApp() {
  const postService = {
    getPagedPost: vi.fn(),
    getPost: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
  } satisfies Record<keyof TPostService, ReturnType<typeof vi.fn>>;

  const app = createPostHandler({ postService: postService as unknown as TPostService, authMw });
  return { app, postService };
}

const JSON_HEADERS = { "content-type": "application/json" };

describe("GET /", () => {
  it("returns 200 with data and meta from the service", async () => {
    const { app, postService } = makeApp();
    const meta = { page: 1, size: 10, totalElements: 1, totalPages: 1, first: true, last: true };
    postService.getPagedPost.mockResolvedValue({ items: [{ id: "p1" }], meta });

    const res = await app.request("/?page=1&size=10");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual([{ id: "p1" }]);
    expect(body.meta).toEqual(meta);
    expect(postService.getPagedPost).toHaveBeenCalledWith(1, 10, { q: undefined });
  });

  it("forwards the q filter when supplied", async () => {
    const { app, postService } = makeApp();
    postService.getPagedPost.mockResolvedValue({ items: [], meta: {} });

    await app.request("/?q=hello");
    expect(postService.getPagedPost).toHaveBeenCalledWith(1, 10, { q: "hello" });
  });

  it("returns 400 when size exceeds the maximum", async () => {
    const { app, postService } = makeApp();

    const res = await app.request("/?size=999");
    expect(res.status).toBe(400);
    expect(postService.getPagedPost).not.toHaveBeenCalled();
  });
});

describe("POST /", () => {
  it("creates a post with an injected userId and returns 201", async () => {
    const { app, postService } = makeApp();
    postService.createPost.mockResolvedValue({ id: "new1" });

    const res = await app.request("/", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "hello", mediaUrl: "https://x.test/a.png" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual({ id: "new1" });
    expect(postService.createPost).toHaveBeenCalledWith({
      content: "hello",
      mediaUrl: "https://x.test/a.png",
      userId: "1",
      name: "Test User",
    });
  });

  it("returns 400 for an invalid body", async () => {
    const { app, postService } = makeApp();

    const res = await app.request("/", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "", mediaUrl: "not-a-url" }),
    });

    expect(res.status).toBe(400);
    expect(postService.createPost).not.toHaveBeenCalled();
  });
});

describe("GET /:id", () => {
  it("returns 200 with the post", async () => {
    const { app, postService } = makeApp();
    postService.getPost.mockResolvedValue({ id: "p1", content: "hi" });

    const res = await app.request("/p1");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "p1", content: "hi" });
    expect(postService.getPost).toHaveBeenCalledWith("p1");
  });
});

describe("PUT /:id", () => {
  it("updates with a partial body and returns 200", async () => {
    const { app, postService } = makeApp();
    postService.updatePost.mockResolvedValue({ id: "p1" });

    const res = await app.request("/p1", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ content: "edited" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "p1" });
    expect(postService.updatePost).toHaveBeenCalledWith("p1", { content: "edited" });
  });
});

describe("DELETE /:id", () => {
  it('returns 200 with "ok"', async () => {
    const { app, postService } = makeApp();
    postService.deletePost.mockResolvedValue("ok");

    const res = await app.request("/p1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBe("ok");
    expect(postService.deletePost).toHaveBeenCalledWith("p1");
  });
});
