import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";

import { postTable } from "../../shared/database/schema/schema.js";

import type { CreatePost, ListPostInput, PagedPost, Post, UpdatePost } from "./post.js";
import type { PostgresDB } from "../../shared/database/postgres.js";

type PostReader = {
  paginatePost: (input: ListPostInput) => Promise<PagedPost>;
  getPost: (id: string) => Promise<Post | undefined>;
};

type PostReaderRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

type PostWriterRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

type PostWriter = {
  createPost: (post: CreatePost) => Promise<{ id: string }>;
  updatePost: (id: string, patch: UpdatePost) => Promise<{ id: string }>;
  deletePost: (id: string) => Promise<void>;
};

class PostReaderRepository implements PostReader {
  private region: string;
  private db: PostgresDB;

  constructor({ db, region }: PostReaderRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  async paginatePost({ limit, offset, filter }: ListPostInput): Promise<PagedPost> {
    const baseConds = [eq(postTable.region, this.region)];

    if (filter.q !== undefined) {
      const pattern = `%${filter.q}%`;
      const qOr = or(ilike(postTable.content, pattern));
      if (qOr !== undefined) baseConds.push(qOr);
    }

    const where = and(...baseConds);
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: postTable.id,
          content: postTable.content,
          mediaUrl: postTable.mediaUrl,
          userId: postTable.userId,
          name: postTable.name,
          createdAt: postTable.createdAt,
        })
        .from(postTable)
        .where(where)
        .orderBy(desc(postTable.createdAt), asc(postTable.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count(postTable.id) })
        .from(postTable)
        .where(where),
    ]);

    return { items: rows, totalElements: totals[0]?.value ?? 0 };
  }

  async getPost(id: string): Promise<Post | undefined> {
    return await this.db.query.postTable.findFirst({
      where: { id, region: this.region },
    });
  }
}

class PostWriterRepository implements PostWriter {
  private region: string;
  private db: PostgresDB;

  constructor({ db, region }: PostWriterRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  async createPost(post: CreatePost): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(postTable)
      .values({
        content: post.content,
        mediaUrl: post.mediaUrl,
        region: this.region,
        userId: post.userId,
        name: post.name,
      })
      .returning({
        id: postTable.id,
      });

    return row;
  }

  async updatePost(id: string, patch: UpdatePost): Promise<{ id: string }> {
    const [row] = await this.db
      .update(postTable)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(and(eq(postTable.id, id), eq(postTable.region, this.region)))
      .returning({
        id: postTable.id,
      });

    return row;
  }

  async deletePost(id: string): Promise<void> {
    await this.db
      .delete(postTable)
      .where(and(eq(postTable.id, id), eq(postTable.region, this.region)));
  }
}

export { PostReaderRepository, PostWriterRepository };
export type { PostReader, PostWriter, PostReaderRepositoryDeps, PostWriterRepositoryDeps };
