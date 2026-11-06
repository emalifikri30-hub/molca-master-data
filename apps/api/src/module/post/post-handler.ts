import { Hono } from "hono";

import { postValidator } from "./post-dto.js";
import { WebResponse } from "@molca/network";

import type { PostWithComments, PostList } from "./post.js";
import type { TPostService } from "./post-service.js";
import type { AuthMiddleware, AuthEnv } from "@molca/mes";

type PostHandlerDeps = {
  postService: TPostService;
  authMw: AuthMiddleware;
};

function createPostHandler({ postService, authMw }: PostHandlerDeps) {
  const app = new Hono<AuthEnv>();
  app.use("*", authMw);

  app.get("/", postValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = {
      q,
    };
    const { items, meta } = await postService.getPagedPost(page, size, filter);
    return c.json(WebResponse.builder<PostList[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", postValidator.create, async (c) => {
    const post = c.req.valid("json");
    const userId = c.var.jwtPayload.sub!;
    const name = c.var.jwtPayload.name ?? c.var.jwtPayload.preferred_username ?? "Anonymous";
    const created = await postService.createPost({ ...post, userId, name });
    return c.json(WebResponse.builder<{ id: string }>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const post = await postService.getPost(id);
    return c.json(WebResponse.builder<PostWithComments>().data(post).build(), 200);
  });

  app.put("/:id", postValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await postService.updatePost(id, patch);
    return c.json(WebResponse.builder<{ id: string }>().data(updated).build(), 200);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await postService.deletePost(id);
    return c.json(WebResponse.builder<string>().data(deleted).build(), 200);
  });

  return app;
}

export { createPostHandler };
export type { PostHandlerDeps };
