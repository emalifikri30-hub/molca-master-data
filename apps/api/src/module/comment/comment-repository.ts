import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";

import { commentTable } from "../../shared/database/schema/schema.js";

import type {
  CreateComment,
  ListCommentInput,
  PagedComment,
  Comment,
  UpdateComment,
} from "./comment.js";
import type { PostgresDB } from "../../shared/database/postgres.js";

type CommentReaderRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

type CommentWriterRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

type CommentReader = {
  paginateComment: (input: ListCommentInput) => Promise<PagedComment>;
  getComment: (id: string) => Promise<Comment | undefined>;
  existById: (id: string) => Promise<boolean>;
  findSummariesByIds: (ids: string[]) => Promise<Comment[]>;
  findByPostId: (postId: string) => Promise<Comment[]>;
};

type CommentWriter = {
  createComment: (comment: CreateComment) => Promise<{ id: string }>;
  updateComment: (id: string, patch: UpdateComment) => Promise<{ id: string }>;
  deleteComment: (id: string) => Promise<void>;
};

class CommentReaderRepository implements CommentReader {
  private region: string;
  private db: PostgresDB;

  constructor({ db, region }: CommentReaderRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  async paginateComment({ limit, offset, filter }: ListCommentInput): Promise<PagedComment> {
    const baseConds = [eq(commentTable.region, this.region)];

    if (filter.q !== undefined) {
      const pattern = `%${filter.q}%`;
      const qOr = or(ilike(commentTable.content, pattern));
      if (qOr !== undefined) baseConds.push(qOr);
    }

    const where = and(...baseConds);
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: commentTable.id,
          content: commentTable.content,
          userId: commentTable.userId,
          postId: commentTable.postId,
          name: commentTable.name,
          createdAt: commentTable.createdAt,
        })
        .from(commentTable)
        .where(where)
        .orderBy(desc(commentTable.createdAt), asc(commentTable.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count(commentTable.id) })
        .from(commentTable)
        .where(where),
    ]);

    return { items: rows, totalElements: totals[0]?.value ?? 0 };
  }

  async getComment(id: string): Promise<Comment | undefined> {
    return await this.db.query.commentTable.findFirst({
      where: { id, region: this.region },
    });
  }

  async existById(id: string): Promise<boolean> {
    const comment = await this.db.query.commentTable.findFirst({
      where: { id, region: this.region },
    });
    return !!comment;
  }

  async findSummariesByIds(ids: string[]): Promise<Comment[]> {
    return await this.db.query.commentTable.findMany({
      where: {
        id: {
          in: ids,
        },
        region: this.region,
      },
    });
  }

  async findByPostId(postId: string): Promise<Comment[]> {
    return await this.db.query.commentTable.findMany({
      where: { postId, region: this.region },
    });
  }
}

class CommentWriterRepository implements CommentWriter {
  private region: string;
  private db: PostgresDB;

  constructor({ db, region }: CommentWriterRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  async createComment(comment: CreateComment): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(commentTable)
      .values({
        content: comment.content,
        region: this.region,
        userId: comment.userId,
        postId: comment.postId,
        name: comment.name,
      })
      .returning({
        id: commentTable.id,
      });

    return row;
  }

  async updateComment(id: string, patch: UpdateComment): Promise<{ id: string }> {
    const [row] = await this.db
      .update(commentTable)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(and(eq(commentTable.id, id), eq(commentTable.region, this.region)))
      .returning({
        id: commentTable.id,
      });

    return row;
  }

  async deleteComment(id: string): Promise<void> {
    await this.db
      .delete(commentTable)
      .where(and(eq(commentTable.id, id), eq(commentTable.region, this.region)));
  }
}

export { CommentReaderRepository, CommentWriterRepository };
export type {
  CommentReader,
  CommentWriter,
  CommentReaderRepositoryDeps,
  CommentWriterRepositoryDeps,
};
