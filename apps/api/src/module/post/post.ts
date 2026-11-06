import type { Paged } from "@molca/network";
import type { CommentSummary } from "@molca/contract-client";

type Post = {
  id: string;
  content: string;
  mediaUrl: string;
  name: string;
  userId: string;
  region: string;
  createdAt: Date;
  updatedAt: Date;
};

// A single post enriched with its comments, fetched in-process through the
// CommentClientContract (never by importing the comment module directly).
type PostWithComments = Post & {
  comments: CommentSummary[];
};

type PostList = Omit<Post, "updatedAt" | "region">;

type PostFilter = {
  q?: string;
};

type ListPostInput = {
  limit: number;
  offset: number;
  filter: PostFilter;
};

type PagedPost = Paged<PostList>;

type CreatePost = {
  content: string;
  mediaUrl: string;
  userId: string;
  name: string;
};

type UpdatePost = Partial<Omit<CreatePost, "userId">>;

export type {
  Post,
  PostWithComments,
  PostList,
  PostFilter,
  ListPostInput,
  PagedPost,
  CreatePost,
  UpdatePost,
};
