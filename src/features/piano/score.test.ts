// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { demoXml } from "./demo";
import {
  beatSeconds,
  parseMidi,
  parseMusicXml,
  parseScore,
  secondsBeat,
} from "./score";
import { PracticeTracker } from "./practice";
import { decodeBleMidi, decodeMidi } from "./midi";

const wrap = (measures: string) =>
  `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
const attrs =
  "<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>";
const note = (pitch = "C", extra = "", duration = 4, staff = 1) =>
  `<note><pitch><step>${pitch}</step><octave>4</octave></pitch><duration>${duration}</duration><staff>${staff}</staff>${extra}</note>`;

describe("piano MusicXML and MIDI timing", () => {
  it("preserves both staves, fingerings and tempo", () => {
    const score = parseMusicXml(demoXml);
    expect(score.title).toBe("晨光 · 五指练习");
    expect(score.measures).toHaveLength(8);
    expect(score.notes).toHaveLength(48);
    expect(score.notes.filter((n) => n.finger)).toHaveLength(48);
    expect(
      score.notes.filter((n) => n.beat === 0).map((n) => [n.pitch, n.hand]),
    ).toEqual([
      [48, "left"],
      [60, "right"],
    ]);
    expect(beatSeconds(score, score.totalBeats)).toBe(24);
  });
  it("merges ties but keeps another voice and a repeated attack independent", () => {
    const xml = wrap(
      `<measure number="1">${attrs}${note("C", '<tie type="start"/>', 16)}<backup><duration>16</duration></backup>${note("E", "", 16, 2)}</measure><measure number="2">${note("C", '<tie type="stop"/>', 8)}${note("C", "", 8)}</measure>`,
    );
    const score = parseMusicXml(xml);
    expect(score.notes.map((n) => [n.pitch, n.beat, n.duration])).toEqual([
      [60, 0, 6],
      [64, 0, 4],
      [60, 6, 2],
    ]);
  });
  it("uses chord onsets without advancing the voice twice", () => {
    const score = parseMusicXml(
      wrap(
        `<measure>${attrs}${note("C")}${note("E", "<chord/>")}${note("G")}</measure>`,
      ),
    );
    expect(score.notes.map((n) => n.beat)).toEqual([0, 0, 1]);
  });
  it("expands repeats and skips the first ending on the second pass", () => {
    const score = parseMusicXml(
      wrap(
        `<measure number="1">${attrs}<barline><repeat direction="forward"/></barline>${note()}</measure><measure number="2">${note("D")}</measure><measure number="3"><barline location="left"><ending number="1" type="start"/></barline>${note("E")}<barline><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure><measure number="4"><barline><ending number="2" type="start"/></barline>${note("F")}<barline><ending number="2" type="stop"/></barline></measure>`,
      ),
    );
    expect(score.measures.map((m) => m.number)).toEqual([
      "1",
      "2",
      "3",
      "1",
      "2",
      "4",
    ]);
  });
  it("accounts for pickups and mid-score tempo changes", () => {
    const score = parseMusicXml(
      wrap(
        `<measure implicit="yes">${attrs}<direction><sound tempo="60"/></direction>${note()}</measure><measure><direction><sound tempo="120"/></direction>${note("D", "", 16)}</measure>`,
      ),
    );
    expect(score.measures[1].beat).toBe(1);
    expect(beatSeconds(score, 5)).toBe(3);
    expect(secondsBeat(score, 2)).toBe(3);
  });
  it("rejects XML entities, invalid formats and empty scores", async () => {
    expect(() =>
      parseMusicXml('<!DOCTYPE x [<!ENTITY x "x">]><score-partwise/>'),
    ).toThrow(/实体/);
    expect(() => parseMusicXml("<html/>")).toThrow(/MusicXML/);
    expect(() => parseMusicXml(wrap(`<measure>${attrs}</measure>`))).toThrow(
      /音符/,
    );
    await expect(
      parseScore({
        size: 100,
        name: "score.pdf",
        arrayBuffer: async () => new ArrayBuffer(4),
      } as File),
    ).rejects.toThrow(/PDF/);
  });
  it("keeps original MIDI timing and produces a parseable reference staff", () => {
    const midi = new Midi();
    midi.name = "编码不可靠的曲名";
    midi.header.setTempo(90);
    midi
      .addTrack()
      .addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.7 })
      .addNote({ midi: 48, ticks: 240, durationTicks: 720, velocity: 0.4 });
    const score = parseMidi(
      midi.toArray().buffer as ArrayBuffer,
      "中文练习.mid",
    );
    expect(score.format).toBe("midi");
    expect(score.title).toBe("中文练习");
    expect(score.notes[1].beat).toBe(0.5);
    expect(score.notes[1].hand).toBe("left");
    expect(score.notes.every((n) => !n.finger)).toBe(true);
    expect(parseMusicXml(score.xml).notes.length).toBeGreaterThan(0);
  });
});

describe("practice feedback", () => {
  const score = parseMusicXml(
    wrap(
      `<measure>${attrs}<direction><sound tempo="60"/></direction>${note("C")}${note("E", "<chord/>")}${note("D")}</measure>`,
    ),
  );
  it("requires simultaneous chord keys and never passes a wrong note", () => {
    const tracker = new PracticeTracker(score, "wait", "both", 0, 4);
    expect(tracker.press(61, 0).verdict).toBe("wrong");
    tracker.press(60, 0);
    tracker.release(60);
    tracker.press(64, 0);
    expect(tracker.index).toBe(0);
    expect(tracker.press(60, 0).advance).toBe(1);
    expect(tracker.result.correct).toBe(2);
    tracker.release(60);
    tracker.release(64);
    expect(tracker.press(62, 1).done).toBe(true);
  });
  it("grades early, late, missing and repeated wrong attacks independently", () => {
    const tracker = new PracticeTracker(score, "rhythm", "both", 0, 4);
    expect(tracker.press(60, 0.26).verdict).toBe("late");
    tracker.release(60);
    expect(tracker.press(60, 0.27).verdict).toBe("wrong");
    expect(tracker.press(62, 0.75).verdict).toBe("early");
    tracker.update(2);
    expect(tracker.result).toMatchObject({
      correct: 0,
      early: 1,
      late: 1,
      missed: 1,
      wrong: 1,
    });
  });
  it("does not include the other hand or notes outside the loop", () => {
    const demo = parseMusicXml(demoXml);
    const tracker = new PracticeTracker(demo, "wait", "right", 4, 8);
    expect(tracker.result.total).toBe(4);
    expect(
      tracker.groups.every((g) =>
        g.notes.every((n) => n.hand === "right" && n.beat >= 4 && n.beat < 8),
      ),
    ).toBe(true);
  });
});

describe("USB and Bluetooth MIDI input", () => {
  it("treats zero-velocity note-on as release and understands sustain", () => {
    expect(decodeMidi([0x93, 60, 100])).toMatchObject({
      type: "on",
      pitch: 60,
      channel: 3,
    });
    expect(decodeMidi([0x90, 60, 0])?.type).toBe("off");
    expect(decodeMidi([0xb0, 64, 127])).toMatchObject({
      type: "pedal",
      velocity: 1,
    });
    expect(decodeMidi([0xb0, 123, 0])?.type).toBe("reset");
  });
  it("decodes BLE timestamps and running status without emitting clocks as notes", () => {
    const packet = new DataView(
      Uint8Array.from([
        0x80, 0x80, 0x90, 60, 100, 64, 90, 0x81, 67, 80, 0x82, 0x80, 60, 0,
      ]).buffer,
    );
    expect(decodeBleMidi(packet).map((e) => [e.type, e.pitch])).toEqual([
      ["on", 60],
      ["on", 64],
      ["on", 67],
      ["off", 60],
    ]);
    expect(
      decodeBleMidi(new DataView(Uint8Array.from([0x80, 0x80, 0xf8]).buffer)),
    ).toEqual([]);
    const clockBetweenNotes = new DataView(
      Uint8Array.from([0x80, 0x80, 0x90, 60, 100, 0x81, 0xf8, 0x82, 64, 90])
        .buffer,
    );
    expect(decodeBleMidi(clockBetweenNotes).map((e) => e.pitch)).toEqual([
      60, 64,
    ]);
  });
});
