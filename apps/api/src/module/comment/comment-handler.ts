import { Hono } from "hono";

import { commentValidator } from "./comment-dto.js";
import { WebResponse } from "@molca/network";

import type { Comment, CommentList } from "./comment.js";
import type { TCommentService } from "./comment-service.js";
import type { AuthMiddleware, AuthEnv } from "@molca/mes";

type CommentHandlerDeps = {
  commentService: TCommentService;
  authMw: AuthMiddleware;
};

function createCommentHandler({ commentService, authMw }: CommentHandlerDeps) {
  const app = new Hono<AuthEnv>();
  app.use("*", authMw);

  app.get("/", commentValidator.list, async (c) => {
    const { page, size, q } = c.req.valid("query");
    const filter = {
      q,
    };
    const { items, meta } = await commentService.getPagedComment(page, size, filter);
    return c.json(WebResponse.builder<CommentList[]>().data(items).meta(meta).build(), 200);
  });

  app.post("/", commentValidator.create, async (c) => {
    const comment = c.req.valid("json");
    const userId = c.var.jwtPayload.sub!;
    const name = c.var.jwtPayload.name ?? c.var.jwtPayload.preferred_username ?? "Anonymous";
    const created = await commentService.createComment({ ...comment, userId, name });
    return c.json(WebResponse.builder<{ id: string }>().data(created).build(), 201);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const comment = await commentService.getComment(id);
    return c.json(WebResponse.builder<Comment>().data(comment).build(), 200);
  });

  app.put("/:id", commentValidator.update, async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const updated = await commentService.updateComment(id, patch);
    return c.json(WebResponse.builder<{ id: string }>().data(updated).build(), 200);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await commentService.deleteComment(id);
    return c.json(WebResponse.builder<string>().data(deleted).build(), 200);
  });

  return app;
}

export { createCommentHandler };
export type { CommentHandlerDeps };
