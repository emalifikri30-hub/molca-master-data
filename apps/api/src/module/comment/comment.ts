import type { Paged } from "@molca/network";

type Comment = {
  id: string;
  content: string;
  name: string;
  postId: string;
  userId: string;
  region: string;
  createdAt: Date;
  updatedAt: Date;
};

type CommentList = Omit<Comment, "updatedAt" | "region">;

type CommentFilter = {
  q?: string;
};

type ListCommentInput = {
  limit: number;
  offset: number;
  filter: CommentFilter;
};

type PagedComment = Paged<CommentList>;

type CreateComment = {
  content: string;
  userId: string;
  postId: string;
  name: string;
};

type UpdateComment = Partial<Omit<CreateComment, "userId" | "postId">>;

export type {
  Comment,
  CommentList,
  CommentFilter,
  ListCommentInput,
  PagedComment,
  CreateComment,
  UpdateComment,
};
