import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.table";
import { GuitarTabMetadataTable } from "./guitar-tab-metadata.table";
import { createdAt, id, updatedAt } from "./helper";

export const GuitarTabCommentsTable = sqliteTable(
  "guitar_tab_comments",
  {
    id,
    content: text(),
    rootId: integer("root_id").references(
      (): AnySQLiteColumn => GuitarTabCommentsTable.id,
      { onDelete: "cascade" },
    ),
    replyToCommentId: integer("reply_to_comment_id").references(
      (): AnySQLiteColumn => GuitarTabCommentsTable.id,
      { onDelete: "set null" },
    ),
    status: text().notNull().default("published"),
    guitarTabId: integer("guitar_tab_id")
      .notNull()
      .references(() => GuitarTabMetadataTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("guitar_comments_tab_created_idx").on(
      table.guitarTabId,
      table.createdAt,
    ),
  ],
);
