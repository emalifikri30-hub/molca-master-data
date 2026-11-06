import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  assetClassId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  manufacturer: z.string(),
  model: z.string(),
  attributes: z.record(z.string(), z.string()).default({}),
});

const updateSchema = createSchema.partial();

const deactivateSchema = z.object({
  validTo: z.string().min(1).optional(),
});

const assetTypesValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
  deactivate: jsonValidator(deactivateSchema),
};

export { assetTypesValidator };
