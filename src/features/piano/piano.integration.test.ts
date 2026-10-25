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
import { COACH_MAX_TOKENS, type CoachFacts } from "./coach.schema";

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

describe("private piano library", () => {
  it("requires login for listing, reading and AI generation", async () => {
    const c = await context();
    vi.mocked(c.auth.api.getSession).mockResolvedValue(null);
    await expect(
      call(router.list, undefined, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      call(router.load, { id: crypto.randomUUID() }, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      call(router.advice, facts, { context: c }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("keeps uploads private even through the old public image handler", async () => {
    const c = await context();
    const file = new File(["MThd piano-test"], "practice.mid");
    const saved = await call(
      router.save,
      { file, title: "练习谱" },
      { context: c },
    );
    expect(await call(router.list, undefined, { context: c })).toHaveLength(1);
    const loaded = await call(router.load, saved, { context: c });
    expect(atob(loaded.base64)).toBe("MThd piano-test");
    expect(
      (
        await handleImageRequest(
          c.env,
          `piano-private/${saved.id}`,
          new Request(`https://example.com/images/piano-private/${saved.id}`),
        )
      ).status,
    ).toBe(404);
    const stranger = createMockSession({
      user: { id: "other-user", email: "other@example.com" },
    });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(stranger);
    expect(await call(router.list, undefined, { context: c })).toHaveLength(0);
    await expect(
      call(router.load, saved, { context: c }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.remove, saved, { context: c }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.mocked(c.auth.api.getSession).mockResolvedValue(c.session);
    await call(router.remove, saved, { context: c });
    expect(await c.env.R2.get(`piano-private/${saved.id}`)).toBeNull();
  });
  it("deduplicates the same bytes and rejects PDF uploads", async () => {
    const c = await context();
    const file = new File(["MThd same"], "same.mid");
    const a = await call(
      router.save,
      { file, title: "同一首" },
      { context: c },
    );
    const b = await call(router.save, { file, title: "重复" }, { context: c });
    expect(a.id).toBe(b.id);
    const rejected = await call(
      router.save,
      { file: new File(["pdf"], "score.pdf"), title: "PDF" },
      { context: c },
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(rejected).toMatchObject({ code: "BAD_REQUEST" });
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
      remaining: 2,
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
    expect(run).toHaveBeenCalledTimes(3);
    expect((await stub.status("user")).remaining).toBe(0);
    expect(await stub.saved("user", { ...facts, title: "谱0" })).toHaveProperty(
      "text",
      "这是一首五指练习曲。先分手慢练，再连接短句。",
    );
    expect(await stub.saved("other-user", { ...facts, title: "谱0" })).toEqual({
      text: null,
    });
    expect(run).toHaveBeenCalledTimes(3);
    await Promise.all(
      Array.from({ length: 80 }, (_, i) => stub.generate(`person-${i}`, facts)),
    );
    expect(run).toHaveBeenCalledTimes(50);
    expect((await stub.status("new-user")).remaining).toBe(0);
  });
  it("retains reservations on failure and stops for the day on quota errors", async () => {
    const { stub, run } = await coachFixture();
    run.mockRejectedValue(new Error("429 Workers AI neurons quota exceeded"));
    expect(await stub.generate("user", facts)).toHaveProperty("error");
    expect((await stub.status("user")).remaining).toBe(2);
    expect((await stub.status("user")).exhausted).toBe(true);
    await stub.generate("other", { ...facts, title: "第二首" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
