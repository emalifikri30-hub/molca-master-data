import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  workCenterId: z.string().min(1),
  fromWorkUnitId: z.string().min(1),
  toWorkUnitId: z.string().min(1),
});

const updateSchema = createSchema.partial();

const equipmentFlowsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { equipmentFlowsValidator };
