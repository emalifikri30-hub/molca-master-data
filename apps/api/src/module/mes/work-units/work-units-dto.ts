import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import {
  CODE_MAX_LENGTH,
  NAME_MAX_LENGTH,
  WORK_UNIT_CODE_CHARS_MESSAGE,
  WORK_UNIT_CODE_PATTERN,
} from "../site-hierarchy/hierarchy-rules.js";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  classId: z.string().optional(),
  code: z
    .string()
    .min(1)
    .max(CODE_MAX_LENGTH)
    .regex(WORK_UNIT_CODE_PATTERN, WORK_UNIT_CODE_CHARS_MESSAGE),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  workCenterId: z.string().min(1),
});

const updateSchema = createSchema.partial();

const workUnitsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { workUnitsValidator };
