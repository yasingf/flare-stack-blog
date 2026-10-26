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
    composer: text("composer").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("piano_scores_user_hash").on(t.userId, t.hash),
    index("piano_scores_user_created").on(t.userId, t.createdAt),
  ],
);

export const PianoSharingConsentsTable = sqliteTable("piano_sharing_consents", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  acceptedAt: integer("accepted_at").notNull(),
});
