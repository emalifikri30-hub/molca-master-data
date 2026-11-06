import * as p from "drizzle-orm/pg-core";

import { masterData } from "../columns.js";
import { defaultColumns, defaultIndexes } from "./post-columns.js";

export const commentTable = masterData.table(
  "comments",
  {
    ...defaultColumns(),
    content: p.varchar({ length: 255 }).notNull(),
    userId: p.varchar("user_id", { length: 255 }).notNull(),
    postId: p.varchar("post_id", { length: 26 }).notNull(),
    name: p.varchar({ length: 255 }).notNull(),
  },
  (t) => [
    ...defaultIndexes(t, "comments"),
    p.index("comments_user_id_idx").on(t.userId),
    p.index("comments_post_id_idx").on(t.postId),
  ],
);
