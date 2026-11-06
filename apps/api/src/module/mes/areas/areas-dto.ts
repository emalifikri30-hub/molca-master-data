import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import {
  CODE_CHARS_MESSAGE,
  CODE_MAX_LENGTH,
  CODE_PATTERN,
  NAME_MAX_LENGTH,
} from "../site-hierarchy/hierarchy-rules.js";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  classId: z.string().optional(),
  code: z.string().min(1).max(CODE_MAX_LENGTH).regex(CODE_PATTERN, CODE_CHARS_MESSAGE),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  siteId: z.string().min(1),
});

const updateSchema = createSchema.partial();

const areasValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { areasValidator };
