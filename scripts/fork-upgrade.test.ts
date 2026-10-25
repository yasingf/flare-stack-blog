import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = resolve(import.meta.dirname, "../migrations");
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function apply(db: DatabaseSync, files: Array<string>) {
  for (const name of files)
    db.exec(readFileSync(resolve(directory, name), "utf8"));
}

describe("upgrade the deployed fork to upstream v3", () => {
  it("can initialize an empty database", () => {
    const db = new DatabaseSync(":memory:");
    try {
      apply(db, migrations);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('guitar_tab_metadata', 'guitar_tab_comments', 'posts', 'comments', 'post_revisions')",
          )
          .all(),
      ).toHaveLength(5);
    } finally {
      db.close();
    }
  });

  it("preserves posts, both comment threads, media, slugs, views, and legacy settings", () => {
    const db = new DatabaseSync(":memory:");
    try {
      apply(
        db,
        migrations.filter((name) => name < "0010"),
      );
      db.exec(`
        INSERT INTO user (id,name,email,updated_at) VALUES ('author','Author','author@example.com',1);
        INSERT INTO posts (id,title,slug,legacy_slug,content_json,status,published_at)
          VALUES (1,'Published','Abc12345','old-title','{"type":"doc","content":[{"type":"guitarPro","attrs":{"src":"/images/song.gp5","fileName":"Song"}}]}','published',1);
        INSERT INTO media (id,key,url,file_name,mime_type,size_in_bytes)
          VALUES (1,'song.gp5','/images/song.gp5','Song.gp5','application/x-guitar-pro',256);
        INSERT INTO guitar_tab_metadata (id,media_id,title,slug,legacy_slug,uploader_id,status,view_count)
          VALUES (1,1,'Song','Def67890','old-song','author','approved',42);
        INSERT INTO comments (id,content,post_id,user_id,status)
          VALUES (1,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Post comment"}]}]}',1,'author','published');
        INSERT INTO comments (id,content,root_id,reply_to_comment_id,post_id,user_id,status)
          VALUES (2,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Post reply"}]}]}',1,1,1,'author','published');
        INSERT INTO comments (id,content,guitar_tab_id,user_id,status)
          VALUES (3,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Guitar comment"}]}]}',1,'author','published');
        INSERT INTO comments (id,content,root_id,reply_to_comment_id,guitar_tab_id,user_id,status)
          VALUES (4,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Guitar reply"}]}]}',3,3,1,'author','published');
        INSERT INTO system_config (id,config_json) VALUES (1,'{"email":{"apiKey":"legacy-test-key"},"seo":{"googleVerification":"verification-token"}}');
      `);
      apply(
        db,
        migrations.filter((name) => name >= "0010"),
      );
      expect(
        db
          .prepare(
            "SELECT id,content,root_id,reply_to_comment_id FROM comments ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: 1,
          content: "Post comment",
          root_id: null,
          reply_to_comment_id: null,
        },
        { id: 2, content: "Post reply", root_id: 1, reply_to_comment_id: 1 },
      ]);
      expect(
        db
          .prepare(
            "SELECT id,content,root_id,reply_to_comment_id FROM guitar_tab_comments ORDER BY id",
          )
          .all(),
      ).toEqual([
        {
          id: 3,
          content: "Guitar comment",
          root_id: null,
          reply_to_comment_id: null,
        },
        { id: 4, content: "Guitar reply", root_id: 3, reply_to_comment_id: 3 },
      ]);
      expect(
        db.prepare("SELECT slug,legacy_slug,public_slug FROM posts").get(),
      ).toEqual({
        slug: "Abc12345",
        legacy_slug: "old-title",
        public_slug: "Abc12345",
      });
      expect(
        db
          .prepare(
            "SELECT slug,legacy_slug,view_count FROM guitar_tab_metadata",
          )
          .get(),
      ).toEqual({ slug: "Def67890", legacy_slug: "old-song", view_count: 42 });
      const post = db
        .prepare("SELECT content_json, public_snapshot_json FROM posts")
        .get() as { content_json: string; public_snapshot_json: string };
      expect(JSON.parse(post.public_snapshot_json).contentJson).toEqual(
        JSON.parse(post.content_json),
      );
      expect(db.prepare("SELECT count(*) AS count FROM media").get()).toEqual({
        count: 1,
      });
      const config = db
        .prepare("SELECT config_json FROM system_config")
        .get() as { config_json: string };
      expect(JSON.parse(config.config_json).seo.googleVerification).toBe(
        "verification-token",
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
