import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listPostInputSchema = paginationSchema.extend({
  q: z.optional(z.string().transform((v) => (v === "" ? undefined : v))),
});

const createPostSchema = z.object({
  content: z.string().min(1),
  mediaUrl: z.url(),
});

const updatePostSchema = createPostSchema.partial();

const postValidator = {
  list: queryValidator(listPostInputSchema),
  create: jsonValidator(createPostSchema),
  update: jsonValidator(updatePostSchema),
};

export { postValidator };
