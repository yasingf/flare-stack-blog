import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  adminProcedure,
  authProcedure,
  publicProcedure,
  withRateLimit,
} from "@/lib/orpc/procedure";
import { PIANO_SHARING_TERMS_VERSION } from "../sharing-terms";

import { validateSharedScore } from "./score-file";
import { requestScoreArticle } from "./article-jobs";
export { validateSharedScore } from "./score-file";

const MAX_BYTES = 4 * 1024 * 1024;
const idInput = z.object({ id: z.uuid() });
const metadata = z.object({
  title: z.string().trim().min(1).max(160),
  composer: z.string().trim().max(160).default(""),
});
const pageInput = z.object({
  page: z.number().int().min(0).max(10000).default(0),
  search: z.string().trim().max(160).default(""),
});
const invalid = (message: string): never => {
  throw new ORPCError("BAD_REQUEST", { message });
};

const list = publicProcedure
  .route({ method: "GET", path: "/piano/scores" })
  .input(pageInput)
  .handler(async ({ context, input }) => {
    const query = input.search.toLowerCase();
    const where =
      "(instr(lower(s.title), ?) > 0 OR instr(lower(s.composer), ?) > 0)";
    const [rows, total] = await Promise.all([
      context.env.DB.prepare(
        `SELECT s.id, s.user_id AS userId, s.title, s.composer, s.file_name AS fileName, s.size, s.created_at AS createdAt, u.name AS uploader FROM piano_scores s JOIN user u ON u.id = s.user_id WHERE ${where} ORDER BY s.created_at DESC, s.id LIMIT 24 OFFSET ?`,
      )
        .bind(query, query, input.page * 24)
        .all<{
          id: string;
          userId: string;
          title: string;
          composer: string;
          fileName: string;
          size: number;
          createdAt: number;
          uploader: string;
        }>(),
      context.env.DB.prepare(
        `SELECT COUNT(*) AS total FROM piano_scores s WHERE ${where}`,
      )
        .bind(query, query)
        .first<{ total: number }>(),
    ]);
    return { items: rows.results, total: total?.total ?? 0 };
  });
const load = publicProcedure
  .route({ method: "GET", path: "/piano/scores/{id}" })
  .input(idInput)
  .handler(async ({ context, input }) => {
    const row = await context.env.DB.prepare(
      "SELECT file_name AS fileName, title, composer FROM piano_scores WHERE id = ?",
    )
      .bind(input.id)
      .first<{ fileName: string; title: string; composer: string }>();
    if (!row) throw new ORPCError("NOT_FOUND");
    const object = await context.env.R2.get(`piano-private/${input.id}`);
    if (!object) throw new ORPCError("NOT_FOUND");
    const bytes = new Uint8Array(await object.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ...row, base64: btoa(binary) };
  });
