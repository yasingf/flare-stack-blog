import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth.table";

export const PianoScoresTable = sqliteTable(
  "piano_scores",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("piano_scores_user_hash").on(t.userId, t.hash),
    index("piano_scores_user_created").on(t.userId, t.createdAt),
  ],
);
