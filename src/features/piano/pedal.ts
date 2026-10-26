import { lastWhere, type PianoNote, type PianoScore } from "./score";

export function scorePedalDown(score: PianoScore, beat: number) {
  return (
    beat < score.totalBeats &&
    (lastWhere(score.pedals, (p) => p.beat <= beat)?.down ?? false)
  );
}
export function sustainedRelease(
  score: PianoScore,
  note: PianoNote,
  end: number,
) {
  const release = Math.min(end, note.beat + note.duration);
  if (!scorePedalDown(score, release)) return release;
  return Math.min(
    end,
    score.pedals.find((p) => !p.down && p.beat > release)?.beat ?? end,
  );
}
