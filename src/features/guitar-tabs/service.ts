import { getSiteConfig } from "@/features/config/service/config.service";
import { emailSiteOf } from "@/features/email/templates/email-theme";
import { ORPCError } from "@orpc/server";
import { isGuitarProFile } from "@/features/media/media.utils";
import { renderToStaticMarkup } from "react-dom/server";
import type { GuitarTabStatus } from "@/lib/db/schema/guitar-tab-metadata.table";
import * as Storage from "@/features/media/data/media.storage";
import * as MediaRepo from "@/features/media/data/media.data";
import * as GuitarTabRepo from "./data";
import * as GuitarTabMetaRepo from "@/features/media/data/guitar-tab-metadata.data";
import { generateGuitarTabSlug } from "@/features/media/media.utils";
import { parseGpHeader } from "@/features/media/utils/gp-header-parser";
import { GuitarTabReviewEmail } from "@/features/email/templates/GuitarTabReviewEmail";
import { serverEnv } from "@/lib/env/server.env";

export async function getApprovedGuitarTabsCount(
  context: DbContext,
): Promise<number> {
  return await GuitarTabMetaRepo.getApprovedCount(context.db);
}

/**
 * 公开接口：获取已审核通过的吉他谱文件列表（分页）
 */
export async function getGuitarTabsList(
  context: DbContext,
  data: { page?: number; pageSize?: number; search?: string },
) {
  return await GuitarTabRepo.getGuitarTabsWithMetaPaginated(context.db, data);
}

/**
 * 公开接口：根据 slug 获取吉他谱详情
 * 同时异步增加浏览次数
 */
export async function getGuitarTabBySlug(
  context: DbContext & { executionCtx?: ExecutionContext },
  slug: string,
) {
  const tab = await GuitarTabMetaRepo.getBySlug(context.db, slug);
  if (!tab) return null;

  // 异步增加浏览次数（不阻塞响应）
  if (context.executionCtx) {
    context.executionCtx.waitUntil(
      GuitarTabMetaRepo.incrementViewCount(context.db, tab.id),
    );
  } else {
    // 无 executionCtx（测试环境等）直接执行
    void GuitarTabMetaRepo.incrementViewCount(context.db, tab.id);
  }

  // 获取同首歌的其他版本
  const relatedTabs = await GuitarTabMetaRepo.getRelatedTabs(
    context.db,
    tab.artist,
    tab.title,
    tab.mediaId,
  );

  return { tab, relatedTabs };
}

/**
 * 管理后台：获取吉他谱列表（cursor-based）
 */
export async function getGuitarTabsListAdmin(
  context: DbContext,
  data: {
    cursor?: number;
    limit?: number;
    search?: string;
    status?: GuitarTabStatus;
  },
) {
  return await GuitarTabRepo.getGuitarTabsWithMeta(context.db, data);
}

/**
 * 管理后台：审核吉他谱（通过/拒绝 + 邮件通知）
 */
