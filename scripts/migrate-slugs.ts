/*
 * @Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @Date: 2026-03-01 15:32:58
 * @LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @LastEditTime: 2026-03-01 17:37:36
 * @FilePath: /flare-stack-blog/scripts/migrate-slugs.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
#!/usr/bin/env bun
/**
 * 迁移脚本：将已有帖子和吉他谱的 slug 更新为 8 位短 ID
 *
 * 使用方式：bun scripts/migrate-slugs.ts
 */
import { Database } from "bun:sqlite";
import { encodeId } from "../src/lib/short-id";

const DB_PATH =
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/ce8341e6ae48dfc9312654cc8803cc26e90ab793a452aa86a8d6db0e1878bbd4.sqlite";

const db = new Database(DB_PATH);

// ── 迁移帖子 slug ──
console.log("=== 帖子 slug 迁移 ===");
const posts = db.query<{ id: number; slug: string; title: string }, []>(
  "SELECT id, slug, title FROM posts",
).all();

for (const post of posts) {
  const shortId = encodeId(post.id);
  if (post.slug === shortId) {
    console.log(`  [跳过] id=${post.id} slug 已为短 ID: ${shortId}`);
    continue;
  }
  db.run("UPDATE posts SET slug = ? WHERE id = ?", [shortId, post.id]);
  console.log(
    `  [更新] id=${post.id} "${post.title}" slug: "${post.slug}" → "${shortId}"`,
  );
}

// ── 迁移吉他谱 slug ──
console.log("\n=== 吉他谱 slug 迁移 ===");
const tabs = db.query<
  { id: number; slug: string | null; title: string; artist: string },
  []
>("SELECT id, slug, title, artist FROM guitar_tab_metadata").all();

for (const tab of tabs) {
  const shortId = encodeId(tab.id);
  if (tab.slug === shortId) {
    console.log(`  [跳过] id=${tab.id} slug 已为短 ID: ${shortId}`);
    continue;
  }
  db.run("UPDATE guitar_tab_metadata SET slug = ? WHERE id = ?", [
    shortId,
    tab.id,
  ]);
  console.log(
    `  [更新] id=${tab.id} "${tab.artist} - ${tab.title}" slug: "${tab.slug}" → "${shortId}"`,
  );
}

// ── 添加 view_count 列（如果不存在） ──
console.log("\n=== 添加 view_count 列 ===");
try {
  db.run(
    "ALTER TABLE guitar_tab_metadata ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0",
  );
  console.log("  [成功] 已添加 view_count 列");
} catch (e: unknown) {
  if (e instanceof Error && e.message.includes("duplicate column")) {
    console.log("  [跳过] view_count 列已存在");
  } else {
    throw e;
  }
}

console.log("\n✅ 迁移完成！");
db.close();
