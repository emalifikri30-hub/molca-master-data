import * as p from "drizzle-orm/pg-core";

import { masterData } from "../columns.js";
import { defaultColumns, defaultIndexes } from "./post-columns.js";

export const postTable = masterData.table(
  "posts",
  {
    ...defaultColumns(),
    content: p.varchar({ length: 255 }).notNull(),
    mediaUrl: p.text().notNull(),
    userId: p.varchar("user_id", { length: 255 }).notNull(),
    name: p.varchar({ length: 255 }).notNull(),
  },
  (t) => [...defaultIndexes(t, "posts"), p.index("posts_user_id_idx").on(t.userId)],
);
