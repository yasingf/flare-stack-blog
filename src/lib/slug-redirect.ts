/**
 * 旧文本 slug → 新短 ID 永久重定向中间件
 *
 * 当用户访问旧格式的 URL（如 /post/珊瑚海 或 /guitar-tab/artist-title-hash）时，
 * 查询 legacy_slug 列找到对应记录，生成基于 ID 的短 ID URL，并返回 301 永久重定向。
 *
 * 对于新格式的短 ID URL 直接放行（next()），由 TanStack Router 处理。
 */

import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { isShortId, encodeId } from "@/lib/short-id";
import { getDb } from "@/lib/db";
import { PostsTable } from "@/lib/db/schema/posts.table";
import { GuitarTabMetadataTable } from "@/lib/db/schema/guitar-tab-metadata.table";

export function slugRedirectMiddleware(
  type: "post" | "guitar-tab",
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const slug = c.req.param("slug");
    if (!slug) return next();

    // 已经是短 ID 格式，放行给 TanStack Router 处理
    if (isShortId(slug)) return next();

    // 非短 ID 格式：查找旧文本 slug 对应的记录并重定向
    try {
      const db = getDb(c.env);

      if (type === "post") {
        // 先查 legacy_slug（运行时迁移后的旧 slug 备份）
        const post = await db
          .select({ id: PostsTable.id })
          .from(PostsTable)
          .where(eq(PostsTable.legacySlug, slug))
          .limit(1)
          .then((rows) => rows[0]);

        if (post) {
          const canonicalSlug = encodeId(post.id);
          return c.redirect(`/post/${canonicalSlug}`, 301);
        }

        // 回退：迁移尚未运行时，slug 列仍是旧文本
        const postBySlug = await db
          .select({ id: PostsTable.id })
          .from(PostsTable)
          .where(eq(PostsTable.slug, slug))
          .limit(1)
          .then((rows) => rows[0]);

        if (postBySlug) {
          const canonicalSlug = encodeId(postBySlug.id);
          return c.redirect(`/post/${canonicalSlug}`, 301);
        }
      } else {
        // 先查 legacy_slug
        const tab = await db
          .select({ id: GuitarTabMetadataTable.id })
          .from(GuitarTabMetadataTable)
          .where(eq(GuitarTabMetadataTable.legacySlug, slug))
          .limit(1)
          .then((rows) => rows[0]);

        if (tab) {
          const canonicalSlug = encodeId(tab.id);
          return c.redirect(`/guitar-tab/${canonicalSlug}`, 301);
        }

        // 回退：迁移尚未运行时
        const tabBySlug = await db
          .select({ id: GuitarTabMetadataTable.id })
          .from(GuitarTabMetadataTable)
          .where(eq(GuitarTabMetadataTable.slug, slug))
          .limit(1)
          .then((rows) => rows[0]);

        if (tabBySlug) {
          const canonicalSlug = encodeId(tabBySlug.id);
          return c.redirect(`/guitar-tab/${canonicalSlug}`, 301);
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "slug redirect lookup failed",
          type,
          slug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    // 找不到旧记录，放行给路由处理（可能返回 404）
    return next();
  };
}