const upload = authProcedure
  .use(withRateLimit({ capacity: 10, interval: "1h", key: "piano:upload" }))
  .route({ method: "POST", path: "/piano/scores" })
  .input(
    metadata.extend({
      file: z.file().min(1).max(MAX_BYTES),
      artistHint: z.string().trim().max(160).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const accepted = await context.env.DB.prepare(
      "SELECT version FROM piano_sharing_consents WHERE user_id = ?",
    )
      .bind(context.session.user.id)
      .first();
    if (!accepted)
      throw new ORPCError("FORBIDDEN", {
        message: "请先阅读并同意曲谱共享协议，每个账号只需确认一次。",
      });
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    validateSharedScore(bytes, input.file.name);
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const existing = await context.env.DB.prepare(
      "SELECT id FROM piano_scores WHERE user_id = ? AND hash = ?",
    )
      .bind(context.session.user.id, hash)
      .first<{ id: string }>();
    if (existing) {
      await context.env.DB.prepare(
        "UPDATE piano_scores SET title = ?, composer = ? WHERE id = ? AND user_id = ?",
      )
        .bind(input.title, input.composer, existing.id, context.session.user.id)
        .run();
      // Re-uploading metadata must never overwrite an existing article.
      if (context.session.user.role === "admin")
        await requestScoreArticle(
          context.env,
          existing.id,
          context.session.user.id,
          input.artistHint || "",
          true,
        );
      return existing;
    }
    const id = crypto.randomUUID();
    const key = `piano-private/${id}`;
    await context.env.R2.put(key, bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    try {
      const result = await context.env.DB.prepare(
        "INSERT OR IGNORE INTO piano_scores (id, user_id, hash, title, composer, file_name, size, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM piano_scores WHERE user_id = ?) < 50",
      )
        .bind(
          id,
          context.session.user.id,
          hash,
          input.title,
          input.composer,
          input.file.name,
          bytes.length,
          Date.now(),
          context.session.user.id,
        )
        .run();
      if (!result.meta.changes)
        invalid("每个账号最多保存 50 首曲谱，或该文件已上传。请刷新曲库查看。");
    } catch (error) {
      await context.env.R2.delete(key);
      throw error;
    }
    if (context.session.user.role === "admin")
      await requestScoreArticle(
        context.env,
        id,
        context.session.user.id,
        input.artistHint || "",
        true,
      );
    return { id };
  });
const update = authProcedure
  .route({ method: "PATCH", path: "/piano/scores/{id}" })
  .input(metadata.extend(idInput.shape))
  .handler(async ({ context, input }) => {
    const row = await context.env.DB.prepare(
      "SELECT user_id AS userId FROM piano_scores WHERE id = ?",
    )
      .bind(input.id)
      .first<{ userId: string }>();
    if (!row) throw new ORPCError("NOT_FOUND");
    if (
      row.userId !== context.session.user.id &&
      context.session.user.role !== "admin"
    )
      throw new ORPCError("FORBIDDEN");
    const result = await context.env.DB.prepare(
      "UPDATE piano_scores SET title = ?, composer = ? WHERE id = ?",
    )
      .bind(input.title, input.composer, input.id)
      .run();
    if (!result.meta.changes) throw new ORPCError("NOT_FOUND");
    return { success: true };
  });
const remove = authProcedure
  .route({ method: "DELETE", path: "/piano/scores/{id}" })
  .input(idInput)
  .handler(async ({ context, input }) => {
    const row = await context.env.DB.prepare(
      "SELECT user_id AS userId FROM piano_scores WHERE id = ?",
    )
      .bind(input.id)
      .first<{ userId: string }>();
    if (!row) throw new ORPCError("NOT_FOUND");
    if (
      row.userId !== context.session.user.id &&
      context.session.user.role !== "admin"
    )
      throw new ORPCError("FORBIDDEN");
    await context.env.R2.delete(`piano-private/${input.id}`);
    await context.env.DB.prepare("DELETE FROM piano_scores WHERE id = ?")
      .bind(input.id)
      .run();
    return { success: true };
  });
const stats = adminProcedure
  .route({ method: "GET", path: "/admin/piano/storage" })
  .handler(async ({ context }) => {
    return await context.env.DB.prepare(
      "SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM piano_scores",
    ).first<{
      files: number;
      bytes: number;
    }>();
  });
const storage = adminProcedure
  .use(withRateLimit({ capacity: 60, interval: "1m", key: "piano:storage" }))
  .route({ method: "GET", path: "/admin/piano/storage/bucket" })
  .input(z.object({ cursor: z.string().max(4096).optional() }))
  .handler(async ({ context, input }) => {
    const result = await context.env.R2.list({
      limit: 1000,
      cursor: input.cursor,
    });
    return {
      files: result.objects.length,
      bytes: result.objects.reduce((sum, o) => sum + o.size, 0),
      cursor: result.truncated ? result.cursor : null,
    };
  });
const agreement = authProcedure
  .route({ method: "GET", path: "/me/piano/sharing-agreement" })
  .handler(async ({ context }) => {
    const row = await context.env.DB.prepare(
      "SELECT version, accepted_at AS acceptedAt FROM piano_sharing_consents WHERE user_id = ?",
    )
      .bind(context.session.user.id)
      .first<{ version: string; acceptedAt: number }>();
    return {
      accepted: !!row,
      version: row?.version ?? null,
      acceptedAt: row?.acceptedAt ?? null,
    };
  });
const acceptAgreement = authProcedure
  .route({ method: "POST", path: "/me/piano/sharing-agreement" })
  .input(
    z.object({
      accepted: z.literal(true),
      version: z.literal(PIANO_SHARING_TERMS_VERSION),
    }),
  )
  .handler(async ({ context, input }) => {
    await context.env.DB.prepare(
      "INSERT OR IGNORE INTO piano_sharing_consents (user_id, version, accepted_at) VALUES (?, ?, ?)",
    )
      .bind(context.session.user.id, input.version, Date.now())
      .run();
    return { accepted: true };
  });
export default {
  list,
  load,
  upload,
  update,
  remove,
  stats,
  storage,
  agreement,
  acceptAgreement,
};
