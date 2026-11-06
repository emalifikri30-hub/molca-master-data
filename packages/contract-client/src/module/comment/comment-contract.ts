import type { CommentPartialFetch, CommentSummary } from "./comment-dto.js";

type CommentClientContract = {
  exists(commentId: string): Promise<boolean>;
  getMany(commentIds: string[]): Promise<CommentPartialFetch<CommentSummary>>;
  getManyByPostId(postId: string): Promise<CommentSummary[]>;
};

export type { CommentClientContract };
