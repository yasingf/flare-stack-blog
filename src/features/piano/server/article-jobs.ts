import { buildScoreArticle, type GeneratedArticle } from "../article.schema";
import { normalizePostContent } from "@/features/posts/utils/normalize-content";
import { validateSharedScore } from "./score-file";
import { lookupTitle } from "./music-metadata";

export const ARTICLE_STALE_MS = 5 * 60 * 1000;
export type ArticleJob = {
  scoreId: string;
  postId: number | null;
  artistHint: string;
  status: "queued" | "running" | "ready" | "failed";
  error: string | null;
  updatedAt: number;
  postStatus: "draft" | "published" | null;
};
export async function articleSettings(env: Env) {
  const row = await env.DB.prepare(
    "SELECT auto_generate AS autoGenerate FROM piano_article_settings WHERE id = 1",
  ).first<{ autoGenerate: number }>();
  return { autoGenerate: row ? !!row.autoGenerate : true };
}
export async function requestScoreArticle(
  env: Env,
  scoreId: string,
  userId: string,
  artistHint: string,
  automatic = false,
): Promise<{ queued: boolean; error?: string }> {
  try {
    if (automatic && !(await articleSettings(env)).autoGenerate)
      return { queued: false };
    // Check the live account again, including when called from the upload path.
    const allowed = await env.DB.prepare(
      "SELECT s.id FROM piano_scores s WHERE s.id = ? AND EXISTS(SELECT 1 FROM user WHERE id = ? AND role = 'admin')",
    )
      .bind(scoreId, userId)
      .first();
    if (!allowed)
      return { queued: false, error: "曲谱不存在或当前账户不是管理员。" };
    const requestId = crypto.randomUUID();
    const now = Date.now();
    const conflict = automatic
      ? "DO NOTHING"
      : `DO UPDATE SET requested_by = excluded.requested_by, request_id = excluded.request_id, artist_hint = excluded.artist_hint, status = 'queued', error = NULL, updated_at = excluded.updated_at WHERE piano_score_articles.post_id IS NULL AND (piano_score_articles.status IN ('failed', 'ready') OR piano_score_articles.updated_at < ?)`;
    const args = [
      scoreId,
      userId,
      requestId,
      artistHint.trim().slice(0, 160),
      now,
      now,
    ];
    if (!automatic) args.push(now - ARTICLE_STALE_MS);
    const result = await env.DB.prepare(
      `INSERT INTO piano_score_articles (score_id, requested_by, request_id, artist_hint, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?) ON CONFLICT(score_id) ${conflict}`,
    )
      .bind(...args)
      .run();
    if (!result.meta.changes) return { queued: false };
    try {
      await env.QUEUE.send({
        type: "PIANO_ARTICLE",
        data: { scoreId, requestId },
      });
      return { queued: true };
    } catch {
      await failArticle(
        env,
        scoreId,
        requestId,
        "生成任务未能进入队列。曲谱已共享，请稍后手动重试。",
      );
      return {
        queued: false,
        error: "曲谱已共享，但文章任务暂不可用，请在后台重试。",
      };
    }
  } catch (error) {
    if (!automatic) throw error;
    // An unavailable AI pipeline must not fail an already successful upload.
    console.error("Piano article enqueue failed; score upload preserved");
    return { queued: false, error: "文章任务暂不可用。" };
  }
}
async function failArticle(
  env: Env,
  scoreId: string,
  requestId: string,
  error: string,
) {
  await env.DB.prepare(
    "UPDATE piano_score_articles SET status = 'failed', error = ?, updated_at = ? WHERE score_id = ? AND request_id = ? AND status IN ('queued', 'running')",
  )
    .bind(error, Date.now(), scoreId, requestId)
    .run();
}
export async function completeArticle(
  env: Env,
  scoreId: string,
  requestId: string,
  generated: GeneratedArticle,
) {
  const article = buildScoreArticle(scoreId, generated);
  const slug = `piano-${scoreId}-${requestId}`;
  const guard =
    "score_id = ? AND request_id = ? AND status = 'running' AND post_id IS NULL AND EXISTS(SELECT 1 FROM user WHERE id = requested_by AND role = 'admin')";
  // A single D1 transaction prevents orphan drafts and duplicate queue delivery.
  // Never update existing post content: administrators may already be editing it.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO posts (title, summary, slug, content_json, status) SELECT ?, ?, ?, ?, 'draft' WHERE EXISTS(SELECT 1 FROM piano_score_articles WHERE ${guard})`,
    ).bind(
      article.title,
      article.summary,
      slug,
      JSON.stringify(normalizePostContent(article.contentJson)),
      scoreId,
      requestId,
    ),
    env.DB.prepare(
      `UPDATE piano_score_articles SET post_id = (SELECT id FROM posts WHERE slug = ?), status = 'ready', error = NULL, updated_at = ? WHERE ${guard}`,
    ).bind(slug, Date.now(), scoreId, requestId),
  ]);
}
export async function handlePianoArticle(
  env: Env,
  data: { scoreId: string; requestId: string },
) {
  const { scoreId, requestId } = data;
  const claimed = await env.DB.prepare(
    "UPDATE piano_score_articles SET status = 'running', updated_at = ? WHERE score_id = ? AND request_id = ? AND status = 'queued' AND post_id IS NULL",
  )
    .bind(Date.now(), scoreId, requestId)
    .run();
  if (!claimed.meta.changes) return;
  try {
    const row = await env.DB.prepare(
      "SELECT s.title, s.composer, s.file_name AS fileName, a.requested_by AS userId, a.artist_hint AS artistHint FROM piano_score_articles a JOIN piano_scores s ON a.score_id = s.id WHERE a.score_id = ? AND a.request_id = ?",
    )
      .bind(scoreId, requestId)
      .first<{
        title: string;
        composer: string;
        fileName: string;
        userId: string;
        artistHint: string;
      }>();
    if (!row) return;
    const object = await env.R2.get(`piano-private/${scoreId}`);
    if (!object) {
      await failArticle(
        env,
        scoreId,
        requestId,
        "曲谱文件不存在，请检查存储后再试。",
      );
      return;
    }
    const stats = validateSharedScore(
      new Uint8Array(await object.arrayBuffer()),
      row.fileName,
    );
    if (!stats?.notes) {
      await failArticle(env, scoreId, requestId, "曲谱中没有可供分析的音符。");
      return;
    }
    const { exports } = await import("cloudflare:workers");
    const generated = await exports.PianoCoach.getByName(
      "piano-coach-v1",
    ).generateArticle(row.userId, {
      ...stats,
      title: row.title,
      lookupTitle: lookupTitle(row.title),
      composer: row.composer,
      artistHint: row.artistHint,
    });
    if ("error" in generated) {
      await failArticle(env, scoreId, requestId, generated.error);
      return;
    }
    await completeArticle(env, scoreId, requestId, generated);
    // A role change during inference also prevents committing the draft.
    await failArticle(
      env,
      scoreId,
      requestId,
      "账户权限或曲谱状态已变化，未创建草稿。",
    );
  } catch {
    await failArticle(
      env,
      scoreId,
      requestId,
      "文章生成中断，未自动重试。请稍后在后台重新生成。",
    );
  }
}
