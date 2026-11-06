import { asClass, type AwilixContainer } from "awilix";

import { PostReaderRepository, PostWriterRepository } from "./post-repository.js";
import { PostService } from "./post-service.js";

function registerPost(container: AwilixContainer) {
  container.register({
    postReaderRepository: asClass(PostReaderRepository).scoped(),
    postWriterRepository: asClass(PostWriterRepository).scoped(),
    postService: asClass(PostService).scoped(),
  });
}

export { registerPost };
