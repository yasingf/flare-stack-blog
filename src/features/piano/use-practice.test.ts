// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoXml } from "./demo";
import { parseMusicXml } from "./score";
import { usePractice, type PracticeOptions } from "./use-practice";

const audio = vi.hoisted(() => ({
  preload: vi.fn(async () => {}),
  stop: vi.fn(),
  click: vi.fn(),
  play: vi.fn(async (_pitch: number) => {}),
  dispose: vi.fn(async () => {}),
}));
vi.mock("./audio", () => ({
  GrandPiano: class {
    preload = audio.preload;
    stop = audio.stop;
    click = audio.click;
    play = audio.play;
    dispose = audio.dispose;
  },
}));
const defaults: PracticeOptions = {
  mode: "listen",
  hand: "both",
  speed: 1,
  loop: false,
  startMeasure: 1,
  endMeasure: 8,
  metronome: false,
  countIn: true,
  leftSound: true,
  rightSound: true,
  monitor: false,
  latency: 0,
};
let frame: FrameRequestCallback;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("resumes a scrubbed position without repeating the count-in", async () => {
  const score = parseMusicXml(demoXml);
  const { result } = renderHook(() => usePractice(score, defaults));
  await act(async () => {
    await result.current.start();
  });
  expect(audio.click).toHaveBeenCalledTimes(4);
  act(() => result.current.pause());
  await act(async () => {
    result.current.seek(8, true);
  });
  expect(result.current.playing).toBe(true);
  expect(result.current.clock.current.beat).toBe(8);
  expect(audio.click).toHaveBeenCalledTimes(4);
  act(() => result.current.seek(12));
  expect(result.current.playing).toBe(false);
  expect(result.current.beat).toBe(12);
});

it("leaves playback stopped when seeking to the end of the score or loop", async () => {
  const score = parseMusicXml(demoXml);
  const { result, rerender } = renderHook(
    ({ options }) => usePractice(score, options),
    { initialProps: { options: defaults } },
  );
  await act(async () => {
    result.current.seek(score.totalBeats, true);
  });
  expect(result.current.playing).toBe(false);
  expect(result.current.beat).toBe(score.totalBeats);
  rerender({
    options: { ...defaults, loop: true, startMeasure: 2, endMeasure: 4 },
  });
  await act(async () => {
    result.current.seek(score.measures[4].beat, true);
  });
  expect(result.current.playing).toBe(false);
  expect(result.current.beat).toBe(score.measures[4].beat);
  expect(audio.preload).not.toHaveBeenCalled();
});

it("cancels a pending audio load when the user chooses a different position", async () => {
  let loaded!: () => void;
  audio.preload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        loaded = resolve;
      }),
  );
  const score = parseMusicXml(demoXml);
  const { result } = renderHook(() => usePractice(score, defaults));
  let started!: Promise<void>;
  act(() => {
    started = result.current.start();
  });
  expect(result.current.busy).toBe(true);
  act(() => result.current.seek(12));
  await act(async () => {
    loaded();
    await started;
  });
  expect(result.current.playing).toBe(false);
  expect(result.current.busy).toBe(false);
  expect(result.current.beat).toBe(12);
  expect(audio.click).not.toHaveBeenCalled();
});

it("plays only the selected hand in listen mode", async () => {
  const score = parseMusicXml(demoXml);
  const { result } = renderHook(() =>
    usePractice(score, { ...defaults, hand: "left", countIn: false }),
  );
  await act(async () => {
    await result.current.start();
  });
  act(() => frame(performance.now() + 10));
  const pitches = score.notes
    .filter((n) => n.beat === 0 && n.hand === "left")
    .map((n) => n.pitch);
  expect(audio.play.mock.calls.map((call) => call[0])).toEqual(pitches);
  expect(audio.click).not.toHaveBeenCalled();
});
