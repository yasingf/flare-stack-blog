import { call } from "@orpc/server";
import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthTestContext,
  createMockSession,
  seedUser,
} from "tests/test-utils";
import { handleImageRequest } from "@/features/media/service/media.service";
import router from "./server/router";
import {
  COACH_MAX_TOKENS,
  COACH_USER_REQUESTS,
  COACH_DAILY_NEURONS,
  COACH_RESERVATION,
  type CoachFacts,
} from "./coach.schema";
import { demoXml } from "./demo";
import { PIANO_SHARING_TERMS_VERSION } from "./sharing-terms";
import { zipSync, strToU8 } from "fflate";

const facts: CoachFacts = {
  title: "练习曲",
  composer: "",
  format: "musicxml",
  measures: 8,
  notes: 48,
  bpm: 80,
  maxChord: 2,
  shortestBeat: 1,
  leftNotes: 16,
  rightNotes: 32,
  range: [36, 69],
  fingerings: 48,
  estimatedDifficulty: "入门",
};
async function context() {
  const base = createAuthTestContext();
  await seedUser(base.db, base.session.user);
  vi.mocked(base.auth.api.getSession).mockResolvedValue(base.session);
  return { ...base, headers: new Headers() };
}

async function acceptSharing(c: Awaited<ReturnType<typeof context>>) {
  return call(
    router.shared.acceptAgreement,
    { accepted: true, version: PIANO_SHARING_TERMS_VERSION },
    { context: c },
  );
}

