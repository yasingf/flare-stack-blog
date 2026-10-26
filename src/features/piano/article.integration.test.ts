import { call } from "@orpc/server";
import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  createAdminTestContext,
  createMockSession,
  seedUser,
} from "tests/test-utils";
import router from "./server/router";
import { musicJson } from "./server/music-metadata";
import {
  completeArticle,
  handlePianoArticle,
  requestScoreArticle,
} from "./server/article-jobs";
import { PIANO_SHARING_TERMS_VERSION } from "./sharing-terms";
import { demoXml } from "./demo";
import { type GeneratedArticle, ARTICLE_RESERVATION } from "./article.schema";
import { COACH_DAILY_NEURONS } from "./coach.schema";

const generated: GeneratedArticle = {
  facts: {
    title: "示例练习",
    lookupTitle: "示例练习",
    composer: "",
    artistHint: "",
    format: "musicxml",
    notes: 48,
    measures: 8,
    fingerings: 20,
    pedal: true,
  },
  metadata: {
    title: "示例练习",
    performers: [],
    composers: [],
    lyricists: [],
    albums: [],
    sources: [],
    warnings: [],
  },
  writing: {
    introduction:
      "这份钢琴谱适合结合分手慢练与短句循环，逐步熟悉乐曲的音符和节奏。",
    theme: null,
    themeSource: null,
    evidence: null,
    tips: [
      "先以较慢速度分手练习，再逐步合手。",
      "对照原谱指法和踏板标记，按短句循环练习。",
    ],
  },
  cached: false,
};
async function fixture() {
  const c = {
    ...createAdminTestContext(),
    headers: new Headers({ "cf-connecting-ip": crypto.randomUUID() }),
  };
  await seedUser(c.db, c.session.user);
  vi.mocked(c.auth.api.getSession).mockResolvedValue(c.session);
  await call(
    router.shared.acceptAgreement,
    { accepted: true, version: PIANO_SHARING_TERMS_VERSION },
    { context: c },
  );
  const upload = () =>
    call(
      router.shared.upload,
      {
        file: new File([demoXml], "test.musicxml"),
        title: "示例练习",
        composer: "",
        artistHint: "歌手",
      },
      { context: c },
    );
  return { c, upload };
}
async function job(
  c: Awaited<ReturnType<typeof fixture>>["c"],
  scoreId: string,
) {
  return (await c.env.DB.prepare(
    "SELECT * FROM piano_score_articles WHERE score_id = ?",
  )
    .bind(scoreId)
    .first<{ request_id: string; status: string; post_id: number | null }>())!;
}
describe("administrator-only article pipeline", () => {
  it("queues once on admin upload, respects the switch and denies regular/anonymous access", async () => {
    const { c, upload } = await fixture();
    await call(
      router.articles.configure,
      { autoGenerate: false },
      { context: c },
    );
    const saved = await upload();
    expect(await job(c, saved.id)).toBeNull();
    expect(c.env.QUEUE.send).not.toHaveBeenCalled();
    await call(
      router.articles.configure,
      { autoGenerate: true },
      { context: c },
    );
    await upload();
    await upload();
    expect(c.env.QUEUE.send).toHaveBeenCalledTimes(1);
    expect(await job(c, saved.id)).toMatchObject({ status: "queued" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(
      createMockSession({ user: { id: c.session.user.id, role: null } }),
    );
    for (const [procedure, input] of [
      [router.articles.settings, undefined],
      [router.articles.configure, { autoGenerate: true }],
      [router.articles.list, { ids: [saved.id] }],
      [router.articles.generate, { id: saved.id }],
    ] as const)
      await expect(
        call(procedure as never, input as never, { context: c }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await c.env.DB.prepare("DELETE FROM piano_score_articles").run();
    await upload();
    expect(await job(c, saved.id)).toBeNull();
    vi.mocked(c.auth.api.getSession).mockResolvedValue(null);
    await expect(
      call(router.articles.settings, undefined, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("processes an uploaded score through the queue into an editable unpublished draft", async () => {
    const { c, upload } = await fixture();
    const stub = exports.PianoCoach.getByName("piano-coach-v1");
    const run = vi.fn().mockResolvedValue({ response: generated.writing });
    await runInDurableObject(stub, (instance) => {
      const runtime = (instance as unknown as { env: Env }).env;
      runtime.PIANO_AI_ENABLED = "true";
      runtime.AI = { run } as unknown as Ai;
      (instance as unknown as { music: () => Promise<unknown> }).music =
        async () => ({ recordings: [] });
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("offline source"),
    );
    const { id } = await upload();
    const first = await job(c, id);
    await handlePianoArticle(c.env, {
      scoreId: id,
      requestId: first.request_id,
    });
    const ready = await job(c, id);
    expect(ready).toMatchObject({ status: "ready" });
    expect(run).toHaveBeenCalledTimes(1);
    const post = await c.env.DB.prepare(
      "SELECT status, content_json, published_at FROM posts WHERE id = ?",
    )
      .bind(ready.post_id)
      .first<{
        status: string;
        content_json: string;
        published_at: number | null;
      }>();
    expect(post).toMatchObject({ status: "draft", published_at: null });
    expect(post!.content_json).toContain(`/piano?score=${id}`);
    await handlePianoArticle(c.env, {
      scoreId: id,
      requestId: first.request_id,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("commits a draft once atomically, preserves edits and ignores obsolete queue jobs", async () => {
    const { c, upload } = await fixture();
    const { id } = await upload();
    const first = await job(c, id);
    await c.env.DB.prepare(
      "UPDATE piano_score_articles SET status = 'running'",
    ).run();
    await Promise.all([
      completeArticle(c.env, id, first.request_id, generated),
      completeArticle(c.env, id, first.request_id, generated),
    ]);
    const ready = await job(c, id);
    const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?")
      .bind(ready.post_id)
      .first();
    expect(post).toMatchObject({
      status: "draft",
      public_snapshot_json: null,
      published_at: null,
    });
    expect(
      (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first<{
        n: number;
      }>())!.n,
    ).toBe(1);
    await c.env.DB.prepare(
      "UPDATE posts SET title = '管理员已编辑' WHERE id = ?",
    )
      .bind(ready.post_id)
      .run();
    expect(await requestScoreArticle(c.env, id, c.session.user.id, "")).toEqual(
      { queued: false },
    );
    await handlePianoArticle(c.env, {
      scoreId: id,
      requestId: first.request_id,
    });
    expect(
      await c.env.DB.prepare("SELECT title FROM posts WHERE id = ?")
        .bind(ready.post_id)
        .first(),
    ).toEqual({ title: "管理员已编辑" });
    await c.env.DB.prepare("DELETE FROM posts WHERE id = ?")
      .bind(ready.post_id)
      .run();
    await requestScoreArticle(c.env, id, c.session.user.id, "");
    const second = await job(c, id);
    expect(second.request_id).not.toBe(first.request_id);
    await completeArticle(c.env, id, first.request_id, generated);
    expect(await job(c, id)).toMatchObject({ status: "queued", post_id: null });
  });
  it("persists failure without automatic retries, permits manual retry and blocks removed scores/demoted admins", async () => {
    const { c, upload } = await fixture();
    const { id } = await upload();
    await c.env.R2.delete(`piano-private/${id}`);
    const first = await job(c, id);
    await handlePianoArticle(c.env, {
      scoreId: id,
      requestId: first.request_id,
    });
    expect(await job(c, id)).toMatchObject({ status: "failed" });
    await handlePianoArticle(c.env, {
      scoreId: id,
      requestId: first.request_id,
    });
    expect(await job(c, id)).toMatchObject({ status: "failed" });
    await requestScoreArticle(c.env, id, c.session.user.id, "");
    const second = await job(c, id);
    expect(second.request_id).not.toBe(first.request_id);
    await c.env.DB.prepare(
      "UPDATE piano_score_articles SET status = 'running'",
    ).run();
    await c.env.DB.prepare("UPDATE user SET role = NULL WHERE id = ?")
      .bind(c.session.user.id)
      .run();
    await completeArticle(c.env, id, second.request_id, generated);
    expect(await c.env.DB.prepare("SELECT id FROM posts").first()).toBeNull();
    await c.env.DB.prepare("DELETE FROM piano_scores WHERE id = ?")
      .bind(id)
      .run();
    await completeArticle(c.env, id, second.request_id, generated);
    expect(await c.env.DB.prepare("SELECT id FROM posts").first()).toBeNull();
  });
  it("recovers a stale job without letting its old result commit", async () => {
    const { c, upload } = await fixture();
    const { id } = await upload();
    const first = await job(c, id);
    await c.env.DB.prepare(
      "UPDATE piano_score_articles SET status = 'running', updated_at = 0",
    ).run();
    await call(
      router.articles.generate,
      { id, artistHint: "新歌手" },
      { context: c },
    );
    const next = await job(c, id);
    expect(next.request_id).not.toBe(first.request_id);
    await completeArticle(c.env, id, first.request_id, generated);
    expect(await job(c, id)).toMatchObject({ status: "queued", post_id: null });
  });
});
describe("shared AI budget for articles", () => {
  it("reserves from the coach's budget, keeps failed reservations, and refuses demoted users", async () => {
    const { c } = await fixture();
    const stub = exports.PianoCoach.getByName(crypto.randomUUID());
    const run = vi.fn().mockRejectedValue(new Error("429 neurons quota"));
    await runInDurableObject(stub, async (instance, state) => {
      const runtime = (instance as unknown as { env: Env }).env;
      runtime.PIANO_AI_ENABLED = "true";
      runtime.AI = { run } as unknown as Ai;
      // The source fetch is replaced inside this object; no external request.
      (instance as unknown as { music: () => Promise<unknown> }).music =
        async () => ({ recordings: [] });
      await state.storage.put(
        `quota:${new Date().toISOString().slice(0, 10)}`,
        {
          requests: 20,
          users: {},
          neurons: COACH_DAILY_NEURONS - ARTICLE_RESERVATION,
          stopped: false,
        },
      );
    });
    // No Wikipedia request is needed when tests force source failure globally.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("offline source"),
    );
    const results = await Promise.all([
      stub.generateArticle(c.session.user.id, generated.facts),
      stub.generateArticle(c.session.user.id, {
        ...generated.facts,
        title: "另一首",
      }),
    ]);
    expect(results.every((r) => "error" in r)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await stub.articleStatus(c.session.user.id)).toMatchObject({
      remaining: 0,
      reservedNeurons: COACH_DAILY_NEURONS,
    });
    expect((await stub.status("reader")).exhausted).toBe(true);
    await c.env.DB.prepare("UPDATE user SET role = NULL WHERE id = ?")
      .bind(c.session.user.id)
      .run();
    expect(
      await stub.generateArticle(c.session.user.id, generated.facts),
    ).toEqual({ error: "只有管理员可以生成曲谱文章。" });
  });
  it("caches validated generation, enforces its token ceiling, and does not charge cache hits", async () => {
    const { c } = await fixture();
    const stub = exports.PianoCoach.getByName(crypto.randomUUID());
    const run = vi.fn().mockResolvedValue({
      response: generated.writing,
      usage: { neurons: 30 },
    });
    await runInDurableObject(stub, (instance) => {
      const runtime = (instance as unknown as { env: Env }).env;
      runtime.PIANO_AI_ENABLED = "true";
      runtime.AI = { run } as unknown as Ai;
      (instance as unknown as { music: () => Promise<unknown> }).music =
        async () => ({ recordings: [] });
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("offline source"),
    );
    expect(
      await stub.generateArticle(c.session.user.id, generated.facts),
    ).toMatchObject({ cached: false });
    expect(
      await stub.generateArticle(c.session.user.id, generated.facts),
    ).toMatchObject({ cached: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toMatchObject({
      max_tokens: 2500,
      stream: false,
    });
    expect(await stub.articleStatus(c.session.user.id)).toMatchObject({
      remaining: 9,
      reservedNeurons: ARTICLE_RESERVATION,
    });
  });
});

describe("music source request compatibility", () => {
  it("uses request options accepted by workerd and rejects redirects without following them", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) => {
        // Exercise workerd's real Request parser: it rejects redirect: error.
        const req = new Request(url, options);
        expect(req.redirect).toBe("manual");
        return Response.json({ recordings: [] });
      });
    await expect(
      musicJson("https://musicbrainz.org/ws/2/recording?fmt=json"),
    ).resolves.toEqual({ recordings: [] });
    request.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://other.example/" },
      }),
    );
    await expect(
      musicJson("https://musicbrainz.org/ws/2/recording?fmt=json"),
    ).rejects.toThrow("Music source unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
