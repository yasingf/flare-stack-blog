import type { MusicMetadata, MusicSource } from "../article.schema";

const USER_AGENT =
  "YasingBlog/1.0 (https://blog.yasing.top; yasingfls@outlook.com)";
const MAX_RESPONSE = 512 * 1024;
const unique = (values: string[]) => [...new Set(values)].slice(0, 5);
export const musicTitleKey = (title: string) =>
  title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_·・'’"“”《》…?!.，、:：-]/g, "");
export function lookupTitle(title: string) {
  return (
    title
      .replace(
        /(?:[_（(【[]|\s+-\s+)[^\n]*?(?:指法|踏板|钢琴谱|鋼琴譜|练习版|練習版|简化版|簡化版|piano)[^\n]*$/i,
        "",
      )
      .trim() || title
  );
}

export async function musicJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    // Workers supports only follow/manual. Reject redirects below via ok.
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > MAX_RESPONSE
  )
    throw new Error("Music source unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Music source empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) throw new Error("Music source too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

type Artist = {
  id?: string;
  name?: string;
  aliases?: { name?: string; locale?: string; primary?: boolean }[];
};
type Release = {
  title?: string;
  date?: string;
  status?: string;
  "release-group"?: {
    id?: string;
    title?: string;
    "primary-type"?: string;
    "secondary-types"?: string[];
    "first-release-date"?: string;
  };
};
type Relation = {
  type?: string;
  attributes?: string[];
  artist?: Artist;
  work?: { id?: string; title?: string };
  url?: { resource?: string };
};
type Recording = {
  id?: string;
  title?: string;
  score?: number;
  disambiguation?: string;
  "first-release-date"?: string;
  "artist-credit"?: { name?: string; artist?: Artist }[];
  releases?: Release[];
  relations?: Relation[];
};
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const short = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 160) : "";
const artistName = (artist?: Artist, credit?: string) =>
  short(
    artist?.aliases?.find(
      (a) => a.primary && /^zh(?:_|-)(?:Hans|CN)/i.test(a.locale || ""),
    )?.name ||
      credit ||
      artist?.name,
  );
const creditNames = (recording: Recording) =>
  unique(
    (recording["artist-credit"] || [])
      .map((a) => artistName(a.artist, a.name))
      .filter(Boolean),
  );
const date = (recording: Recording) =>
  recording["first-release-date"] ||
  recording.releases?.map((r) => r.date || "9999").sort()[0] ||
  "9999";
const alternate = (recording: Recording) =>
  /\blive\b|karaoke|remix|instrumental|现场|現場|伴奏/i.test(
    `${recording.title || ""} ${recording.disambiguation || ""}`,
  );

export function chooseRecordings(
  recordings: Recording[],
  title: string,
  artistHint: string,
) {
  let candidates = recordings.filter(
    (r) =>
      uuid(r.id) && short(r.title) && Number(r.score) === 100 && !alternate(r),
  );
  const exact = candidates.filter(
    (r) => musicTitleKey(r.title!) === musicTitleKey(title),
  );
  candidates = exact;
  if (artistHint) {
    const key = musicTitleKey(artistHint);
    candidates = candidates.filter((r) =>
      (r["artist-credit"] || []).some((a) =>
        [
          a.name,
          a.artist?.name,
          ...(a.artist?.aliases || []).map((v) => v.name),
        ].some((name) => name && musicTitleKey(name) === key),
      ),
    );
  }
  // Multiple equally named works/performers need a human hint. Never choose a
  // different song just because it happens to rank first in a search response.
  const identities = new Set(
    candidates.map(
      (r) =>
        `${musicTitleKey(r.title!)}:${(r["artist-credit"] || []).map((a) => a.artist?.id || a.name).join("/")}`,
    ),
  );
  if (identities.size !== 1) return [];
  return candidates.sort((a, b) => date(a).localeCompare(date(b))).slice(0, 3);
}

type MbFetch = (path: string) => Promise<unknown>;
type WikiPage = {
  title?: string;
  missing?: boolean;
  extract?: string;
  pageprops?: { disambiguation?: string };
  fullurl?: string;
  lastrevid?: number;
};

function relatedExcerpt(text: string, title: string, wholePage: boolean) {
  if (wholePage) return text.slice(0, 1600);
  return text
    .split(/\n\s*\n/)
    .filter((p) => musicTitleKey(p).includes(musicTitleKey(title)))
    .join("\n\n")
    .slice(0, 1600);
}

async function wikiSources(
  title: string,
  album: string | undefined,
  workUrl: string | undefined,
): Promise<MusicSource[]> {
  let language = "zh",
    direct = title;
  if (workUrl) {
    try {
      const url = new URL(workUrl);
      if (
        ["zh.wikipedia.org", "en.wikipedia.org"].includes(url.hostname) &&
        url.pathname.startsWith("/wiki/")
      ) {
        language = url.hostname.split(".")[0];
        direct = decodeURIComponent(url.pathname.slice(6));
      }
    } catch {
      /* Ignore a malformed external relationship. */
    }
  }
  const titles = unique([
    direct,
    `${direct} (歌曲)`,
    `${direct} (乐曲)`,
    ...(album && language === "zh"
      ? [album.replace(/[’‘]/g, "'").replace(/…/g, "...")]
      : []),
  ]);
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    redirects: "1",
    prop: "pageprops|info",
    inprop: "url",
    format: "json",
    formatversion: "2",
  });
  const data = (await musicJson(
    `https://${language}.wikipedia.org/w/api.php?${params}`,
  )) as { query?: { pages?: WikiPage[] } };
  const sources: MusicSource[] = [];
  const pages = (data.query?.pages || [])
    .filter(
      (p) => !p.missing && p.pageprops?.disambiguation === undefined && p.title,
    )
    .sort(
      (a, b) =>
        Number(musicTitleKey(b.title!) === musicTitleKey(direct)) -
        Number(musicTitleKey(a.title!) === musicTitleKey(direct)),
    );
  for (const page of pages.slice(0, 1)) {
    // TextExtracts only permits one full-page extract per request.
    const extractParams = new URLSearchParams({
      action: "query",
      titles: page.title!,
      prop: "extracts",
      explaintext: "1",
      exchars: "3000",
      format: "json",
      formatversion: "2",
    });
    const details = (await musicJson(
      `https://${language}.wikipedia.org/w/api.php?${extractParams}`,
    )) as { query?: { pages?: WikiPage[] } };
    const text = details.query?.pages?.[0]?.extract;
    if (!text) continue;
    const sameTitle =
      musicTitleKey(page.title!.replace(/\s*\([^)]*\)$/, "")) ===
      musicTitleKey(direct);
    const excerpt = relatedExcerpt(text, title, sameTitle);
    if (excerpt.length < 30) continue;
    // Construct links ourselves instead of trusting URL fields in source data.
    sources.push({
      id: `wiki-${sources.length + 1}`,
      title: `维基百科：${page.title}`,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title!.replace(/ /g, "_"))}`,
      excerpt,
    });
  }
  return sources.slice(0, 2);
}

export async function lookupMusic(
  title: string,
  artistHint: string,
  mb: MbFetch,
): Promise<MusicMetadata> {
  title = lookupTitle(title).slice(0, 160);
  const metadata: MusicMetadata = {
    title,
    performers: [],
    composers: [],
    lyricists: [],
    albums: [],
    sources: [],
    warnings: [],
  };
  let workWiki: string | undefined;
  try {
    const escape = (value: string) => value.replace(/[\\"]/g, "\\$&");
    const query = `recording:"${escape(title)}"${artistHint ? ` AND artist:"${escape(artistHint)}"` : ""}`;
    const result = (await mb(
      `recording?${new URLSearchParams({ query, fmt: "json", limit: "20" })}`,
    )) as { recordings?: Recording[] };
    let candidates = chooseRecordings(
      result.recordings || [],
      title,
      "", // MusicBrainz resolves performer aliases (including simplified Chinese).
    );
    let matchedWork: string | undefined;
    if (!candidates.length && !artistHint) {
      // Covers may share a title. Only group them when the work search resolves
      // to one exact composition, then verify the chosen recording's work link.
      const works = (await mb(
        `work?${new URLSearchParams({ query: `work:"${escape(title)}"`, fmt: "json", limit: "10" })}`,
      )) as { works?: { id?: string; title?: string; score?: number }[] };
      const matches = (works.works || []).filter(
        (work) =>
          uuid(work.id) &&
          Number(work.score) === 100 &&
          musicTitleKey(work.title || "") === musicTitleKey(title),
      );
      if (new Set(matches.map((work) => work.id)).size === 1) {
        matchedWork = matches[0].id;
        candidates = (result.recordings || [])
          .filter(
            (r) =>
              uuid(r.id) &&
              Number(r.score) === 100 &&
              musicTitleKey(r.title || "") === musicTitleKey(title) &&
              !alternate(r),
          )
          .sort((a, b) => date(a).localeCompare(date(b)))
          .slice(0, 5);
      }
    }
    if (!candidates.length) {
      metadata.warnings.push(
        "未找到唯一匹配的录音；如有同名乐曲，请补充演唱／演奏者后重试。",
      );
    } else {
      let recording: Recording | undefined;
      for (const candidate of candidates) {
        const value = (await mb(
          `recording/${candidate.id}?inc=work-rels+artist-credits+releases+release-groups&fmt=json`,
        )) as Recording;
        if (
          value.relations?.some(
            (r) => r.type === "performance" && r.attributes?.includes("live"),
          )
        )
          continue;
        if (
          matchedWork &&
          !value.relations?.some(
            (r) => r.type === "performance" && r.work?.id === matchedWork,
          )
        )
          continue;
        recording = value;
        break;
      }
      if (recording && uuid(recording.id)) {
        metadata.performers = creditNames(recording);
        if (matchedWork)
          metadata.warnings.push(
            `存在多个演唱版本，本文资料对应${metadata.performers.join("、")}的参考录音，请核对与本谱的关系。`,
          );
        const releases = (recording.releases || [])
          .filter(
            (r) =>
              r.status === "Official" &&
              r["release-group"]?.["primary-type"] === "Album" &&
              !(r["release-group"]?.["secondary-types"] || []).some((t) =>
                ["Compilation", "Live", "Remix", "DJ-mix"].includes(t),
              ),
          )
          .sort((a, b) =>
            (
              a["release-group"]?.["first-release-date"] ||
              a.date ||
              "9999"
            ).localeCompare(
              b["release-group"]?.["first-release-date"] || b.date || "9999",
            ),
          );
        metadata.albums = unique(
          releases
            .map((r) => short(r["release-group"]?.title || r.title))
            .filter(Boolean),
        ).slice(0, 2);
        metadata.sources.push({
          id: "mb-recording",
          title: `MusicBrainz：${short(recording.title)}`,
          url: `https://musicbrainz.org/recording/${recording.id}`,
        });
        if (musicTitleKey(recording.title || "") !== musicTitleKey(title))
          metadata.warnings.push(
            `匹配条目名为「${short(recording.title)}」，请确认与上传曲谱为同一乐曲。`,
          );
        const work = recording.relations?.find(
          (r) => r.type === "performance" && uuid(r.work?.id),
        )?.work;
        if (work && uuid(work.id)) {
          const details = (await mb(
            `work/${work.id}?inc=artist-rels+url-rels&fmt=json`,
          )) as { relations?: Relation[] };
          metadata.composers = unique(
            (details.relations || [])
              .filter((r) => r.type === "composer")
              .map((r) => artistName(r.artist))
              .filter(Boolean),
          );
          metadata.lyricists = unique(
            (details.relations || [])
              .filter((r) => r.type === "lyricist")
              .map((r) => artistName(r.artist))
              .filter(Boolean),
          );
          metadata.sources.push({
            id: "mb-work",
            title: `MusicBrainz 作品署名：${short(work.title) || title}`,
            url: `https://musicbrainz.org/work/${work.id}`,
          });
          workWiki = details.relations?.find((r) => r.type === "wikipedia")?.url
            ?.resource;
        }
      } else
        metadata.warnings.push(
          "检索结果只有现场或无法核实的版本，未自动填入词曲与专辑信息。",
        );
    }
  } catch {
    metadata.warnings.push(
      "音乐数据库暂时无法完整读取，未取得的资料请稍后核实。",
    );
  }
  try {
    metadata.sources.push(
      ...(await wikiSources(title, metadata.albums[0], workWiki)),
    );
  } catch {
    metadata.warnings.push("百科资料暂时不可用，乐曲主题需另行核实。");
  }
  return metadata;
}
