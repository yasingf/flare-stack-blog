import { Midi } from "@tonejs/midi";
import { strFromU8, unzipSync } from "fflate";

export type Hand = "left" | "right";
export type PianoNote = {
  id: string;
  pitch: number;
  beat: number;
  duration: number;
  velocity: number;
  hand: Hand;
  measure: number;
  finger?: string;
  symbols: string[];
};
export type PianoMeasure = {
  number: string;
  sourceIndex: number;
  beat: number;
  duration: number;
  beats: number;
  beatType: number;
};
export type PianoScore = {
  title: string;
  composer: string;
  format: "musicxml" | "midi";
  xml: string;
  notes: PianoNote[];
  measures: PianoMeasure[];
  tempos: { beat: number; bpm: number }[];
  pedals: { beat: number; down: boolean }[];
  totalBeats: number;
  warnings: string[];
};
export const MAX_SCORE_BYTES = 4 * 1024 * 1024;
const MAX_NOTES = 16000;
const EPS = 0.0001;
export function lastIndexWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) if (predicate(items[i])) return i;
  return -1;
}
export function lastWhere<T>(items: T[], predicate: (item: T) => boolean) {
  return items[lastIndexWhere(items, predicate)];
}
const steps: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const text = (e: Element | Document, selector: string, fallback = "") =>
  e.querySelector(selector)?.textContent?.trim() || fallback;
