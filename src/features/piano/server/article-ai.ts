import { COACH_DAILY_NEURONS } from "../coach.schema";
import {
  ARTICLE_DAILY_REQUESTS,
  ARTICLE_USER_REQUESTS,
  ARTICLE_RESERVATION,
  ARTICLE_MAX_INPUT_BYTES,
  ARTICLE_MAX_TOKENS,
  ARTICLE_MODEL,
  articleFactsSchema,
  articlePrompt,
  articleWritingSchema,
  type ArticleFacts,
  type GeneratedArticle,
} from "../article.schema";
import { lookupMusic } from "./music-metadata";
import type { Quota } from "./coach";

type Cache = { article: GeneratedArticle; createdAt: number };
const usage = (quota?: Quota) => quota?.neurons ?? (quota?.requests || 0) * 100;
export async function articleStatus(
  env: Env,
  storage: DurableObjectStorage,
  userId: string,
) {
  const day = new Date().toISOString().slice(0, 10);
  const quota = await storage.get<Quota>(`quota:${day}`);
  return {
    enabled: env.PIANO_AI_ENABLED === "true" && !!env.AI,
    remaining: quota?.stopped
      ? 0
      : Math.max(
          0,
          Math.min(
            ARTICLE_USER_REQUESTS - (quota?.articleUsers?.[userId] || 0),
            ARTICLE_DAILY_REQUESTS - (quota?.articleRequests || 0),
            Math.floor(
              (COACH_DAILY_NEURONS - usage(quota)) / ARTICLE_RESERVATION,
            ),
          ),
        ),
    dailyLimit: ARTICLE_USER_REQUESTS,
    siteLimit: ARTICLE_DAILY_REQUESTS,
    reservedNeurons: usage(quota),
    budget: COACH_DAILY_NEURONS,
    resetAt: new Date(`${day}T00:00:00Z`).getTime() + 86400000,
  };
}
export async function generateArticle(
  env: Env,
  storage: DurableObjectStorage,
  userId: string,
  unsafeFacts: ArticleFacts,
  mb: (path: string) => Promise<unknown>,
): Promise<GeneratedArticle | { error: string }> {
  const admin = await env.DB.prepare(
    "SELECT id FROM user WHERE id = ? AND role = 'admin'",
  )
    .bind(userId)
    .first();
  if (!admin) return { error: "只有管理员可以生成曲谱文章。" };
  if (env.PIANO_AI_ENABLED !== "true" || !env.AI)
    return { error: "Workers AI 未启用，曲谱已共享，可稍后在后台生成文章。" };
  const facts = articleFactsSchema.parse(unsafeFacts);
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `${ARTICLE_MODEL}:article-v1:${JSON.stringify(facts)}`,
        ),
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const key = `article:${hash}`;
  const day = new Date().toISOString().slice(0, 10);
  const reserve = await storage.transaction(async (tx) => {
    const cached = await tx.get<Cache>(key);
    if (cached && Date.now() - cached.createdAt < 7 * 86400000)
      return { article: { ...cached.article, cached: true } };
    const lock = await tx.get<number>(`pending:${key}`);
    if (lock && Date.now() - lock < 300000)
      return { error: "相同曲谱正在生成，请稍后重试。" };
    const quota = (await tx.get<Quota>(`quota:${day}`)) || {
      requests: 0,
      users: {},
      stopped: false,
    };
    quota.neurons = usage(quota);
    quota.articleRequests ??= 0;
    quota.articleUsers ??= {};
    if (
      quota.stopped ||
      quota.neurons + ARTICLE_RESERVATION > COACH_DAILY_NEURONS ||
      quota.articleRequests >= ARTICLE_DAILY_REQUESTS ||
      (quota.articleUsers[userId] || 0) >= ARTICLE_USER_REQUESTS
    )
      return {
        error:
          "今日文章额度或站点免费预算已用完，北京时间 08:00 后恢复。曲谱正常可用。",
      };
    quota.neurons += ARTICLE_RESERVATION;
    quota.articleRequests++;
    quota.articleUsers[userId] = (quota.articleUsers[userId] || 0) + 1;
    await tx.put(`quota:${day}`, quota);
    await tx.put(`pending:${key}`, Date.now());
    return {};
  });
  if (reserve.error) return { error: reserve.error };
  if (reserve.article) return reserve.article;
  const stop = () =>
    storage.transaction(async (tx) => {
      const quota = await tx.get<Quota>(`quota:${day}`);
      if (quota) await tx.put(`quota:${day}`, { ...quota, stopped: true });
    });
  try {
    const metadata = await lookupMusic(facts.lookupTitle, facts.artistHint, mb);
    // Bound source text and all prompts before making any billable inference.
    let messages = articlePrompt(facts, metadata);
    if (
      new TextEncoder().encode(JSON.stringify(messages)).length >
      ARTICLE_MAX_INPUT_BYTES
    ) {
      for (const source of metadata.sources)
        if (source.excerpt) source.excerpt = source.excerpt.slice(0, 500);
      messages = articlePrompt(facts, metadata);
    }
    if (
      new TextEncoder().encode(JSON.stringify(messages)).length >
      ARTICLE_MAX_INPUT_BYTES
    )
      throw new Error("Prompt too large");
    const output = (await env.AI.run(ARTICLE_MODEL, {
      messages,
      max_tokens: ARTICLE_MAX_TOKENS,
      temperature: 0.2,
      stream: false,
    })) as {
      response?: unknown;
      choices?: { message?: { content?: string } }[];
      usage?: { neurons?: number };
    };
    if ((output.usage?.neurons || 0) > ARTICLE_RESERVATION) await stop();
    // Workers AI may return parsed JSON in response, or a chat-completions
    // content string. Accept either; validate both against the same schema.
    const raw = output.response ?? output.choices?.[0]?.message?.content;
    const writing = articleWritingSchema.parse(
      typeof raw === "string"
        ? JSON.parse(
            raw
              .replace(/<think>[\s\S]*?<\/think>/g, "")
              .trim()
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/, ""),
          )
        : raw,
    );
    const article = { facts, metadata, writing, cached: false };
    await storage.put(key, { article, createdAt: Date.now() } satisfies Cache);
    await storage.setAlarm(Date.now() + 86400000);
    return article;
  } catch (error) {
    if (/quota|limit|neurons|billing|10000|429/i.test(String(error)))
      await stop();
    return {
      error:
        "文章未生成：AI 暂不可用、额度不足或返回内容未通过校验。本次不会自动重试，可稍后手动生成。",
    };
  } finally {
    await storage.delete(`pending:${key}`);
  }
}
