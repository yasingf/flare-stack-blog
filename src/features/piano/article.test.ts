import { afterEach, describe, expect, it, vi } from "vitest";
import {
  articlePrompt,
  buildScoreArticle,
  verifiedTheme,
  type GeneratedArticle,
} from "./article.schema";
import {
  chooseRecordings,
  lookupMusic,
  lookupTitle,
  musicJson,
} from "./server/music-metadata";
import { validateSharedScore } from "./server/score-file";
import { Midi } from "@tonejs/midi";
import { demoXml } from "./demo";

export const generated: GeneratedArticle = {
  facts: {
    title: "示例乐曲",
    lookupTitle: "示例乐曲",
    composer: "未核实署名",
    artistHint: "",
    format: "musicxml",
    notes: 48,
    measures: 8,
    fingerings: 20,
    pedal: true,
  },
  metadata: {
    title: "示例乐曲",
    performers: ["演奏者"],
    composers: ["作曲者"],
    lyricists: [],
    albums: ["参考专辑"],
    sources: [
      {
        id: "wiki-1",
        title: "作品资料",
        url: "https://zh.wikipedia.org/wiki/Example",
        excerpt: "这首乐曲描绘了人们对过去生活的怀念与对未来的期望。",
      },
    ],
    warnings: [],
  },
  writing: {
    introduction:
      "这份钢琴谱适合结合分手慢练与短句循环，逐步熟悉乐曲的音符和节奏。",
    theme: "关于回忆的乐曲。",
    themeSource: "wiki-1",
    evidence: "这首乐曲描绘了人们对过去生活的怀念与对未来的期望。",
    tips: [
      "先以较慢速度分手练习，再逐步合手。",
      "对照原谱指法和踏板标记，按短句循环练习。",
    ],
  },
  cached: false,
};
afterEach(() => vi.unstubAllGlobals());
describe("piano article source and output boundaries", () => {
  it("requires exact evidence for theme and never renders model HTML as markup", () => {
    expect(verifiedTheme(generated.writing, generated.metadata)).not.toBeNull();
    const unsafe = {
      ...generated,
      writing: {
        ...generated.writing,
        themeSource: "invented",
        introduction:
          "<img src=x onerror=alert(1)>这是一份需要认真核对的练习谱。",
      },
    };
    const article = buildScoreArticle("score", unsafe);
    expect(JSON.stringify(article.contentJson)).not.toContain('"type":"image"');
    expect(article.contentJson.content[0].content?.[0].text).toContain("<img");
    expect(JSON.stringify(article)).not.toContain("关于回忆的乐曲");
    expect(JSON.stringify(article)).toContain("未找到可核实记录");
    expect(
      articlePrompt(generated.facts, generated.metadata)[0].content,
    ).toContain("不可信资料");
    expect(
      verifiedTheme(
        {
          ...generated.writing,
          evidence: "不存在的来源原句，无法支持主题的解读内容",
        },
        generated.metadata,
      ),
    ).toBeNull();
  });
  it("reads only bounded score statistics and detects MIDI CC64 and MusicXML pedal", () => {
    const midi = new Midi();
    midi
      .addTrack()
      .addNote({ midi: 60, time: 0, duration: 1 })
      .addCC({ number: 64, value: 1, time: 0 });
    expect(validateSharedScore(midi.toArray(), "test.mid")).toMatchObject({
      notes: 1,
      pedal: true,
      fingerings: 0,
    });
    const xml = demoXml.replace(
      "<note>",
      '<direction><direction-type><pedal type="start"/></direction-type></direction><note>',
    );
    expect(
      validateSharedScore(new TextEncoder().encode(xml), "test.musicxml"),
    ).toMatchObject({ format: "musicxml", pedal: true });
    expect(lookupTitle("富士山下_九度手型_指法踏板版")).toBe("富士山下");
  });
  it("does not confuse covers, similar titles or live recordings with a unique match", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      score: 100,
      title: "测试曲",
      "artist-credit": [{ name: "歌手甲", artist: { id: "a" } }],
    };
    const cover = {
      ...base,
      id: "22222222-2222-4222-8222-222222222222",
      "artist-credit": [{ name: "歌手乙", artist: { id: "b" } }],
    };
    expect(chooseRecordings([base, cover], "测试曲", "")).toEqual([]);
    expect(chooseRecordings([base, cover], "测试曲", "歌手甲")).toEqual([base]);
    expect(
      chooseRecordings([{ ...base, title: "相似测试曲" }], "测试曲", ""),
    ).toEqual([]);
    expect(
      chooseRecordings([{ ...base, disambiguation: "live" }], "测试曲", ""),
    ).toEqual([]);
  });
  it("follows only fixed source hosts, excludes disambiguation pages and records credits", async () => {
    const recordingId = "11111111-1111-4111-8111-111111111111",
      workId = "22222222-2222-4222-8222-222222222222";
    const mb = vi.fn(async (path: string) =>
      path.startsWith("recording?")
        ? {
            recordings: [
              {
                id: recordingId,
                title: "测试曲",
                score: 100,
                "artist-credit": [{ name: "歌手", artist: { id: "a" } }],
              },
            ],
          }
        : path.startsWith("recording/")
          ? {
              id: recordingId,
              title: "测试曲",
              "artist-credit": [{ name: "歌手" }],
              releases: [
                {
                  status: "Official",
                  title: "录音专辑",
                  "release-group": {
                    "primary-type": "Album",
                    "secondary-types": [],
                  },
                },
              ],
              relations: [{ type: "performance", work: { id: workId } }],
            }
          : {
              relations: [
                { type: "composer", artist: { name: "作者" } },
                {
                  type: "wikipedia",
                  url: { resource: "https://evil.example/internal" },
                },
              ],
            },
    );
    const fetcher = vi.fn(async (_url: string) =>
      Response.json({
        query: {
          pages: [
            {
              title: "测试曲",
              pageprops: { disambiguation: "" },
              extract: "不要把此消歧义页当作乐曲介绍",
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await lookupMusic("测试曲", "歌手", mb);
    expect(result).toMatchObject({
      performers: ["歌手"],
      composers: ["作者"],
      albums: ["录音专辑"],
    });
    expect(result.sources).toHaveLength(2);
    expect(
      fetcher.mock.calls.every((call) =>
        String(call[0]).startsWith("https://zh.wikipedia.org/w/api.php?"),
      ),
    ).toBe(true);
    expect(mb.mock.calls[0][0]).toContain("artist");
  });
  it("groups covers only through a unique work and rejects a recording linked to a different work", async () => {
    const work = "11111111-1111-4111-8111-111111111111",
      wrong = "22222222-2222-4222-8222-222222222222",
      right = "33333333-3333-4333-8333-333333333333";
    const rec = (id: string, artist: string) => ({
      id,
      title: "测试曲",
      score: 100,
      "artist-credit": [{ name: artist }],
    });
    const mb = vi.fn(async (path: string) => {
      if (path.startsWith("recording?"))
        return {
          recordings: [rec(wrong, "另一首同名歌手"), rec(right, "目标歌手")],
        };
      if (path.startsWith("work?"))
        return { works: [{ id: work, title: "测试曲", score: 100 }] };
      if (path.includes(wrong))
        return {
          ...rec(wrong, "另一首同名歌手"),
          relations: [{ type: "performance", work: { id: wrong } }],
        };
      if (path.startsWith("recording/"))
        return {
          ...rec(right, "目标歌手"),
          relations: [{ type: "performance", work: { id: work } }],
        };
      return {
        relations: [{ type: "composer", artist: { name: "目标作者" } }],
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ query: { pages: [] } })),
    );
    expect(await lookupMusic("测试曲", "", mb)).toMatchObject({
      performers: ["目标歌手"],
      composers: ["目标作者"],
    });
  });
  it("rejects overlarge upstream data even without a Content-Length header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(513 * 1024))),
    );
    await expect(
      musicJson("https://musicbrainz.org/ws/2/recording"),
    ).rejects.toThrow("too large");
  });
});
