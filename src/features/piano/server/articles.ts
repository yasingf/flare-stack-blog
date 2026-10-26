import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { adminProcedure, withRateLimit } from "@/lib/orpc/procedure";
import {
  ARTICLE_STALE_MS,
  articleSettings,
  requestScoreArticle,
  type ArticleJob,
} from "./article-jobs";

const settings = adminProcedure
  .route({ method: "GET", path: "/admin/piano/articles/settings" })
  .handler(async ({ context }) => {
    const { exports } = await import("cloudflare:workers");
    const quota = await exports.PianoCoach.getByName(
      "piano-coach-v1",
    ).articleStatus(context.session.user.id);
    return { ...(await articleSettings(context.env)), ...quota };
  });
const configure = adminProcedure
  .route({ method: "PATCH", path: "/admin/piano/articles/settings" })
  .input(z.object({ autoGenerate: z.boolean() }))
  .handler(async ({ context, input }) => {
    await context.env.DB.prepare(
      "INSERT INTO piano_article_settings (id, auto_generate) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET auto_generate = excluded.auto_generate",
    )
      .bind(Number(input.autoGenerate))
      .run();
    return input;
  });
const list = adminProcedure
  .route({ method: "GET", path: "/admin/piano/articles" })
  .input(z.object({ ids: z.array(z.uuid()).max(24) }))
  .handler(async ({ context, input }) => {
    if (!input.ids.length) return [];
    const rows = await context.env.DB.prepare(
      `SELECT a.score_id AS scoreId, a.post_id AS postId, a.artist_hint AS artistHint, a.status, a.error, a.updated_at AS updatedAt, p.status AS postStatus FROM piano_score_articles a LEFT JOIN posts p ON p.id = a.post_id WHERE a.score_id IN (${input.ids.map(() => "?").join(",")})`,
    )
      .bind(...input.ids)
      .all<ArticleJob>();
    return rows.results.map((r) => ({
      ...r,
      stale:
        ["queued", "running"].includes(r.status) &&
        Date.now() - r.updatedAt > ARTICLE_STALE_MS,
    }));
  });
const generate = adminProcedure
  .use(withRateLimit({ capacity: 5, interval: "1m", key: "piano:article" }))
  .route({ method: "POST", path: "/admin/piano/articles/{id}" })
  .input(
    z.object({
      id: z.uuid(),
      artistHint: z.string().trim().max(160).default(""),
    }),
  )
  .handler(async ({ context, input }) => {
    const result = await requestScoreArticle(
      context.env,
      input.id,
      context.session.user.id,
      input.artistHint,
    );
    if (result.error)
      throw new ORPCError("BAD_REQUEST", { message: result.error });
    return result;
  });
export default { settings, configure, list, generate };
