/**
 * 一次性运行的 slug 迁移模块
 *
 * 在部署后首次请求时，将生产数据库中所有旧格式的 slug
 * （文本 slug）备份到 legacy_slug 列，然后更新为基于 Feistel 编码的 8 位短 ID。
 *
 * 使用 KV 存储标记位来确保仅执行一次。
 * 该模块会在后台异步执行（waitUntil），不阻塞请求。
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { PostsTable } from "@/lib/db/schema/posts.table";
import { GuitarTabMetadataTable } from "@/lib/db/schema/guitar-tab-metadata.table";
import { encodeId, isShortId } from "@/lib/short-id";

const MIGRATION_KEY = "slug-migration:v2:done";

/**
 * 检查并执行 slug 迁移（幂等、仅执行一次）
 *
 * 流程：
 * 1. 备份旧文本 slug 到 legacy_slug 列（供 301 重定向使用）
 * 2. 将 slug 列更新为 encodeId(id) 格式的短 ID
 */
export async function runSlugMigrationIfNeeded(env: Env): Promise<void> {
  try {
    // 检查是否已经执行过
    const done = await env.KV.get(MIGRATION_KEY);
    if (done === "true") return;

    const db = getDb(env);

    // ── 迁移帖子 slug ──
    const posts = await db
      .select({ id: PostsTable.id, slug: PostsTable.slug })
      .from(PostsTable);

    let postsMigrated = 0;
    for (const post of posts) {
      if (!isShortId(post.slug)) {
        const shortId = encodeId(post.id);
        await db
          .update(PostsTable)
          .set({ slug: shortId, legacySlug: post.slug })
          .where(eq(PostsTable.id, post.id));
        postsMigrated++;
      }
    }

    // ── 迁移吉他谱 slug ──
    const tabs = await db
      .select({
        id: GuitarTabMetadataTable.id,
        slug: GuitarTabMetadataTable.slug,
      })
      .from(GuitarTabMetadataTable);

    let tabsMigrated = 0;
    for (const tab of tabs) {
      if (!tab.slug || !isShortId(tab.slug)) {
        const shortId = encodeId(tab.id);
        await db
          .update(GuitarTabMetadataTable)
          .set({ slug: shortId, legacySlug: tab.slug })
          .where(eq(GuitarTabMetadataTable.id, tab.id));
        tabsMigrated++;
      }
    }

    // 标记迁移完成（永不过期）
    await env.KV.put(MIGRATION_KEY, "true");

    console.log(
      JSON.stringify({
        message: "slug migration completed",
        postsMigrated,
        tabsMigrated,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "slug migration failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
