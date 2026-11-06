import { asClass, type AwilixContainer } from "awilix";

import { ProductsReaderRepository, ProductsWriterRepository } from "./products-repository.js";
import { ProductsService } from "./products-service.js";

function registerProducts(container: AwilixContainer) {
  container.register({
    productsReaderRepository: asClass(ProductsReaderRepository).scoped(),
    productsWriterRepository: asClass(ProductsWriterRepository).scoped(),
    productsService: asClass(ProductsService).scoped(),
  });
}

export { registerProducts };