describe("shared piano permissions and account consent", () => {
  it("requires a registered account and explicit agreement once per account", async () => {
    const c = await context();
    const input = {
      file: new File([demoXml], "practice.musicxml"),
      title: "练习谱",
      composer: "",
    };
    expect(
      await call(router.shared.agreement, undefined, { context: c }),
    ).toMatchObject({ accepted: false });
    await expect(
      call(router.shared.upload, input, { context: c }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const body of [
      { accepted: false, version: PIANO_SHARING_TERMS_VERSION },
      { accepted: true, version: "old-version" },
    ]) {
      await expect(
        call(router.shared.acceptAgreement, body as never, { context: c }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await acceptSharing(c);
    const accepted = await call(router.shared.agreement, undefined, {
      context: c,
    });
    expect(accepted).toMatchObject({
      accepted: true,
      version: PIANO_SHARING_TERMS_VERSION,
    });
    expect(accepted.acceptedAt).toBeGreaterThan(0);
    await acceptSharing(c);
    expect(
      await call(router.shared.agreement, undefined, { context: c }),
    ).toEqual(accepted);
    const first = await call(router.shared.upload, input, { context: c });
    // A fresh request/session for the same account does not ask for consent again.
    c.headers = new Headers();
    expect(await call(router.shared.upload, input, { context: c })).toEqual(
      first,
    );
    vi.mocked(c.auth.api.getSession).mockResolvedValue(
      createMockSession({ user: { id: "other-account" } }),
    );
    expect(
      await call(router.shared.agreement, undefined, { context: c }),
    ).toMatchObject({ accepted: false });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(null);
    await expect(
      call(router.shared.upload, input, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(acceptSharing(c)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      call(router.advice, facts, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("exposes historical account scores publicly and retires private uploads without bypassing consent", async () => {
    const c = await context();
    const id = crypto.randomUUID();
    const bytes = new TextEncoder().encode(demoXml);
    await c.env.DB.prepare(
      "INSERT INTO piano_scores (id, user_id, hash, title, file_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        c.session.user.id,
        "old-upload",
        "旧账号曲谱",
        "old.musicxml",
        bytes.length,
        Date.now(),
      )
      .run();
    await c.env.R2.put(`piano-private/${id}`, bytes);
    await expect(
      call(
        router.save,
        { file: new File([demoXml], "old.musicxml"), title: "旧入口" },
        { context: c },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(null);
    const list = await call(
      router.shared.list,
      { page: 0, search: "旧账号" },
      { context: c },
    );
    expect(list.items.map((x) => x.id)).toEqual([id]);
    expect(
      await call(router.shared.load, { id }, { context: c }),
    ).toHaveProperty("base64");
    expect(await call(router.load, { id }, { context: c })).toHaveProperty(
      "base64",
    );
    expect(
      (
        await handleImageRequest(
          c.env,
          `piano-private/${id}`,
          new Request(`https://example.com/images/piano-private/${id}`),
        )
      ).status,
    ).toBe(404);
    vi.mocked(c.auth.api.getSession).mockResolvedValue(
      createMockSession({ user: { id: "stranger" } }),
    );
    await expect(
      call(router.remove, { id }, { context: c }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(c.session);
    await call(router.remove, { id }, { context: c });
    expect(await c.env.R2.get(`piano-private/${id}`)).toBeNull();
  });
});

describe("public piano library", () => {
  const fixture = () => new File([demoXml], "练习.musicxml");
  it("publishes immediately and checks deletion ownership", async () => {
    const c = await context();
    c.headers.set("cf-connecting-ip", crypto.randomUUID());
    await acceptSharing(c);
    const saved = await call(
      router.shared.upload,
      { file: fixture(), title: "共享练习", composer: "测试作曲者" },
      { context: c },
    );
    await call(
      router.shared.update,
      { ...saved, title: "上传者的新曲名", composer: "测试作曲者" },
      { context: c },
    );
    vi.mocked(c.auth.api.getSession).mockResolvedValue(null);
    await expect(
      call(
        router.shared.update,
        { ...saved, title: "匿名编辑", composer: "" },
        { context: c },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const list = await call(
      router.shared.list,
      { page: 0, search: "测试作曲者" },
      { context: c },
    );
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(saved.id);
    expect(list.items[0].title).toBe("上传者的新曲名");
    expect(
      new TextDecoder().decode(
        Uint8Array.from(
          atob((await call(router.shared.load, saved, { context: c })).base64),
          (ch) => ch.charCodeAt(0),
        ),
      ),
    ).toBe(demoXml);
    await expect(
      call(
        router.shared.upload,
        { file: fixture(), title: "匿名", composer: "" },
        { context: c },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      call(router.shared.stats, undefined, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(
      createMockSession({ user: { id: "stranger" } }),
    );
    await expect(
      call(router.shared.remove, saved, { context: c }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        router.shared.update,
        { ...saved, title: "越权", composer: "" },
        { context: c },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(
      createMockSession({ user: { id: "admin", role: "admin" } }),
    );
    await call(
      router.shared.update,
      { ...saved, title: "管理后曲名", composer: "作曲" },
      { context: c },
    );
    const stats = await call(router.shared.stats, undefined, { context: c });
    expect(stats).toMatchObject({
      files: 1,
      bytes: fixture().size,
    });
    const storage = await call(router.shared.storage, {}, { context: c });
    expect(storage.files).toBe(1);
    expect(storage.bytes).toBe(fixture().size);
    await call(router.shared.remove, saved, { context: c });
    expect(await c.env.R2.get(`piano-private/${saved.id}`)).toBeNull();
    await expect(
      call(router.shared.load, saved, { context: c }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("deduplicates publication and rejects disguised, malformed, oversized and compressed oversized files", async () => {
    const c = await context();
    await acceptSharing(c);
    c.headers.set("cf-connecting-ip", crypto.randomUUID());
    const saved = await call(
      router.shared.upload,
      { file: fixture(), title: "同一首", composer: "" },
      { context: c },
    );
    expect(
      await call(
        router.shared.upload,
        { file: fixture(), title: "新名字", composer: "" },
        { context: c },
      ),
    ).toEqual(saved);
    const oversized = zipSync({
      "score.xml": new Uint8Array(8 * 1024 * 1024 + 1),
    });
    for (const file of [
      new File(["%PDF"], "fake.mid"),
      new File(["<score-partwise>"], "broken.xml"),
      new File([demoXml], "score.pdf"),
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.mid"),
      new File([oversized], "bomb.mxl"),
    ]) {
      await expect(
        call(
          router.shared.upload,
          { file, title: "错误文件", composer: "" },
          { context: c },
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    const mxl = new File(
      [zipSync({ "score.musicxml": strToU8(demoXml) })],
      "valid.mxl",
    );
    await expect(
      call(
        router.shared.upload,
        { file: mxl, title: "压缩谱", composer: "" },
        { context: c },
      ),
    ).resolves.toHaveProperty("id");
  });
});

async function coachFixture() {
  const stub = exports.PianoCoach.getByName(crypto.randomUUID());
  const run = vi.fn().mockResolvedValue({
    response: "这是一首五指练习曲。先分手慢练，再连接短句。",
    usage: { neurons: 12 },
  });
  await runInDurableObject(stub, (instance) => {
    const runtime = (
      instance as unknown as { env: { PIANO_AI_ENABLED: string; AI: unknown } }
    ).env;
    runtime.PIANO_AI_ENABLED = "true";
    runtime.AI = { run };
  });
  return { stub, run };
}
describe("Cloudflare AI free-budget reservations", () => {
  it("deduplicates concurrent work and reuses saved advice without a charge", async () => {
    const { stub, run } = await coachFixture();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => stub.generate("user", facts)),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(results.some((r) => "text" in r)).toBe(true);
    expect(await stub.generate("user", facts)).toMatchObject({
      cached: true,
      remaining: COACH_USER_REQUESTS - 1,
    });
    expect(await stub.generate("different-user", facts)).toMatchObject({
      cached: true,
      remaining: COACH_USER_REQUESTS,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toMatchObject({
      max_tokens: COACH_MAX_TOKENS,
      stream: false,
    });
  });
  it("caps concurrent distinct requests per user and across all users", async () => {
    const { stub, run } = await coachFixture();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        stub.generate("user", { ...facts, title: `谱${i}` }),
      ),
    );
    expect(run).toHaveBeenCalledTimes(COACH_USER_REQUESTS);
    expect((await stub.status("user")).remaining).toBe(0);
    expect(await stub.saved("user", { ...facts, title: "谱0" })).toHaveProperty(
      "text",
      "这是一首五指练习曲。先分手慢练，再连接短句。",
    );
    expect(
      await stub.saved("other-user", { ...facts, title: "谱0" }),
    ).toHaveProperty("text", "这是一首五指练习曲。先分手慢练，再连接短句。");
    expect(run).toHaveBeenCalledTimes(COACH_USER_REQUESTS);
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.put(
        `quota:${new Date().toISOString().slice(0, 10)}`,
        {
          requests: 158,
          neurons: COACH_DAILY_NEURONS - 2 * COACH_RESERVATION,
          users: {},
          stopped: false,
        },
      );
    });
    await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        stub.generate(`person-${i}`, { ...facts, title: `全站额度测试${i}` }),
      ),
    );
    expect(run).toHaveBeenCalledTimes(COACH_USER_REQUESTS + 2);
    expect((await stub.status("new-user")).remaining).toBe(0);
  });
  it("retains reservations on failure and stops for the day on quota errors", async () => {
    const { stub, run } = await coachFixture();
    run.mockRejectedValue(new Error("429 Workers AI neurons quota exceeded"));
    expect(await stub.generate("user", facts)).toHaveProperty("error");
    expect((await stub.status("user")).remaining).toBe(COACH_USER_REQUESTS - 1);
    expect((await stub.status("user")).exhausted).toBe(true);
    await stub.generate("other", { ...facts, title: "第二首" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
