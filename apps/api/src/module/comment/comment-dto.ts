import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listCommentInputSchema = paginationSchema.extend({
  q: z.optional(z.string().transform((v) => (v === "" ? undefined : v))),
});

const createCommentSchema = z.object({
  content: z.string().min(1),
  postId: z.string(),
});

const updateCommentSchema = createCommentSchema.partial();

const commentValidator = {
  list: queryValidator(listCommentInputSchema),
  create: jsonValidator(createCommentSchema),
  update: jsonValidator(updateCommentSchema),
};

export { commentValidator };
