import { useCallback, useEffect, useRef, useState } from "react";
import { GrandPiano } from "./audio";
import {
  beatSeconds,
  secondsBeat,
  tempoAt,
  lastWhere,
  type Hand,
  type PianoScore,
} from "./score";
import {
  emptyResult,
  PracticeTracker,
  type PracticeMode,
  type PracticeResult,
  type Verdict,
} from "./practice";
import type { PianoInput } from "./midi";
import { saveHistory } from "./library";

export type PracticeOptions = {
  mode: PracticeMode;
  hand: Hand | "both";
  speed: number;
  loop: boolean;
  startMeasure: number;
  endMeasure: number;
  metronome: boolean;
  countIn: boolean;
  leftSound: boolean;
  rightSound: boolean;
  monitor: boolean;
  latency: number;
};
export function usePractice(score: PianoScore, options: PracticeOptions) {
  const audio = useRef<GrandPiano | null>(null);
  audio.current ??= new GrandPiano();
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pressed, setPressed] = useState(new Set<number>());
  const [pedal, setPedal] = useState(false);
  const [feedback, setFeedback] = useState<{
    pitch: number;
    verdict: Verdict;
  } | null>(null);
  const [result, setResult] = useState<PracticeResult>(emptyResult);
  const [error, setError] = useState("");
  const tracker = useRef<PracticeTracker | null>(null);
  const state = useRef({
    beat: 0,
    playing: false,
    generation: 0,
    started: 0,
    baseSeconds: 0,
    noteIndex: 0,
    clickBeat: -1,
    waitingAccompanimentBeat: -1,
    lastUi: 0,
    elapsedStart: 0,
  });
  const settings = useRef({ score, options });
  settings.current = { score, options };
  const liveNotes = useRef(new Set<number>());
  const pause = useCallback(() => {
    state.current.playing = false;
    state.current.generation++;
    setPlaying(false);
    setBusy(false);
    setCountdown(0);
    audio.current?.stop();
    tracker.current?.clearHeld();
    liveNotes.current.clear();
    setPressed(new Set());
    setPedal(false);
  }, []);
  const seek = useCallback(
    (value: number) => {
      pause();
      state.current.beat = Math.min(
        settings.current.score.totalBeats,
        Math.max(0, value),
      );
      setBeat(state.current.beat);
      tracker.current = null;
      setFeedback(null);
      setResult(emptyResult());
    },
    [pause],
  );
  const summary = useCallback(() => {
    const result = tracker.current?.finish();
    if (!result) return;
    setResult(result);
    const { score, options } = settings.current;
    if (
      options.mode !== "listen" &&
      result.correct +
        result.wrong +
        result.early +
        result.late +
        result.missed >
        0
    )
      saveHistory({
        date: Date.now(),
        title: score.title,
        seconds: Math.round(
          (performance.now() - state.current.elapsedStart) / 1000,
        ),
        speed: options.speed,
        mode: options.mode,
        result,
      });
  }, []);
  const start = useCallback(async () => {
    if (state.current.playing) {
      pause();
      return;
    }
    const { score, options } = settings.current;
    const s = state.current;
    const generation = ++s.generation;
    setBusy(true);
    setError("");
    try {
      const notes = score.notes.filter((n) =>
        n.hand === "left" ? options.leftSound : options.rightSound,
      );
      await audio.current!.preload(notes);
      if (generation !== s.generation) return;
      const begin = options.loop
        ? score.measures[options.startMeasure - 1].beat
        : 0;
      const end = options.loop
        ? (score.measures[options.endMeasure]?.beat ?? score.totalBeats)
        : score.totalBeats;
      if (s.beat >= end - 0.01 || s.beat < begin) s.beat = begin;
      tracker.current = new PracticeTracker(
        score,
        options.mode,
        options.hand,
        s.beat,
        end,
        options.speed,
      );
      if (options.mode !== "listen" && !tracker.current.groups.length) {
        setError("当前片段没有所选手的音符，请调整练习手、起点或循环范围。");
        return;
      }
      s.elapsedStart = performance.now();
      s.started = performance.now();
      s.baseSeconds = beatSeconds(score, s.beat);
      s.noteIndex = score.notes.findIndex((n) => n.beat >= s.beat - 0.0001);
      if (s.noteIndex < 0) s.noteIndex = score.notes.length;
      s.clickBeat = Math.ceil(s.beat) - 1;
      s.waitingAccompanimentBeat = s.beat - 0.01;
      if (options.mode === "wait" && tracker.current.next)
        s.beat = tracker.current.next.beat;
      const count = options.countIn ? 4 : 0;
      const secondsPerBeat = 60 / tempoAt(score, s.beat) / options.speed;
      for (let i = 0; i < count; i++)
        audio.current!.click(i === 0, i * secondsPerBeat);
      s.started += count * secondsPerBeat * 1000;
      s.playing = true;
      setPlaying(true);
      setBeat(s.beat);
      setResult(emptyResult());
      setFeedback(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法播放，请重试。");
    } finally {
      if (generation === s.generation) setBusy(false);
    }
  }, [pause]);

  const input = useCallback(
    (event: PianoInput, screen = false) => {
      const { score, options } = settings.current;
      if (event.type === "reset") {
        pause();
        return;
      }
      if (event.type === "pedal") {
        setPedal(event.velocity > 0);
        audio.current?.pedal(event.velocity > 0);
        return;
      }
      if (event.type === "off") {
        liveNotes.current.delete(event.pitch);
        tracker.current?.release(event.pitch);
        audio.current?.noteOff(event.pitch);
        setPressed(new Set(liveNotes.current));
        return;
      }
      if (liveNotes.current.has(event.pitch)) return;
      liveNotes.current.add(event.pitch);
      setPressed(new Set(liveNotes.current));
      if (screen || options.monitor) {
        void audio
          .current!.ready()
          .then(() => {
            if (liveNotes.current.has(event.pitch))
              return audio.current!.play(
                event.pitch,
                event.velocity,
                undefined,
                0,
                true,
              );
          })
          .catch(() => setError("钢琴音源加载失败。"));
      }
      if (
        !state.current.playing ||
        performance.now() < state.current.started ||
        options.mode === "listen"
      )
        return;
      const s = state.current;
      const realBeat =
        options.mode === "wait"
          ? s.beat
          : secondsBeat(
              score,
              s.baseSeconds +
                ((performance.now() - s.started - options.latency) / 1000) *
                  options.speed,
            );
      const hit = tracker.current!.press(event.pitch, realBeat);
      setFeedback({ pitch: event.pitch, verdict: hit.verdict });
      setResult({
        ...tracker.current!.result,
        byMeasure: { ...tracker.current!.result.byMeasure },
      });
      if (hit.advance !== undefined) {
        s.beat = hit.advance;
        setBeat(s.beat);
      }
      if (hit.done) {
        summary();
        if (options.loop) {
          s.beat = score.measures[options.startMeasure - 1].beat;
          s.playing = false;
          void start();
        } else pause();
      }
    },
    [pause, start, summary],
  );

  useEffect(() => {
    let frame: number;
    const tick = (now: number) => {
      const s = state.current,
        { score, options } = settings.current;
      if (s.playing) {
        const untilStart = (s.started - now) / 1000;
        if (untilStart > 0)
          setCountdown(
            Math.ceil(
              (untilStart * tempoAt(score, s.beat) * options.speed) / 60,
            ),
          );
        else {
          setCountdown(0);
          const end = options.loop
            ? (score.measures[options.endMeasure]?.beat ?? score.totalBeats)
            : score.totalBeats;
          if (options.mode === "wait") {
            // Optional other-hand accompaniment at each waiting position.
            if (s.waitingAccompanimentBeat < s.beat) {
              for (const n of score.notes)
                if (
                  n.beat > s.waitingAccompanimentBeat &&
                  n.beat <= s.beat + 0.001 &&
                  options.hand !== "both" &&
                  n.hand !== options.hand &&
                  (n.hand === "left" ? options.leftSound : options.rightSound)
                ) {
                  void audio
                    .current!.play(
                      n.pitch,
                      n.velocity,
                      (n.duration * 60) /
                        tempoAt(score, n.beat) /
                        options.speed,
                    )
                    .catch(() => setError("音源加载失败。"));
                }
              s.waitingAccompanimentBeat = s.beat;
            }
          } else {
            const elapsed = (now - s.started) / 1000;
            const seconds = s.baseSeconds + elapsed * options.speed;
            s.beat = Math.min(end, secondsBeat(score, seconds));
            const ahead = seconds + 0.085 * options.speed;
            while (s.noteIndex < score.notes.length) {
              const n = score.notes[s.noteIndex];
              const at = beatSeconds(score, n.beat);
              if (at > ahead || n.beat >= end) break;
              s.noteIndex++;
              if (!(n.hand === "left" ? options.leftSound : options.rightSound))
                continue;
              const delay = (at - seconds) / options.speed;
              if (delay < -0.2) continue; // A background tab must not burst old notes.
              let release = n.beat + n.duration;
              const down = lastWhere(
                score.pedals,
                (p) => p.beat <= release,
              )?.down;
              if (down)
                release = Math.min(
                  end,
                  score.pedals.find((p) => !p.down && p.beat > release)?.beat ??
                    end,
                );
              const duration =
                (beatSeconds(score, release) - at) / options.speed;
              void audio
                .current!.play(
                  n.pitch,
                  n.velocity,
                  duration,
                  Math.max(0, delay),
                )
                .catch(() => setError("音源加载失败。"));
            }
            tracker.current?.update(s.beat);
            if (options.metronome && Math.floor(s.beat) > s.clickBeat) {
              s.clickBeat = Math.floor(s.beat);
              const m = lastWhere(score.measures, (m) => m.beat <= s.beat)!;
              audio.current!.click(Math.abs(s.clickBeat - m.beat) < 0.05);
            }
            if (s.beat >= end) {
              summary();
              audio.current?.stop();
              if (options.loop) {
                s.beat = score.measures[options.startMeasure - 1].beat;
                s.playing = false;
                void start();
              } else {
                pause();
                setBeat(end);
              }
            }
          }
          if (now - s.lastUi > 45) {
            setBeat(s.beat);
            s.lastUi = now;
            if (tracker.current && options.mode === "rhythm")
              setResult({
                ...tracker.current.result,
                byMeasure: { ...tracker.current.result.byMeasure },
              });
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
    };
  }, [pause, start, summary]);
  useEffect(
    () => () => {
      state.current.generation++;
      state.current.playing = false;
      void audio.current?.dispose();
    },
    [],
  );
  return {
    beat,
    playing,
    busy,
    countdown,
    pressed,
    pedal,
    feedback,
    result,
    error,
    tracker,
    audio,
    start,
    pause,
    seek,
    input,
  };
}
