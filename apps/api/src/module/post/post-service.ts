import { HTTPException } from "hono/http-exception";

import { withLog, type Logger } from "@molca/utils";
import { buildPageMeta, type PagedResult } from "@molca/network";
import { baseLogger, getRequestContext } from "@molca/observability";

import { getPostsCreatedCounter } from "../../shared/observability/metrics.js";

import type { CommentClientContract } from "@molca/contract-client";
import type { CreatePost, PostWithComments, PostFilter, PostList, UpdatePost } from "./post.js";
import type { PostReader, PostWriter } from "./post-repository.js";

type PagedPostResult = PagedResult<PostList>;

type TPostService = {
  getPagedPost: (page: number, size: number, filter: PostFilter) => Promise<PagedPostResult>;
  getPost: (id: string) => Promise<PostWithComments>;
  createPost: (post: CreatePost) => Promise<{ id: string }>;
  updatePost: (id: string, patch: UpdatePost) => Promise<{ id: string }>;
  deletePost: (id: string) => Promise<string>;
};

type PostServiceDeps = {
  postReaderRepository: PostReader;
  postWriterRepository: PostWriter;
  // Injected from the shared container. In this monolith it resolves to the
  // in-process CommentClient; the post module only depends on the contract.
  commentClient: CommentClientContract;
  logger?: Logger;
};

class PostService implements TPostService {
  private postReaderRepository: PostReader;
  private postWriterRepository: PostWriter;
  private commentClient: CommentClientContract;
  private fallbackLogger: Logger;

  constructor({
    postReaderRepository,
    postWriterRepository,
    commentClient,
    logger,
  }: PostServiceDeps) {
    this.postReaderRepository = postReaderRepository;
    this.postWriterRepository = postWriterRepository;
    this.commentClient = commentClient;
    this.fallbackLogger = logger ?? baseLogger;
  }

  // Resolve the request-scoped logger (carrying x_trace_id + OTel trace ids)
  // from AsyncLocalStorage; fall back to the base logger outside a request.
  private get logger(): Logger {
    return getRequestContext()?.logger ?? this.fallbackLogger;
  }

  async getPagedPost(page: number, size: number, filter: PostFilter): Promise<PagedPostResult> {
    const limit = size;
    const offset = (page - 1) * limit;

    const { items, totalElements } = await this.postReaderRepository.paginatePost({
      limit,
      offset,
      filter,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async getPost(id: string): Promise<PostWithComments> {
    const post = await this.postReaderRepository.getPost(id);
    if (!post) throw new HTTPException(404, { message: "post not found" });
    // Enrich the post with its comments via the contract (in-process here).
    const comments = await this.commentClient.getManyByPostId(post.id);
    return { ...post, comments };
  }

  async createPost(post: CreatePost): Promise<{ id: string }> {
    const result = await withLog(
      this.logger,
      "post_create",
      {
        post,
      },
      () => this.postWriterRepository.createPost(post),
    );
    getPostsCreatedCounter().add(1);
    return result;
  }

  async updatePost(id: string, patch: UpdatePost): Promise<{ id: string }> {
    return withLog(
      this.logger,
      "post_update",
      {
        postId: id,
        post: patch,
      },
      () => this.postWriterRepository.updatePost(id, patch),
    );
  }

  async deletePost(id: string): Promise<string> {
    await withLog(
      this.logger,
      "post_delete",
      {
        postId: id,
      },
      () => this.postWriterRepository.deletePost(id),
    );

    return "ok";
  }
}

export { PostService };
export type { TPostService, PostServiceDeps };
