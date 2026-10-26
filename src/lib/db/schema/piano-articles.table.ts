import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { PianoScoresTable } from "./piano-scores.table";
import { PostsTable } from "./posts.table";

export const PianoArticleSettingsTable = sqliteTable(
  "piano_article_settings",
  {
    id: integer("id").primaryKey().notNull().default(1),
    autoGenerate: integer("auto_generate", { mode: "boolean" })
      .notNull()
      .default(true),
  },
  (t) => [check("piano_article_settings_singleton", sql`${t.id} = 1`)],
);

export const PianoScoreArticlesTable = sqliteTable("piano_score_articles", {
  scoreId: text("score_id")
    .primaryKey()
    .references(() => PianoScoresTable.id, { onDelete: "cascade" }),
  postId: integer("post_id").references(() => PostsTable.id, {
    onDelete: "set null",
  }),
  requestedBy: text("requested_by").notNull(),
  requestId: text("request_id").notNull(),
  artistHint: text("artist_hint").notNull().default(""),
  status: text("status", {
    enum: ["queued", "running", "ready", "failed"],
  }).notNull(),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
