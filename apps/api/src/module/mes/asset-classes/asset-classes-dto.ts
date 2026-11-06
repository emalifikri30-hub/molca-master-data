import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  parentClassId: z.string(),
});

const updateSchema = createSchema.partial();

const deactivateSchema = z.object({
  validTo: z.string().min(1).optional(),
});

const assetClassesValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
  deactivate: jsonValidator(deactivateSchema),
};

export { assetClassesValidator };
