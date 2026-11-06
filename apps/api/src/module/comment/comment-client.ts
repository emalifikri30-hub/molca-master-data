import { type Logger } from "@molca/utils";
import { baseLogger, getRequestContext } from "@molca/observability";
import { chunk } from "@molca/helper";

import type {
  CommentClientContract,
  CommentPartialFetch,
  CommentSummary,
} from "@molca/contract-client";
import type { CommentReader } from "./comment-repository.js";

type CommentClientDeps = {
  commentReaderRepository: CommentReader;
  logger?: Logger;
};

class CommentClient implements CommentClientContract {
  private commentReaderRepository: CommentReader;
  private fallbackLogger: Logger;

  constructor({ commentReaderRepository, logger }: CommentClientDeps) {
    this.commentReaderRepository = commentReaderRepository;
    this.fallbackLogger = logger ?? baseLogger;
  }

  private get logger(): Logger {
    return getRequestContext()?.logger ?? this.fallbackLogger;
  }

  async exists(commentId: string): Promise<boolean> {
    return this.commentReaderRepository.existById(commentId);
  }

  async getMany(commentIds: string[]): Promise<CommentPartialFetch<CommentSummary>> {
    const unique = [...new Set(commentIds)];
    const found: CommentSummary[] = [];

    for (const ids of chunk(unique, 1000)) {
      const rows = await this.commentReaderRepository.findSummariesByIds(ids);
      found.push(...rows);
    }

    const foundIds = new Set(found.map((s) => s.id));
    const missingIds = unique.filter((id) => !foundIds.has(id));

    return { found, missingIds };
  }

  async getManyByPostId(postId: string): Promise<CommentSummary[]> {
    return this.commentReaderRepository.findByPostId(postId);
  }
}

export { CommentClient };
