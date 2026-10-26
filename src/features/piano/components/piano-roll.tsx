import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { noteName, type PianoNote, type PianoScore } from "../score";
import { scorePedalDown } from "../pedal";
import type { Verdict } from "../practice";

const black = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
// Scores are sorted by onset. Only visit the visible time window, not the whole
// score for every key on every frame.
export function firstNoteAt(notes: PianoNote[], beat: number) {
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
type Props = {
  score: PianoScore;
  clock: RefObject<{ beat: number; playing: boolean }>;
  pressed: Set<number>;
  feedback: { pitch: number; verdict: Verdict } | null;
  expected: PianoNote[];
  full: boolean;
  waterfall: boolean;
  fingers: boolean;
  onPress: (pitch: number) => void;
  onRelease: (pitch: number) => void;
};
export function PianoRoll(props: Props) {
  const { score, full, waterfall, onPress, onRelease } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef<SVGSVGElement>(null);
  const [keySize, setKeySize] = useState({ width: 1000, height: 98 });
  const live = useRef(props);
  live.current = props;
  const layout = useMemo(() => {
    const min = full
      ? 21
      : Math.max(
          21,
          Math.floor(Math.min(...score.notes.map((n) => n.pitch)) / 12) * 12,
        );
    const max = full
      ? 108
      : Math.min(
          108,
          Math.max(
            min + 35,
            Math.ceil((Math.max(...score.notes.map((n) => n.pitch)) + 2) / 12) *
              12,
          ),
        );
    const pitches = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    const whites = pitches.filter((p) => !black(p));
    const keyWidth = 1000 / whites.length;
    return {
      pitches: [...whites, ...pitches.filter(black)],
      whites,
      x: new Map(
        pitches.map((p) => [
          p,
          black(p)
            ? whites.filter((w) => w < p).length * keyWidth - keyWidth * 0.31
            : whites.indexOf(p) * keyWidth,
        ]),
      ),
      width: (p: number) => (black(p) ? keyWidth * 0.62 : keyWidth),
      longest: Math.max(...score.notes.map((n) => n.duration)),
    };
  }, [score, full]);

  useEffect(() => {
    const element = keys.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0)
        setKeySize((old) =>
          old.width === width && old.height === height
            ? old
            : { width, height },
        );
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    const ctx = surface?.getContext("2d");
    let width = 0,
      height = 0,
      dirty = true,
      frame = 0;
    let previousBeat = -1,
      previousProps: Props | null = null;
    const nodes = new Map(
      Array.from(
        keys.current?.querySelectorAll<SVGGElement>("[data-pitch]") || [],
      ).map((el) => [
        Number(el.dataset.pitch),
        {
          rect: el.querySelector("rect")!,
          finger: el.querySelector(".piano-key-finger")!,
          state: "",
        },
      ]),
    );
    const resize = new ResizeObserver((entries) => {
      const size = entries[0].contentRect;
      width = size.width;
      height = size.height;
      if (surface) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        surface.width = Math.round(width * dpr);
        surface.height = Math.round(height * dpr);
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      dirty = true;
    });
    if (surface) resize.observe(surface);
    const theme = new MutationObserver(() => {
      dirty = true;
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const draw = () => {
      const p = live.current,
        beat = p.clock.current.beat;
      if (dirty || beat !== previousBeat || p !== previousProps) {
        dirty = false;
        previousBeat = beat;
        previousProps = p;
        const horizon = 6;
        const start = firstNoteAt(score.notes, beat - layout.longest);
        const end = firstNoteAt(score.notes, beat + horizon + 0.01);
        const active = new Map<number, PianoNote>();
        if (ctx && width && height) {
          const dark = document.documentElement.classList.contains("dark");
          ctx.fillStyle = dark ? "#242821" : "#f4f0e8";
          ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = dark ? "#cac5b815" : "#d8d0c36b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const pitch of layout.whites) {
            const x = (layout.x.get(pitch)! / 1000) * width;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
          for (let b = Math.ceil(beat); b < beat + horizon; b++) {
            const y = height - ((b - beat) / horizon) * height;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
          }
          ctx.stroke();
          // A dedicated pedal lane keeps the sustain timing readable alongside
          // notes, including MIDI files that have no engraved pedal symbol.
          let down = scorePedalDown(score, beat),
            from = beat;
          ctx.fillStyle = dark ? "#d9c49d45" : "#9c785845";
          for (const event of [
            ...score.pedals.filter(
              (e) => e.beat > beat && e.beat <= beat + horizon,
            ),
            { beat: beat + horizon, down: false },
          ]) {
            if (down)
              ctx.fillRect(
                width - 9,
                height - ((event.beat - beat) / horizon) * height,
                7,
                ((event.beat - from) / horizon) * height,
              );
            from = event.beat;
            down = event.down;
          }
        }
        for (let i = start; i < end; i++) {
          const n = score.notes[i];
          if (n.beat + n.duration <= beat) continue;
          if (n.beat <= beat + 0.015) active.set(n.pitch, n);
          const x = layout.x.get(n.pitch);
          if (!ctx || x === undefined || !width || !height) continue;
          const nx = (x / 1000) * width + 1.5;
          const nw = Math.max(3, (layout.width(n.pitch) / 1000) * width - 3);
          const ny = height - ((n.beat + n.duration - beat) / horizon) * height;
          const nh = Math.max(5, (n.duration / horizon) * height - 2);
          ctx.fillStyle = n.hand === "left" ? "#6f9681" : "#c58a5b";
          ctx.globalAlpha = n.beat <= beat ? 1 : 0.86;
          ctx.beginPath();
          ctx.roundRect(nx, ny, nw, nh, Math.min(4, nw / 3, nh / 3));
          ctx.fill();
          ctx.globalAlpha = 1;
          if (p.fingers && n.finger && nw > 9) {
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.font = `600 ${Math.min(14, nw * 0.65)}px sans-serif`;
            ctx.fillText(
              n.finger,
              nx + nw / 2,
              Math.min(height - 5, Math.max(13, ny + nh - 6)),
            );
          }
        }
        const expected = new Map(p.expected.map((n) => [n.pitch, n]));
        for (const [pitch, node] of nodes) {
          const note = expected.get(pitch) || active.get(pitch);
          const down = p.pressed.has(pitch);
          const wrong =
            down &&
            p.feedback?.pitch === pitch &&
            p.feedback.verdict === "wrong";
          const fill = wrong
            ? "#be5148"
            : down
              ? "#568d70"
              : active.has(pitch)
                ? note?.hand === "left"
                  ? "#94b1a0"
                  : "#dca271"
                : black(pitch)
                  ? "#302e2a"
                  : "#fcf9f1";
          const finger = p.fingers && note?.finger ? note.finger : "";
          const stroke = expected.has(pitch) ? "#b66f3c" : "#bfb6a8";
          const next = `${fill}/${finger}/${stroke}`;
          if (next !== node.state) {
            node.rect.setAttribute("fill", fill);
            node.rect.setAttribute("stroke", stroke);
            node.rect.setAttribute(
              "stroke-width",
              expected.has(pitch) ? "2" : "1",
            );
            node.finger.textContent = finger;
            node.state = next;
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
    };
  }, [score, layout, waterfall]);

  return (
    <div
      className={`piano-roll-scroll ${waterfall ? "has-waterfall" : "keys-only"}`}
    >
      {waterfall && (
        <canvas
          ref={canvas}
          className="piano-waterfall"
          aria-label="瀑布流：左手绿色、右手棕色，右侧为延音踏板时间线"
        />
      )}
      <svg
        ref={keys}
        className="piano-roll"
        viewBox={`0 0 ${keySize.width} ${keySize.height}`}
        aria-label="可弹奏钢琴键盘与指法"
      >
        {layout.pitches.map((p) => {
          const left = (layout.x.get(p)! / 1000) * keySize.width;
          const width = (layout.width(p) / 1000) * keySize.width;
          return (
            <g
              key={p}
              data-pitch={p}
              role="button"
              tabIndex={0}
              aria-label={`琴键 ${noteName(p)}`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                onPress(p);
              }}
              onPointerUp={() => onRelease(p)}
              onPointerCancel={() => onRelease(p)}
              onLostPointerCapture={() => onRelease(p)}
              onKeyDown={(e) => {
                if (!e.repeat && ["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  onPress(p);
                }
              }}
              onKeyUp={(e) => {
                if (["Enter", " "].includes(e.key)) onRelease(p);
              }}
            >
              <rect
                x={Math.round(left) + 0.5}
                y={0.5}
                width={Math.max(
                  1,
                  Math.round(left + width) - Math.round(left) - 1,
                )}
                height={Math.max(
                  1,
                  Math.round(keySize.height * (black(p) ? 0.64 : 1)) - 1,
                )}
                rx={2}
                fill={black(p) ? "#302e2a" : "#fcf9f1"}
                stroke="#bfb6a8"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                className="piano-key-finger"
                x={left + width / 2}
                y={keySize.height * (black(p) ? 0.49 : 0.79)}
                textAnchor="middle"
                fontSize={Math.min(
                  18,
                  Math.max(8, width * 0.65),
                  keySize.height * 0.23,
                )}
                fontWeight="600"
                fill={black(p) ? "#fff" : "#403c35"}
              />
              {!black(p) && p % 12 === 0 && (
                <text
                  x={left + width / 2}
                  y={keySize.height - 5}
                  textAnchor="middle"
                  fontSize={Math.min(
                    11,
                    Math.max(7, width * 0.38),
                    keySize.height * 0.12,
                  )}
                  fill="#766b5e"
                >
                  {noteName(p)}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={0}
          x2={keySize.width}
          y1={0.5}
          y2={0.5}
          stroke="#b98056"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
