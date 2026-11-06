import { HTTPException } from "hono/http-exception";

import { withLog, type Logger } from "@molca/utils";
import { buildPageMeta, type PagedResult } from "@molca/network";
import { baseLogger, getRequestContext } from "@molca/observability";

import { getcommentsCreatedCounter } from "../../shared/observability/metrics.js";

import type {
  CreateComment,
  Comment,
  CommentFilter,
  CommentList,
  UpdateComment,
} from "./comment.js";
import type { CommentReader, CommentWriter } from "./comment-repository.js";

type PagedCommentResult = PagedResult<CommentList>;

type TCommentService = {
  getPagedComment: (
    page: number,
    size: number,
    filter: CommentFilter,
  ) => Promise<PagedCommentResult>;
  getComment: (id: string) => Promise<Comment>;
  createComment: (comment: CreateComment) => Promise<{ id: string }>;
  updateComment: (id: string, patch: UpdateComment) => Promise<{ id: string }>;
  deleteComment: (id: string) => Promise<string>;
};

type CommentServiceDeps = {
  commentReaderRepository: CommentReader;
  commentWriterRepository: CommentWriter;
  logger?: Logger;
};

class CommentService implements TCommentService {
  private commentReaderRepository: CommentReader;
  private commentWriterRepository: CommentWriter;
  private fallbackLogger: Logger;

  constructor({ commentReaderRepository, commentWriterRepository, logger }: CommentServiceDeps) {
    this.commentReaderRepository = commentReaderRepository;
    this.commentWriterRepository = commentWriterRepository;
    this.fallbackLogger = logger ?? baseLogger;
  }

  // Resolve the request-scoped logger (carrying x_trace_id + OTel trace ids)
  // from AsyncLocalStorage; fall back to the base logger outside a request.
  private get logger(): Logger {
    return getRequestContext()?.logger ?? this.fallbackLogger;
  }

  async getPagedComment(
    page: number,
    size: number,
    filter: CommentFilter,
  ): Promise<PagedCommentResult> {
    const limit = size;
    const offset = (page - 1) * limit;

    const { items, totalElements } = await this.commentReaderRepository.paginateComment({
      limit,
      offset,
      filter,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async getComment(id: string): Promise<Comment> {
    const comment = await this.commentReaderRepository.getComment(id);
    if (!comment) throw new HTTPException(404, { message: "comment not found" });
    return comment;
  }

  async createComment(comment: CreateComment): Promise<{ id: string }> {
    const result = await withLog(
      this.logger,
      "comment_create",
      {
        comment,
      },
      () => this.commentWriterRepository.createComment(comment),
    );
    getcommentsCreatedCounter().add(1);
    return result;
  }

  async updateComment(id: string, patch: UpdateComment): Promise<{ id: string }> {
    return withLog(
      this.logger,
      "comment_update",
      {
        commentId: id,
        comment: patch,
      },
      () => this.commentWriterRepository.updateComment(id, patch),
    );
  }

  async deleteComment(id: string): Promise<string> {
    await withLog(
      this.logger,
      "comment_delete",
      {
        commentId: id,
      },
      () => this.commentWriterRepository.deleteComment(id),
    );

    return "ok";
  }
}

export { CommentService };
export type { TCommentService, CommentServiceDeps };