const num = (e: Element | Document, selector: string, fallback: number) => {
  const value = Number(text(e, selector, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
};
const attr = (e: Element | null, name: string, fallback: number) => {
  const value = Number(e?.getAttribute(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

export function noteName(pitch: number) {
  return `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function tempoAt(score: PianoScore, beat: number) {
  return lastWhere(score.tempos, (t) => t.beat <= beat + EPS)?.bpm || 100;
}

export function beatSeconds(score: PianoScore, beat: number) {
  let seconds = 0;
  for (let i = 0; i < score.tempos.length; i++) {
    const t = score.tempos[i];
    const end = Math.min(beat, score.tempos[i + 1]?.beat ?? beat);
    if (end > t.beat) seconds += ((end - t.beat) * 60) / t.bpm;
  }
  return seconds;
}

export function secondsBeat(score: PianoScore, seconds: number) {
  let remaining = Math.max(0, seconds);
  for (let i = 0; i < score.tempos.length; i++) {
    const t = score.tempos[i];
    const span =
      (((score.tempos[i + 1]?.beat ?? Infinity) - t.beat) * 60) / t.bpm;
    if (remaining < span) return t.beat + (remaining * t.bpm) / 60;
    remaining -= span;
  }
  return score.totalBeats;
}

export function currentMeasure(score: PianoScore, beat: number) {
  return lastIndexWhere(score.measures, (m) => m.beat <= beat + EPS);
}

export function parseMusicXml(
  source: string,
  fileName = "未命名曲谱",
): PianoScore {
  if (new TextEncoder().encode(source).length > MAX_SCORE_BYTES)
    throw new Error("曲谱不能超过 4 MB。");
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source))
    throw new Error("曲谱含有不支持的 XML 实体。");
  const document = new DOMParser().parseFromString(
    source.replace(/<!DOCTYPE[^>]*>/gi, ""),
    "application/xml",
  );
  if (
    document.querySelector("parsererror") ||
    document.documentElement.localName !== "score-partwise"
  ) {
    throw new Error(
      "无法读取曲谱，请导出为 MusicXML（score-partwise）后重试。",
    );
  }
  // OSMD receives notation only. Never pass external images, links or scripts through.
  document
    .querySelectorAll("script, iframe, image, credit-image, link")
    .forEach((e) => e.remove());
  document.querySelectorAll("*").forEach((e) => {
    for (const a of Array.from(e.attributes))
      if (/^(on|href$|src$|xlink:)/i.test(a.name)) e.removeAttribute(a.name);
  });
  const parts = [...document.documentElement.children].filter(
    (e) => e.localName === "part",
  );
  if (!parts.length || parts.length > 16)
    throw new Error("请选择包含 1–16 个声部的钢琴曲谱。");
  type RawNote = PianoNote & {
    tieStart: boolean;
    tieStop: boolean;
    voice: string;
    part: number;
  };
  const raw: RawNote[][] = [];
  const measureMeta: PianoMeasure[] = [];
  const tempoByMeasure: { offset: number; bpm: number }[][] = [];
  const pedalByMeasure: { offset: number; down: boolean }[][] = [];
  const repeatMeta: {
    forward: boolean;
    backward: number;
    endings: number[];
  }[] = [];
  const warnings = new Set<string>();
  let count = 0;
  parts.forEach((part, partIndex) => {
    let divisions = 1,
      beats = 4,
      beatType = 4,
      transpose = 0;
    let activeEndings: number[] = [];
    [...part.children]
      .filter((m) => m.localName === "measure")
      .forEach((measure, index) => {
        if (index > 1500) throw new Error("曲谱过长，请拆分为较短的练习片段。");
        let cursor = 0,
          lastStart = 0,
          furthest = 0;
        raw[index] ??= [];
        tempoByMeasure[index] ??= [];
        pedalByMeasure[index] ??= [];
        for (const e of measure.children) {
          if (e.localName === "attributes") {
            divisions = Math.max(1, num(e, "divisions", divisions));
            beats = Math.max(1, num(e, "time > beats", beats));
            beatType = Math.max(1, num(e, "time > beat-type", beatType));
            transpose = num(e, "transpose > chromatic", transpose);
          } else if (e.localName === "backup")
            cursor -= num(e, "duration", 0) / divisions;
          else if (e.localName === "forward")
            cursor += num(e, "duration", 0) / divisions;
          else if (e.localName === "direction") {
            const offset = Math.max(
              0,
              cursor + num(e, "offset", 0) / divisions,
            );
            const sound = e.querySelector("sound");
            let bpm = attr(sound, "tempo", 0);
            if (!bpm && e.querySelector("metronome")) {
              const unit =
                { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25 }[
                  text(e, "beat-unit")
                ] || 1;
              bpm =
                num(e, "per-minute", 100) *
                unit *
                (e.querySelector("beat-unit-dot") ? 1.5 : 1);
            }
            if (bpm > 0)
              tempoByMeasure[index].push({
                offset,
                bpm: Math.min(400, Math.max(20, bpm)),
              });
            const pedal = e.querySelector("pedal");
            const pedalType = pedal?.getAttribute("type");
            if (pedalType === "change")
              pedalByMeasure[index].push({ offset, down: false });
            if (
              pedal &&
              ["start", "stop", "change", "resume", "discontinue"].includes(
                pedalType || "",
              )
            )
              pedalByMeasure[index].push({
                offset,
                down: pedalType !== "stop" && pedalType !== "discontinue",
              });
            if (sound?.hasAttribute("damper-pedal"))
              pedalByMeasure[index].push({
                offset,
                down: !["no", "0"].includes(
                  sound.getAttribute("damper-pedal")!,
                ),
              });
            if (
              sound &&
              ["dacapo", "dalsegno", "tocoda"].some((a) =>
                sound.hasAttribute(a),
              )
            )
              warnings.add(
                "D.C. / D.S. / Coda 跳转请用 A–B 循环选择练习段；当前按小节顺序播放。",
              );
          } else if (e.localName === "note") {
            const grace = !!e.querySelector("grace");
            const duration = Math.max(0, num(e, "duration", 0) / divisions);
            const chord = !!e.querySelector("chord");
            const start = chord ? lastStart : cursor;
            if (!chord) {
              lastStart = cursor;
              cursor += duration;
            }
            furthest = Math.max(furthest, cursor, start + duration);
            if (grace) {
              warnings.add("装饰音保留在谱面中，跟弹评分只检查有时值的主音。");
              continue;
            }
            const p = e.querySelector("pitch");
            if (!p || duration <= 0) continue;
            const pitch =
              (num(p, "octave", 4) + 1) * 12 +
              (steps[text(p, "step", "C")] ?? 0) +
              num(p, "alter", 0) +
              transpose;
            if (pitch < 0 || pitch > 127 || !Number.isInteger(pitch)) {
              warnings.add("微分音和 MIDI 音域以外的音符未加入播放。");
              continue;
            }
            const hand: Hand =
              num(e, "staff", parts.length > 1 ? partIndex + 1 : 1) > 1
                ? "left"
                : "right";
            const symbols = [
              ...e.querySelectorAll(
                "notations > *, notations > articulations > *, notations > ornaments > *",
              ),
            ].map((n) => n.localName);
            const finger = text(e, "fingering").slice(0, 8) || undefined;
            const note: RawNote = {
              id: `${partIndex}:${index}:${count++}`,
              pitch,
              beat: Math.max(0, start),
              duration,
              velocity: Math.min(
                1,
                Math.max(0.05, attr(e, "dynamics", 75) / 100),
              ),
              hand,
              measure: index,
              finger,
              symbols,
              tieStart: !!e.querySelector(
                'tie[type="start"], tied[type="start"]',
              ),
              tieStop: !!e.querySelector('tie[type="stop"], tied[type="stop"]'),
              voice: text(e, "voice", "1"),
              part: partIndex,
            };
            raw[index].push(note);
            if (count > MAX_NOTES)
              throw new Error("音符过多，请拆分曲谱后再导入。");
          }
        }
        const duration =
          measure.getAttribute("implicit") === "yes"
            ? furthest || (beats * 4) / beatType
            : Math.max(furthest, (beats * 4) / beatType);
        if (!measureMeta[index] || duration > measureMeta[index].duration)
          measureMeta[index] = {
            number: measure.getAttribute("number") || String(index + 1),
            sourceIndex: index,
            beat: 0,
            duration,
            beats,
            beatType,
          };
        if (partIndex === 0) {
          const endingStart = measure.querySelector('ending[type="start"]');
          if (endingStart)
            activeEndings = (endingStart.getAttribute("number") || "")
              .split(/[, ]+/)
              .map(Number)
              .filter((n) => n > 0);
          repeatMeta[index] = {
            forward: !!measure.querySelector('repeat[direction="forward"]'),
            backward: measure.querySelector('repeat[direction="backward"]')
              ? Math.min(
                  4,
                  Math.max(
                    2,
                    attr(
                      measure.querySelector('repeat[direction="backward"]'),
                      "times",
                      2,
                    ),
                  ),
                )
              : 0,
            endings: [...activeEndings],
          };
          if (
            measure.querySelector(
              'ending[type="stop"], ending[type="discontinue"]',
            )
          )
            activeEndings = [];
        }
      });
  });
  // Expand simple repeats and numbered endings; all displays retain source measure indices.
  const order: number[] = [];
  let repeatStart = 0,
    pass = 1,
    finishedRepeat = false;
  const usedRepeats = new Map<number, number>();
  for (let i = 0, guard = 0; i < measureMeta.length && guard++ < 6000; i++) {
    const r = repeatMeta[i];
    if (finishedRepeat && !r?.endings.length) {
      pass = 1;
      finishedRepeat = false;
    }
    if (r?.forward && !usedRepeats.has(i)) repeatStart = i;
    if (!r?.endings.length || r.endings.includes(pass)) order.push(i);
    if (r?.backward) {
      const times = (usedRepeats.get(i) || 1) + 1;
      if (times <= r.backward) {
        usedRepeats.set(i, times);
        pass = times;
        i = repeatStart - 1;
      } else {
        repeatStart = i + 1;
        finishedRepeat = true;
      }
    }
  }
  const notes: PianoNote[] = [],
    measures: PianoMeasure[] = [],
    tempos: PianoScore["tempos"] = [],
    pedals: PianoScore["pedals"] = [];
  let beat = 0,
    lastTempo = 100;
  const ties = new Map<string, PianoNote>();
  order.forEach((sourceIndex, measureIndex) => {
    const m = measureMeta[sourceIndex];
    measures.push({ ...m, beat });
    const localTempos = tempoByMeasure[sourceIndex];
    if (measureIndex === 0)
      tempos.push({
        beat: 0,
        bpm: localTempos.find((t) => t.offset === 0)?.bpm || 100,
      });
    for (const t of localTempos) {
      lastTempo = t.bpm;
      tempos.push({ beat: beat + t.offset, bpm: lastTempo });
    }
    for (const p of pedalByMeasure[sourceIndex])
      pedals.push({ beat: beat + p.offset, down: p.down });
    for (const n of raw[sourceIndex]) {
      const tieKey = `${n.part}:${n.voice}:${n.hand}:${n.pitch}`;
      const previous = ties.get(tieKey);
      const start = beat + n.beat;
      if (
        n.tieStop &&
        previous &&
        Math.abs(previous.beat + previous.duration - start) < EPS
      ) {
        previous.duration += n.duration;
        if (!n.tieStart) ties.delete(tieKey);
      } else {
        const note = {
          ...n,
          id: `${measureIndex}/${n.id}`,
          beat: start,
          measure: measureIndex,
        };
        notes.push(note);
        if (n.tieStart) ties.set(tieKey, note);
        else ties.delete(tieKey);
      }
    }
    beat += m.duration;
  });
  if (!notes.length) throw new Error("文件中没有可演奏的音符。");
  return {
    title: text(
      document,
      "work-title",
      text(document, "movement-title", fileName.replace(/\.[^.]+$/, "")),
    ).slice(0, 160),
    composer: text(document, 'creator[type="composer"]').slice(0, 160),
    format: "musicxml",
    xml: new XMLSerializer().serializeToString(document),
    notes: notes.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch),
    measures,
    tempos: tempos
      .sort((a, b) => a.beat - b.beat)
      .filter((t, i, a) => a[i + 1]?.beat !== t.beat),
    pedals: pedals.sort((a, b) => a.beat - b.beat),
    totalBeats: beat,
    warnings: [...warnings],
  };
}

export function parseMidi(bytes: ArrayBuffer, fileName: string): PianoScore {
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq;
  const notes: PianoNote[] = [];
  const tracks = midi.tracks.filter(
    (t) => !t.instrument.percussion && t.notes.length,
  );
  for (const [trackIndex, track] of tracks.entries()) {
    for (const [index, n] of track.notes.entries()) {
      notes.push({
        id: `midi:${trackIndex}:${index}`,
        pitch: n.midi,
        beat: n.ticks / ppq,
        duration: Math.max(0.0625, n.durationTicks / ppq),
        velocity: n.velocity,
        hand: n.midi < 60 ? "left" : "right",
        measure: 0,
        symbols: [],
      });
    }
  }
  if (!notes.length) throw new Error("MIDI 文件中没有钢琴可演奏的音符。");
  if (notes.length > MAX_NOTES)
    throw new Error("MIDI 音符过多，请先截取练习片段。");
  notes.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
  const end = Math.max(...notes.map((n) => n.beat + n.duration));
  const measures: PianoMeasure[] = [];
  for (let beat = 0, i = 0; beat < end; i++) {
    const ts = lastWhere(
      midi.header.timeSignatures,
      (t) => t.ticks / ppq <= beat,
    )?.timeSignature || [4, 4];
    const duration = (ts[0] * 4) / ts[1];
    if (duration <= 0 || i > 1500) throw new Error("MIDI 拍号或长度不受支持。");
    measures.push({
      number: String(i + 1),
      sourceIndex: i,
      beat,
      duration,
      beats: ts[0],
      beatType: ts[1],
    });
    beat += duration;
  }
  for (const n of notes)
    n.measure = lastIndexWhere(measures, (m) => m.beat <= n.beat + EPS);
  const tempos = midi.header.tempos.map((t) => ({
    beat: t.ticks / ppq,
    bpm: Math.min(400, Math.max(20, t.bpm)),
  }));
  if (!tempos.length || tempos[0].beat !== 0)
    tempos.unshift({ beat: 0, bpm: 120 });
  const pedals = tracks
    .flatMap((t) =>
      (t.controlChanges[64] || []).map((p) => ({
        beat: p.ticks / ppq,
        down: p.value >= 0.5,
      })),
    )
    .sort((a, b) => a.beat - b.beat);
  const score: PianoScore = {
    // MIDI text events have no dependable Unicode encoding. The browser's
    // filename is reliable, including Chinese names exported by score editors.
    title: (fileName.replace(/\.[^.]+$/, "") || "MIDI 练习谱").slice(0, 160),
    composer: "",
    format: "midi",
    xml: "",
    notes,
    measures,
    tempos,
    pedals,
    totalBeats: measures.at(-1)!.beat + measures.at(-1)!.duration,
    warnings: [
      "MIDI 不含原版指法、连线与完整排版。五线谱为按十六分音符量化的参考谱；播放和跟弹保留原始节奏。左右手暂按中央 C 分配，可在音符详情中调整。",
    ],
  };
  score.xml = midiToXml(score);
  return score;
}

export function midiToXml(score: PianoScore) {
  const escape = (s: string) =>
    s.replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const measures = score.measures
    .map((m, mi) => {
      const size = Math.round(m.duration * 4);
      const voices = (["right", "left"] as const)
        .map((hand, hi) => {
          // One monophonic voice per distinct attack. This retains simultaneous and
          // overlapping MIDI notes without inventing a single melodic voice.
          const events = score.notes.filter(
            (n) =>
              n.hand === hand &&
              n.beat < m.beat + m.duration - EPS &&
              n.beat + n.duration > m.beat + EPS,
          );
          let result = "";
          events.forEach((n, i) => {
            const onset = Math.max(0, Math.round((n.beat - m.beat) * 4));
            const duration = Math.max(
              1,
              Math.min(
                size - onset,
                Math.round(
                  (Math.min(n.beat + n.duration, m.beat + m.duration) -
                    Math.max(n.beat, m.beat)) *
                    4,
                ),
              ),
            );
            const step = [
              "C",
              "C",
              "D",
              "D",
              "E",
              "F",
              "F",
              "G",
              "G",
              "A",
              "A",
              "B",
            ][n.pitch % 12];
            const sharp = [1, 3, 6, 8, 10].includes(n.pitch % 12);
            const voice = hi * MAX_NOTES + i + 1;
            const rest = (ticks: number) =>
              ticks > 0
                ? `<note><rest/><duration>${ticks}</duration><voice>${voice}</voice><staff>${hi + 1}</staff></note>`
                : "";
            result += rest(onset);
            result += `<note><pitch><step>${step}</step>${sharp ? "<alter>1</alter>" : ""}<octave>${Math.floor(n.pitch / 12) - 1}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>${hi + 1}</staff>${n.finger ? `<notations><technical><fingering>${escape(n.finger)}</fingering></technical></notations>` : ""}</note>`;
            result +=
              rest(size - onset - duration) +
              `<backup><duration>${size}</duration></backup>`;
          });
          return (
            result ||
            `<note><rest measure="yes"/><duration>${size}</duration><voice>${hi + 1}</voice><staff>${hi + 1}</staff></note><backup><duration>${size}</duration></backup>`
          );
        })
        .join("")
        .replace(/<backup><duration>\d+<\/duration><\/backup>$/, "");
      const pedals = score.pedals
        .filter((p) => p.beat >= m.beat && p.beat < m.beat + m.duration)
        .map(
          (p) =>
            `<direction placement="below"><direction-type><pedal type="${p.down ? "start" : "stop"}" line="yes" sign="yes"/></direction-type><offset>${Math.round((p.beat - m.beat) * 4)}</offset><staff>2</staff><sound damper-pedal="${p.down ? "yes" : "no"}"/></direction>`,
        )
        .join("");
      return `<measure number="${mi + 1}"><attributes><divisions>4</divisions><time><beats>${m.beats}</beats><beat-type>${m.beatType}</beat-type></time>${mi === 0 ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>' : ""}</attributes>${pedals}${voices}</measure>`;
    })
    .join("");
  return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>${escape(score.title)}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export async function parseScore(file: File): Promise<PianoScore> {
  if (file.size > MAX_SCORE_BYTES) throw new Error("文件不能超过 4 MB。");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  const bytes = await file.arrayBuffer();
  if (ext === "mid" || ext === "midi") {
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "MThd")
      throw new Error("这不是有效的 MIDI 文件。");
    return parseMidi(bytes, file.name);
  }
  if (ext === "mxl") {
    let size = 0;
    const files = unzipSync(new Uint8Array(bytes), {
      filter: (f) => {
        size += f.originalSize;
        if (size > MAX_SCORE_BYTES * 2) throw new Error("解压后的曲谱过大。");
        return /\.(xml|musicxml)$/i.test(f.name);
      },
    });
    const container = files["META-INF/container.xml"];
    const root = container
      ? new DOMParser()
          .parseFromString(strFromU8(container), "application/xml")
          .querySelector("rootfile")
          ?.getAttribute("full-path")
      : undefined;
    const name =
      root || Object.keys(files).find((n) => !n.startsWith("META-INF/"));
    if (!name || !files[name]) throw new Error("MXL 压缩包中未找到 MusicXML。");
    return parseMusicXml(strFromU8(files[name]), file.name);
  }
  if (ext === "xml" || ext === "musicxml")
    return parseMusicXml(new TextDecoder().decode(bytes), file.name);
  throw new Error("请选择 MIDI 或 MusicXML 文件；暂不支持 PDF。");
}
