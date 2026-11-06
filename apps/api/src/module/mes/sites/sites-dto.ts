import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import {
  CODE_CHARS_MESSAGE,
  CODE_MAX_LENGTH,
  CODE_PATTERN,
  NAME_MAX_LENGTH,
  isIanaTimezone,
} from "../site-hierarchy/hierarchy-rules.js";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

const createSchema = z.object({
  classId: z.string().optional(),
  enterpriseId: z.string().min(1),
  code: z.string().min(1).max(CODE_MAX_LENGTH).regex(CODE_PATTERN, CODE_CHARS_MESSAGE),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  // Rule 3: required, and an IANA name — never a fixed offset like +07:00.
  timezone: z
    .string({ error: "Timezone is required" })
    .min(1, "Timezone is required")
    .refine(isIanaTimezone, "Timezone must be an IANA timezone name"),
});

const updateSchema = createSchema.partial();

const sitesValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { sitesValidator };