export async function reviewGuitarTab(
  context: DbContext & { executionCtx: ExecutionContext },
  data: {
    mediaId: number;
    status: "approved" | "rejected";
    rejectionReason?: string;
  },
) {
  // 先获取元数据（含上传者信息），用于发邮件
  const tabMeta = await GuitarTabMetaRepo.getByMediaId(
    context.db,
    data.mediaId,
  );

  if (!tabMeta) throw new ORPCError("NOT_FOUND");
  await GuitarTabMetaRepo.updateStatus(context.db, data.mediaId, data.status);

  // 查找上传者邮箱，发送通知邮件
  if (tabMeta?.uploaderId) {
    try {
      const { user: userTable } = await import("@/lib/db/schema/auth.table");
      const { eq } = await import("drizzle-orm");
      const uploader = (
        await context.db
          .select({ email: userTable.email, name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, tabMeta.uploaderId))
          .limit(1)
      ).at(0);

      if (uploader?.email) {
        const { DOMAIN } = serverEnv(context.env);
        const tabTitle = tabMeta.title || "未命名吉他谱";
        const site = emailSiteOf(await getSiteConfig(context));
        const emailHtml = renderToStaticMarkup(
          GuitarTabReviewEmail({
            site,
            tabTitle,
            artist: tabMeta.artist || undefined,
            approved: data.status === "approved",
            rejectionReason: data.rejectionReason,
            blogUrl: `https://${DOMAIN}`,
          }),
        );

        await context.env.QUEUE.send({
          type: "EMAIL",
          data: {
            to: uploader.email,
            subject:
              data.status === "approved"
                ? `[吉他谱审核通过] ${tabTitle}`
                : `[吉他谱审核结果] ${tabTitle}`,
            html: emailHtml,
          },
        });
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "guitar tab review email failed",
          mediaId: data.mediaId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

/**
 * 用户提交吉他谱
 */
export async function submitGuitarTab(
  context: AuthContext & { executionCtx: ExecutionContext },
  input: { file: File },
) {
  const { file } = input;
  if (!isGuitarProFile(file.name))
    throw new ORPCError("BAD_REQUEST", {
      message: "只支持 GP3/GP4/GP5/GPX/GP 吉他谱文件",
    });

  // ── 文件哈希去重检查 ──
  const fileBuffer = await file.arrayBuffer();
  await parseGpHeader(new Uint8Array(fileBuffer));
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const existing = await GuitarTabMetaRepo.findByFileHash(context.db, fileHash);
  if (existing) {
    const displayName = existing.title || existing.fileName;
    throw new Error(
      `该文件已存在：${displayName}。如果您认为这是不同的版本，请联系管理员。`,
    );
  }

  // 将 ArrayBuffer 重新包装成 File 以便上传（因为上面已经消费了 stream）
  const uploadFile = new File([fileBuffer], file.name, { type: file.type });
  const uploaded = await Storage.putToR2(context.env, uploadFile);

  try {
    const mediaRecord = await MediaRepo.insertMedia(context.db, {
      key: uploaded.key,
      url: uploaded.url,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      sizeInBytes: uploaded.sizeInBytes,
    });

    const guitarTabMeta = await processGuitarTabMetadata(
      context.env,
      context.db,
      mediaRecord.id,
      uploaded.key,
      context.session.user.id,
      "pending",
      fileHash,
    );
    if (guitarTabMeta.title)
      context.executionCtx.waitUntil(
        fetchAndSaveAlbumCoverWithTimeout(
          context.env,
          context.db,
          mediaRecord.id,
          guitarTabMeta.artist,
          guitarTabMeta.title,
          guitarTabMeta.album,
        ),
      );

    return { ...mediaRecord, guitarTabMeta };
  } catch (error) {
    await MediaRepo.deleteMedia(context.db, uploaded.key);
    console.error(
      JSON.stringify({
        message: "media db insert failed, rolling back r2 upload",
        key: uploaded.key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    context.executionCtx.waitUntil(
      Storage.deleteFromR2(context.env, uploaded.key).catch((err) =>
        console.error(
          JSON.stringify({
            message: "r2 rollback delete failed",
            key: uploaded.key,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      ),
    );
    throw new Error("Failed to insert media record");
  }
}

/**
 * 获取用户自己提交的吉他谱
 */
export async function getMyGuitarTabs(context: AuthContext) {
  return await GuitarTabMetaRepo.getByUploaderId(
    context.db,
    context.session.user.id,
  );
}

export async function processGuitarTabMetadata(
  env: Env,
  db: DB,
  mediaId: number,
  r2Key: string,
  uploaderId?: string | null,
  status?: GuitarTabStatus,
  fileHash?: string,
): Promise<{
  title: string;
  artist: string;
  album: string;
}> {
  // 从 R2 获取文件
  const object = await env.R2.get(r2Key);
  if (!object) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }

  const buffer = await object.arrayBuffer();
  const data = new Uint8Array(buffer);

  // 解析 GP 头信息（异步：GPX 格式需要解压 BCFZ 容器）
  const info = await parseGpHeader(data);

  // 保存到数据库
  const metaRecord = await GuitarTabMetaRepo.upsertMetadata(db, {
    mediaId,
    title: info.title,
    artist: info.artist,
    album: info.album,
    tempo: info.tempo,
    trackCount: info.trackCount,
    trackNames: JSON.stringify(info.trackNames),
    ...(uploaderId !== undefined ? { uploaderId } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(fileHash ? { fileHash } : {}),
  });

  // 生成并保存 slug（基于元数据 ID 的 8 位短 ID）
  const slug = metaRecord.slug || generateGuitarTabSlug(metaRecord.id);
  try {
    await GuitarTabMetaRepo.updateSlug(db, mediaId, slug);
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "slug generation failed",
        mediaId,
        error: String(err),
      }),
    );
  }

  console.log(
    JSON.stringify({
      message: "guitar tab metadata saved",
      mediaId,
      title: info.title,
      artist: info.artist,
    }),
  );

  return {
    title: info.title,
    artist: info.artist,
    album: info.album,
  };
}

/**
 * 通过 LrcAPI (api.lrc.cx/cover) 获取专辑封面
 * 保存到 R2 和媒体库，关联到吉他谱元数据
 * 会先检查是否已有相同 artist+title 的封面，如果有则直接复用
 *
 * @see https://docs.lrc.cx/docs/legacy/cover
 */
export async function fetchAndSaveAlbumCover(
  env: Env,
  db: DB,
  mediaId: number,
  artist: string,
  title: string,
  album?: string,
): Promise<boolean> {
  if (!artist && !title) return false;

  try {
    // ── 封面复用：检查是否已有相同 artist+title 的封面 ──
    const existingCover = await GuitarTabMetaRepo.findExistingCover(
      db,
      artist,
      title,
      mediaId,
    );
    if (existingCover) {
      await GuitarTabMetaRepo.updateCoverMediaId(
        db,
        mediaId,
        existingCover.coverMediaId,
      );
      console.log(
        JSON.stringify({
          message: "album cover reused from existing tab",
          mediaId,
          coverMediaId: existingCover.coverMediaId,
          artist,
          title,
        }),
      );
      return true;
    }

    // ── 从 LrcAPI 下载新封面 ──
    const params = new URLSearchParams();
    if (title) params.set("title", title);
    if (artist) params.set("artist", artist);
    if (album) params.set("album", album);

    const coverResponse = await fetch(
      `https://api.lrc.cx/cover?${params.toString()}`,
      { redirect: "follow", signal: AbortSignal.timeout(15_000) },
    );

    if (!coverResponse.ok) {
      console.log(
        JSON.stringify({
          message: "lrcapi cover not found",
          status: coverResponse.status,
          artist,
          title,
        }),
      );
      return false;
    }

    const coverContentType =
      coverResponse.headers.get("content-type") || "image/jpeg";

    // 确认返回的是图片
    if (!coverContentType.startsWith("image/")) {
      console.log(
        JSON.stringify({
          message: "lrcapi returned non-image content",
          contentType: coverContentType,
          artist,
          title,
        }),
      );
      return false;
    }

    const coverBuffer = await coverResponse.arrayBuffer();
    if (coverBuffer.byteLength < 1000) {
      // 过小的响应可能是错误占位图
      console.log(
        JSON.stringify({
          message: "lrcapi cover too small, skipping",
          size: coverBuffer.byteLength,
          artist,
          title,
        }),
      );
      return false;
    }

    const coverExt = coverContentType.includes("png") ? "png" : "jpg";

    // 保存到 R2
    const coverKey = `album-covers/${crypto.randomUUID()}.${coverExt}`;
    await env.R2.put(coverKey, coverBuffer, {
      httpMetadata: { contentType: coverContentType },
      customMetadata: {
        artist,
        title,
        source: "lrcapi",
      },
    });

    // 插入 media 记录
    const coverMedia = await MediaRepo.insertMedia(db, {
      key: coverKey,
      url: `/images/${coverKey}`,
      fileName: `${artist} - ${title}.${coverExt}`,
      mimeType: coverContentType,
      sizeInBytes: coverBuffer.byteLength,
    });

    // 关联到吉他谱元数据
    await GuitarTabMetaRepo.updateCoverMediaId(db, mediaId, coverMedia.id);

    console.log(
      JSON.stringify({
        message: "album cover saved",
        mediaId,
        coverKey,
        artist,
        title,
        source: "lrcapi",
      }),
    );

    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "album cover fetch failed",
        mediaId,
        artist,
        title,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}

/** 带超时的封面获取包装，用于 waitUntil 后台执行 */
export async function fetchAndSaveAlbumCoverWithTimeout(
  env: Env,
  db: DB,
  mediaId: number,
  artist: string,
  title: string,
  album?: string,
): Promise<void> {
  try {
    const result = await fetchAndSaveAlbumCover(
      env,
      db,
      mediaId,
      artist,
      title,
      album,
    );

    if (!result) {
      console.log(
        JSON.stringify({
          message: "cover not found or too small",
          mediaId,
          artist,
          title,
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "cover fetch with timeout failed",
        mediaId,
        artist,
        title,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * 根据 media ID 获取吉他谱元数据（含封面 key）
 */
export async function getGuitarTabMetaByMediaId(
  context: DbContext,
  mediaId: number,
) {
  return await GuitarTabMetaRepo.getByMediaIdWithCover(context.db, mediaId);
}

/**
 * 获取未处理的吉他谱列表
 */
export async function getUnprocessedGuitarTabs(context: DbContext) {
  return await GuitarTabMetaRepo.getUnprocessedGuitarTabs(context.db);
}

/**
 * 直接处理吉他谱（不依赖 Workflow）
 * 解析元数据 + 获取封面
 *
 * @param force 强制重新解析所有吉他谱（覆盖已有元数据）
 */
export async function processAllGuitarTabsDirect(
  env: Env,
  db: DB,
  force = false,
): Promise<{ processed: number; covers: number; errors: number }> {
  const items = force
    ? await GuitarTabMetaRepo.getAllGuitarProMedia(db)
    : await GuitarTabMetaRepo.getUnprocessedGuitarTabs(db);
  let processed = 0;
  let covers = 0;
  let errors = 0;

  for (const item of items) {
    try {
      // Step 1: 解析元数据
      const metadata = await processGuitarTabMetadata(
        env,
        db,
        item.id,
        item.key,
      );
      processed++;

      // Step 2: 获取封面
      if (metadata.artist || metadata.title) {
        const saved = await fetchAndSaveAlbumCover(
          env,
          db,
          item.id,
          metadata.artist,
          metadata.title,
          metadata.album,
        );
        if (saved) covers++;
      }
    } catch (err) {
      errors++;
      console.error(
        JSON.stringify({
          message: "direct guitar tab processing failed",
          mediaId: item.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { processed, covers, errors };
}

/**
 * 为已有元数据但没有封面的吉他谱获取封面
 */
export async function fetchMissingCovers(
  env: Env,
  db: DB,
): Promise<{ total: number; fetched: number; errors: number }> {
  const tabs = await GuitarTabMetaRepo.getTabsWithoutCover(db);
  let fetched = 0;
  let errors = 0;

  for (const tab of tabs) {
    try {
      const saved = await fetchAndSaveAlbumCover(
        env,
        db,
        tab.mediaId,
        tab.artist ?? "",
        tab.title ?? "",
        tab.album ?? undefined,
      );
      if (saved) fetched++;
    } catch (err) {
      errors++;
      console.error(
        JSON.stringify({
          message: "missing cover fetch failed",
          mediaId: tab.mediaId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { total: tabs.length, fetched, errors };
}
