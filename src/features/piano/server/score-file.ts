import { ORPCError } from "@orpc/server";
import { Midi } from "@tonejs/midi";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
const MAX_BYTES = 4 * 1024 * 1024;
const invalid = (message: string): never => {
  throw new ORPCError("BAD_REQUEST", { message });
};
// Validate before making a file public. XML is downloaded as JSON bytes and
// sanitized again by the notation reader; it is never served as active XML/HTML.
export function validateSharedScore(bytes: Uint8Array, name: string) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    invalid("单个曲谱须为 1 字节至 4 MB。");
  try {
    if (/\.midi?$/i.test(name)) {
      if (strFromU8(bytes.subarray(0, 4)) !== "MThd")
        invalid("文件内容不是 MIDI。");
      const midi = new Midi(bytes);
      const count = midi.tracks.reduce((n, t) => n + t.notes.length, 0);
      if (!count || count > 16000) invalid("MIDI 须包含 1–16000 个音符。");
      return {
        format: "midi" as const,
        notes: count,
        measures: null,
        fingerings: 0,
        pedal: midi.tracks.some(
          (track) => (track.controlChanges[64] || []).length > 0,
        ),
      };
    }
    let xml = strFromU8(bytes);
    if (/\.mxl$/i.test(name)) {
      let total = 0;
      const files = unzipSync(bytes, {
        filter: (f) => {
          total += f.originalSize;
          if (total > MAX_BYTES * 2) invalid("解压后的曲谱不能超过 8 MB。");
          return /\.(xml|musicxml)$/i.test(f.name);
        },
      });
      const container = files["META-INF/container.xml"];
      const parser = new XMLParser({
        ignoreAttributes: false,
        processEntities: false,
      });
      const path = container
        ? parser.parse(strFromU8(container))?.container?.rootfiles?.rootfile?.[
            "@_full-path"
          ]
        : undefined;
      const root =
        typeof path === "string"
          ? path
          : Object.keys(files).find((n) => !n.startsWith("META-INF/"));
      if (!root || !files[root]) invalid("MXL 中未找到 MusicXML。");
      xml = strFromU8(files[root!]);
    } else if (!/\.(xml|musicxml)$/i.test(name))
      invalid("只支持 MIDI、MusicXML 和 MXL，暂不支持 PDF。");
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml))
      invalid("曲谱不能含自定义 XML 实体。");
    xml = xml.replace(/<!DOCTYPE[^>]*>/gi, "");
    if (
      XMLValidator.validate(xml) !== true ||
      !/<score-partwise[\s>]/.test(xml)
    )
      invalid("请选择有效的 MusicXML 分谱文件。");
    const notes = xml.match(/<note[\s>]/g)?.length ?? 0;
    if (!notes || notes > 16000) invalid("曲谱须包含 1–16000 个音符。");
    // Count sounding note elements only, not rests. Do not send the score to AI.
    const sounding = [
      ...xml.matchAll(/<note(?:\s[^>]*)?>[\s\S]*?<\/note>/g),
    ].filter(([note]) => !/<rest[\s/>]/.test(note)).length;
    const firstPart =
      xml.match(/<part(?:\s[^>]*)?>[\s\S]*?<\/part>/)?.[0] || "";
    return {
      format: "musicxml" as const,
      notes: sounding,
      measures: firstPart.match(/<measure[\s>]/g)?.length || null,
      fingerings: xml.match(/<fingering[\s>]/g)?.length || 0,
      pedal: /<pedal[\s>]|damper-pedal\s*=/.test(xml),
    };
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    invalid("曲谱损坏或格式不受支持，请重新导出 MIDI / MusicXML。");
  }
}
