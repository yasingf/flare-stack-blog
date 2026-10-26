import { DurableObject } from "cloudflare:workers";
import {
  COACH_DAILY_REQUESTS,
  COACH_DAILY_NEURONS,
  COACH_MAX_INPUT_BYTES,
  COACH_MAX_TOKENS,
  COACH_MODEL,
  COACH_RESERVATION,
  COACH_USER_REQUESTS,
  coachFactsSchema,
  coachPrompt,
  type CoachFacts,
  type CoachResponse,
} from "../coach.schema";

type Quota = {
  requests: number;
  users: Record<string, number>;
  stopped: boolean;
  neurons?: number;
};
type Cache = { text: string; createdAt: number };

async function cacheKey(facts: CoachFacts, legacyUser?: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      legacyUser
        ? `${legacyUser}:${JSON.stringify(facts)}:v1`
        : `${COACH_MODEL}:${JSON.stringify(facts)}:v2`,
    ),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** All requests go to one named object: reservations are atomic across users,
 * isolates and concurrent requests. A failed/aborted request is never refunded. */
export class PianoCoach extends DurableObject<Env> {
  async saved(userId: string, unsafeFacts: CoachFacts) {
    const facts = coachFactsSchema.parse(unsafeFacts);
    const key = await cacheKey(facts);
    const cached =
      (await this.ctx.storage.get<Cache>(`cache:${key}`)) ||
      (await this.ctx.storage.get<Cache>(
        `cache:${await cacheKey(facts, userId)}`,
      ));
    return { text: cached?.text || null };
  }
  async status(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const quota = await this.ctx.storage.get<Quota>(`quota:${day}`);
    return {
      enabled: this.env.PIANO_AI_ENABLED === "true" && !!this.env.AI,
      remaining: Math.max(
        0,
        Math.min(
          COACH_USER_REQUESTS - (quota?.users[userId] || 0),
          COACH_DAILY_REQUESTS - (quota?.requests || 0),
          Math.floor(
            (COACH_DAILY_NEURONS -
              (quota?.neurons ?? (quota?.requests || 0) * 100)) /
              COACH_RESERVATION,
          ),
        ),
      ),
      exhausted: !!quota?.stopped,
      resetAt: new Date(`${day}T00:00:00Z`).getTime() + 86400000,
      dailyLimit: COACH_USER_REQUESTS,
    };
  }
  async generate(
    userId: string,
    unsafeFacts: CoachFacts,
  ): Promise<CoachResponse | { error: string }> {
    if (this.env.PIANO_AI_ENABLED !== "true" || !this.env.AI)
      return { error: "AI 练习建议尚未启用；看谱和跟弹可以正常使用。" };
    const facts = coachFactsSchema.parse(unsafeFacts);
    const messages = coachPrompt(facts);
    if (
      new TextEncoder().encode(JSON.stringify(messages)).length >
      COACH_MAX_INPUT_BYTES
    )
      return { error: "曲谱信息过长。" };
    const key = await cacheKey(facts);
    const day = new Date().toISOString().slice(0, 10);
    const reservation = await this.ctx.storage.transaction(async (storage) => {
      const quota = (await storage.get<Quota>(`quota:${day}`)) || {
        requests: 0,
        users: {},
        stopped: false,
      };
      const used = quota.users[userId] || 0;
      // Older deployments reserved 100 neurons. Preserve that day's usage.
      quota.neurons ??= quota.requests * 100;
      const cached = await storage.get<Cache>(`cache:${key}`);
      if (cached)
        return {
          cached: cached.text,
          remaining: Math.max(0, COACH_USER_REQUESTS - used),
        };
      const lock = await storage.get<number>(`pending:${key}`);
      if (lock && Date.now() - lock < 120000)
        return { error: "这首曲谱正在生成建议，请稍后查看。" };
      if (
        quota.stopped ||
        quota.requests >= COACH_DAILY_REQUESTS ||
        quota.neurons + COACH_RESERVATION > COACH_DAILY_NEURONS
      )
        return {
          error:
            "今日站点 AI 额度已用完，明天北京时间 08:00 后再试。已保存的建议仍可查看。",
        };
      if (used >= COACH_USER_REQUESTS)
        return {
          error: `你今天的 ${COACH_USER_REQUESTS} 次 AI 额度已用完，明天北京时间 08:00 后恢复。`,
        };
      quota.requests++;
      quota.neurons += COACH_RESERVATION;
      quota.users[userId] = used + 1;
      await storage.put(`quota:${day}`, quota);
      await storage.put(`pending:${key}`, Date.now());
      return { remaining: COACH_USER_REQUESTS - used - 1 };
    });
    if ("error" in reservation) return { error: reservation.error! };
    if ("cached" in reservation)
      return {
        text: reservation.cached!,
        cached: true,
        remaining: reservation.remaining!,
      };
    try {
      const output = await this.env.AI.run(COACH_MODEL, {
        messages,
        max_tokens: COACH_MAX_TOKENS,
        temperature: 0.3,
        stream: false,
      });
      const result = output as {
        response?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { neurons?: number };
      };
      const text = (
        result.response ||
        result.choices?.[0]?.message?.content ||
        ""
      )
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim()
        .slice(0, 3000);
      // Stop for the day if upstream pricing/usage deviates from our conservative
      // reservation. Never try another model or an automatic retry.
      if ((result.usage?.neurons || 0) > COACH_RESERVATION)
        await this.stopForDay(day);
      if (!text) throw new Error("Empty AI response");
      await this.ctx.storage.put(`cache:${key}`, {
        text,
        createdAt: Date.now(),
      } satisfies Cache);
      await this.ctx.storage.setAlarm(Date.now() + 86400000);
      return { text, cached: false, remaining: reservation.remaining! };
    } catch (error) {
      if (/quota|limit|neurons|billing|10000|429/i.test(String(error)))
        await this.stopForDay(day);
      return {
        error:
          "Cloudflare AI 暂不可用或免费额度已耗尽。本次不会自动重试，请继续使用谱面和本地练习建议。",
      };
    } finally {
      await this.ctx.storage.delete(`pending:${key}`);
    }
  }
  private async stopForDay(day: string) {
    await this.ctx.storage.transaction(async (storage) => {
      const quota = await storage.get<Quota>(`quota:${day}`);
      if (quota) await storage.put(`quota:${day}`, { ...quota, stopped: true });
    });
  }
  async alarm() {
    const today = new Date().toISOString().slice(0, 10);
    for (const [key] of await this.ctx.storage.list({ prefix: "quota:" }))
      if (key !== `quota:${today}`) await this.ctx.storage.delete(key);
    for (const [key, timestamp] of await this.ctx.storage.list<number>({
      prefix: "pending:",
    }))
      if (Date.now() - timestamp > 120000) await this.ctx.storage.delete(key);
  }
}
