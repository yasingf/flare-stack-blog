import { and, count, desc, eq, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { GuitarTabStatus } from "@/lib/db/schema/guitar-tab-metadata.table";
import { escapeLikeString } from "@/features/media/data/helper";
import { MediaTable, GuitarTabMetadataTable, user } from "@/lib/db/schema";

export interface GuitarTabWithMeta {
  id: number;
  key: string;
  fileName: string;
  sizeInBytes: number;
  createdAt: Date;
  // 元数据
  title: string | null;
  artist: string | null;
  album: string | null;
  tempo: number | null;
  trackCount: number | null;
  trackNames: string | null;
  // 封面
  coverKey: string | null;
  // 上传者
  uploaderName: string | null;
  uploaderImage: string | null;
  uploaderEmail: string | null;
  // slug
  slug: string | null;
  // 状态
  status: GuitarTabStatus;
  // 浏览量
  viewCount: number | null;
}

/**
 * 公开吉他谱列表（分页）— 只返回 approved 状态
 */
export async function getGuitarTabsWithMetaPaginated(
  db: DB,
  options?: { page?: number; pageSize?: number; search?: string },
): Promise<{
  items: Array<GuitarTabWithMeta>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const { page = 1, pageSize = 20, search } = options ?? {};
  const offset = (page - 1) * pageSize;

  const conditions: Array<SQL> = [];

  if (search) {
    const pattern = `%${escapeLikeString(search)}%`;
    conditions.push(
      or(
        sql`${MediaTable.fileName} LIKE ${pattern} ESCAPE '\\'`,
        sql`${GuitarTabMetadataTable.title} LIKE ${pattern} ESCAPE '\\'`,
        sql`${GuitarTabMetadataTable.artist} LIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }

  // Guitar Pro 类型过滤
  conditions.push(
    or(
      sql`${MediaTable.mimeType} = 'application/x-guitar-pro'`,
      sql`(${MediaTable.mimeType} = 'application/octet-stream' AND (${MediaTable.key} LIKE '%.gp3' OR ${MediaTable.key} LIKE '%.gp4' OR ${MediaTable.key} LIKE '%.gp5' OR ${MediaTable.key} LIKE '%.gpx' OR ${MediaTable.key} LIKE '%.gp'))`,
    )!,
  );

  // 只显示已通过审核的
  conditions.push(eq(GuitarTabMetadataTable.status, "approved"));

  const coverMedia = db
    .select({ id: MediaTable.id, key: MediaTable.key })
    .from(MediaTable)
    .as("cover_media");

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 查询总数
  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(MediaTable)
    .leftJoin(
      GuitarTabMetadataTable,
      eq(MediaTable.id, GuitarTabMetadataTable.mediaId),
    )
    .where(whereClause);

  // 查询数据
  const rows = await db
    .select({
      id: MediaTable.id,
      key: MediaTable.key,
      fileName: MediaTable.fileName,
      sizeInBytes: MediaTable.sizeInBytes,
      createdAt: MediaTable.createdAt,
      title: GuitarTabMetadataTable.title,
      artist: GuitarTabMetadataTable.artist,
      album: GuitarTabMetadataTable.album,
      tempo: GuitarTabMetadataTable.tempo,
      trackCount: GuitarTabMetadataTable.trackCount,
      trackNames: GuitarTabMetadataTable.trackNames,
      coverKey: coverMedia.key,
      uploaderName: user.name,
      uploaderImage: user.image,
      uploaderEmail: sql<string | null>`NULL`,
      slug: GuitarTabMetadataTable.slug,
      status: GuitarTabMetadataTable.status,
      viewCount: GuitarTabMetadataTable.viewCount,
    })
    .from(MediaTable)
    .leftJoin(
      GuitarTabMetadataTable,
      eq(MediaTable.id, GuitarTabMetadataTable.mediaId),
    )
    .leftJoin(
      coverMedia,
      eq(GuitarTabMetadataTable.coverMediaId, coverMedia.id),
    )
    .leftJoin(user, eq(GuitarTabMetadataTable.uploaderId, user.id))
    .where(whereClause)
    .orderBy(desc(MediaTable.id))
    .limit(pageSize)
    .offset(offset);

  const items: Array<GuitarTabWithMeta> = rows.map((r) => ({
    ...r,
    status: r.status ?? "approved",
  }));

  return { items, total: totalCount, page, pageSize };
}

/**
 * 管理后台吉他谱列表（cursor-based，含全部状态）
 */
export async function getGuitarTabsWithMeta(
  db: DB,
  options?: {
    cursor?: number;
    limit?: number;
    search?: string;
    status?: GuitarTabStatus;
  },
): Promise<{ items: Array<GuitarTabWithMeta>; nextCursor: number | null }> {
  const { cursor, limit = 20, search, status: statusFilter } = options ?? {};

  const conditions: Array<SQL> = [];
  if (cursor) {
    conditions.push(lt(MediaTable.id, cursor));
  }
  if (search) {
    const pattern = `%${escapeLikeString(search)}%`;
    // 搜索 fileName 和 metadata 的 title / artist
    conditions.push(
      or(
        sql`${MediaTable.fileName} LIKE ${pattern} ESCAPE '\\'`,
        sql`${GuitarTabMetadataTable.title} LIKE ${pattern} ESCAPE '\\'`,
        sql`${GuitarTabMetadataTable.artist} LIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }

  // Guitar Pro 类型过滤
  conditions.push(
    or(
      sql`${MediaTable.mimeType} = 'application/x-guitar-pro'`,
      sql`(${MediaTable.mimeType} = 'application/octet-stream' AND (${MediaTable.key} LIKE '%.gp3' OR ${MediaTable.key} LIKE '%.gp4' OR ${MediaTable.key} LIKE '%.gp5' OR ${MediaTable.key} LIKE '%.gpx' OR ${MediaTable.key} LIKE '%.gp'))`,
    )!,
  );

  // 按状态过滤
  if (statusFilter) {
    conditions.push(eq(GuitarTabMetadataTable.status, statusFilter));
  }

  // 这里用一个 cover alias 来 JOIN 封面图
  const coverMedia = db
    .select({
      id: MediaTable.id,
      key: MediaTable.key,
    })
    .from(MediaTable)
    .as("cover_media");

  const rows = await db
    .select({
      id: MediaTable.id,
      key: MediaTable.key,
      fileName: MediaTable.fileName,
      sizeInBytes: MediaTable.sizeInBytes,
      createdAt: MediaTable.createdAt,
      title: GuitarTabMetadataTable.title,
      artist: GuitarTabMetadataTable.artist,
      album: GuitarTabMetadataTable.album,
      tempo: GuitarTabMetadataTable.tempo,
      trackCount: GuitarTabMetadataTable.trackCount,
      trackNames: GuitarTabMetadataTable.trackNames,
      coverKey: coverMedia.key,
      uploaderName: user.name,
      uploaderImage: user.image,
      uploaderEmail: user.email,
      slug: GuitarTabMetadataTable.slug,
      status: GuitarTabMetadataTable.status,
      viewCount: GuitarTabMetadataTable.viewCount,
    })
    .from(MediaTable)
    .leftJoin(
      GuitarTabMetadataTable,
      eq(MediaTable.id, GuitarTabMetadataTable.mediaId),
    )
    .leftJoin(
      coverMedia,
      eq(GuitarTabMetadataTable.coverMediaId, coverMedia.id),
    )
    .leftJoin(user, eq(GuitarTabMetadataTable.uploaderId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(MediaTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  const nextCursor = hasMore ? (rows[rows.length - 1]?.id ?? null) : null;

  const items: Array<GuitarTabWithMeta> = rows.map((r) => ({
    ...r,
    status: r.status ?? "approved",
  }));

  return { items, nextCursor };
}
