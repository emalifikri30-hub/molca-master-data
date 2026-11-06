import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listSchema = paginationSchema;

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  validFrom: z.string().min(1),
});

const updateSchema = createSchema.partial().extend({
  validTo: z.string().nullable().optional(),
});

const enterpriseValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { enterpriseValidator };
