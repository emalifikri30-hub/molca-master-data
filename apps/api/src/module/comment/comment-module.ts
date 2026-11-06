import { asClass, type AwilixContainer } from "awilix";

import { CommentReaderRepository, CommentWriterRepository } from "./comment-repository.js";
import { CommentService } from "./comment-service.js";
import { CommentClient } from "./comment-client.js";

function registerComment(container: AwilixContainer) {
  container.register({
    commentReaderRepository: asClass(CommentReaderRepository).scoped(),
    commentWriterRepository: asClass(CommentWriterRepository).scoped(),
    commentService: asClass(CommentService).scoped(),
    // In-process implementation of @molca/contract-client's CommentClientContract.
    // Other modules (e.g. post) depend on the contract, never on comment internals.
    commentClient: asClass(CommentClient).scoped(),
  });
}

export { registerComment };
