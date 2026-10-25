import {
  beatSeconds,
  currentMeasure,
  type Hand,
  type PianoNote,
  type PianoScore,
} from "./score";
import type { CoachFacts } from "./coach.schema";

export type PracticeMode = "listen" | "wait" | "rhythm";
export type Verdict = "correct" | "early" | "late" | "wrong" | "missed";
export type PracticeResult = {
  correct: number;
  early: number;
  late: number;
  wrong: number;
  missed: number;
  total: number;
  byMeasure: Record<number, number>;
};
export type NoteGroup = { beat: number; notes: PianoNote[] };
export const emptyResult = (): PracticeResult => ({
  correct: 0,
  early: 0,
  late: 0,
  wrong: 0,
  missed: 0,
  total: 0,
  byMeasure: {},
});

export function noteGroups(
  score: PianoScore,
  hand: Hand | "both",
  start: number,
  end: number,
): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (const note of score.notes) {
    if (
      note.beat < start - 0.0001 ||
      note.beat >= end - 0.0001 ||
      (hand !== "both" && note.hand !== hand)
    )
      continue;
    const group = groups.at(-1);
    if (group && Math.abs(group.beat - note.beat) < 0.035)
      group.notes.push(note);
    else groups.push({ beat: note.beat, notes: [note] });
  }
  // A pitch shared by two voices still requires one physical key press.
  for (const group of groups)
    group.notes = group.notes.filter(
      (n, i, a) => a.findIndex((v) => v.pitch === n.pitch) === i,
    );
  return groups;
}

export class PracticeTracker {
  readonly groups: NoteGroup[];
  readonly result = emptyResult();
  readonly marked = new Map<string, Verdict>();
  private held = new Set<number>();
  private waitingHits = new Set<number>();
  index = 0;
  constructor(
    readonly score: PianoScore,
    readonly mode: PracticeMode,
    hand: Hand | "both",
    start: number,
    end: number,
    readonly speed = 1,
    readonly toleranceMs = 180,
  ) {
    this.groups = noteGroups(score, hand, start, end);
    this.result.total = this.groups.reduce((n, g) => n + g.notes.length, 0);
  }
  get next() {
    return this.groups[this.index];
  }
  private mark(note: PianoNote, verdict: Verdict) {
    if (this.marked.has(note.id)) return;
    this.marked.set(note.id, verdict);
    this.result[verdict]++;
    if (verdict !== "correct")
      this.result.byMeasure[note.measure] =
        (this.result.byMeasure[note.measure] || 0) + 1;
  }
  release(pitch: number) {
    this.held.delete(pitch);
    this.waitingHits.delete(pitch);
  }
  clearHeld() {
    this.held.clear();
    this.waitingHits.clear();
  }
  press(
    pitch: number,
    beat: number,
  ): { verdict: Verdict; advance?: number; done?: boolean } {
    if (this.held.has(pitch)) return { verdict: "correct" };
    this.held.add(pitch);
    if (this.mode === "wait") {
      const group = this.next;
      if (!group) return { verdict: "correct", done: true };
      if (!group.notes.some((n) => n.pitch === pitch)) {
        this.result.wrong++;
        const measure = group.notes[0].measure;
        this.result.byMeasure[measure] =
          (this.result.byMeasure[measure] || 0) + 1;
        return { verdict: "wrong" };
      }
      this.waitingHits.add(pitch);
      // Chords must be held together; sequential taps must not pass a chord.
      if (
        group.notes.every(
          (n) => this.waitingHits.has(n.pitch) && this.held.has(n.pitch),
        )
      ) {
        for (const n of group.notes) this.mark(n, "correct");
        this.index++;
        this.waitingHits.clear();
        return {
          verdict: "correct",
          advance: this.next?.beat,
          done: !this.next,
        };
      }
      return { verdict: "correct" };
    }
    if (this.mode === "rhythm") {
      const seconds = beatSeconds(this.score, beat) / this.speed;
      const window = this.toleranceMs / 1000;
      let match: PianoNote | undefined;
      let delta = Infinity;
      // Look just ahead and behind the current cursor, without reusing an attack.
      for (const group of this.groups) {
        const d = seconds - beatSeconds(this.score, group.beat) / this.speed;
        if (d < -window * 2) break;
        if (Math.abs(d) > window * 2) continue;
        const note = group.notes.find(
          (n) => n.pitch === pitch && !this.marked.has(n.id),
        );
        if (note && Math.abs(d) < Math.abs(delta)) {
          match = note;
          delta = d;
        }
      }
      if (match) {
        const verdict =
          Math.abs(delta) <= window ? "correct" : delta < 0 ? "early" : "late";
        this.mark(match, verdict);
        return { verdict };
      }
      this.result.wrong++;
      const measure = currentMeasure(this.score, beat);
      this.result.byMeasure[Math.max(0, measure)] =
        (this.result.byMeasure[Math.max(0, measure)] || 0) + 1;
      return { verdict: "wrong" };
    }
    return { verdict: "correct" };
  }
  update(beat: number) {
    if (this.mode !== "rhythm") return;
    const cutoff =
      beatSeconds(this.score, beat) / this.speed - this.toleranceMs / 500;
    while (
      this.next &&
      beatSeconds(this.score, this.next.beat) / this.speed < cutoff
    ) {
      for (const note of this.next.notes) this.mark(note, "missed");
      this.index++;
    }
  }
  finish() {
    if (this.mode === "rhythm")
      for (const group of this.groups)
        for (const n of group.notes) this.mark(n, "missed");
    return { ...this.result, byMeasure: { ...this.result.byMeasure } };
  }
}

export function scoreFacts(score: PianoScore): CoachFacts {
  const right = score.notes.filter((n) => n.hand === "right");
  const left = score.notes.filter((n) => n.hand === "left");
  const groups = noteGroups(score, "both", 0, score.totalBeats);
  const maxChord = Math.max(...groups.map((g) => g.notes.length));
  const shortest = Math.min(...score.notes.map((n) => n.duration));
  const density =
    score.notes.length / Math.max(1, beatSeconds(score, score.totalBeats));
  const difficulty =
    density > 8 || maxChord > 6 || shortest < 0.25
      ? "较难"
      : density > 4 || maxChord > 3
        ? "中等"
        : "入门";
  return {
    title: score.title,
    composer: score.composer,
    format: score.format,
    measures: score.measures.length,
    notes: score.notes.length,
    bpm: score.tempos[0].bpm,
    maxChord,
    shortestBeat: shortest,
    leftNotes: left.length,
    rightNotes: right.length,
    range: [
      Math.min(...score.notes.map((n) => n.pitch)),
      Math.max(...score.notes.map((n) => n.pitch)),
    ],
    fingerings: score.notes.filter((n) => n.finger).length,
    estimatedDifficulty: difficulty,
  };
}
