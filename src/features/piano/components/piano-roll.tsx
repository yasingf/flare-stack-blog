import { noteName, type PianoNote, type PianoScore } from "../score";
import type { Verdict } from "../practice";

const black = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);
export function PianoRoll({
  score,
  beat,
  pressed,
  feedback,
  expected,
  full,
  waterfall,
  fingers,
  onPress,
  onRelease,
}: {
  score: PianoScore;
  beat: number;
  pressed: Set<number>;
  feedback: { pitch: number; verdict: Verdict } | null;
  expected: PianoNote[];
  full: boolean;
  waterfall: boolean;
  fingers: boolean;
  onPress: (pitch: number) => void;
  onRelease: (pitch: number) => void;
}) {
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
  const x = (p: number) =>
    black(p)
      ? whites.filter((w) => w < p).length * keyWidth - keyWidth * 0.31
      : whites.indexOf(p) * keyWidth;
  const width = (p: number) => (black(p) ? keyWidth * 0.62 : keyWidth);
  const height = waterfall ? 240 : 0;
  const scale = 44;
  const visible = waterfall
    ? score.notes.filter(
        (n) =>
          n.beat + n.duration >= beat &&
          n.beat <= beat + height / scale &&
          n.pitch >= min &&
          n.pitch <= max,
      )
    : [];
  const active = score.notes.filter(
    (n) => n.beat <= beat + 0.015 && n.beat + n.duration > beat,
  );
  const key = (p: number) => {
    const note =
      expected.find((n) => n.pitch === p) || active.find((n) => n.pitch === p);
    const down = pressed.has(p);
    const wrong = down && feedback?.pitch === p && feedback.verdict === "wrong";
    const fill = wrong
      ? "#be5148"
      : down
        ? "#568d70"
        : active.some((n) => n.pitch === p)
          ? note?.hand === "left"
            ? "#94b1a0"
            : "#dca271"
          : black(p)
            ? "#302e2a"
            : "#fcf9f1";
    const keyHeight = black(p) ? 62 : 96;
    return (
      <g
        key={p}
        role="button"
        tabIndex={0}
        aria-label={`琴键 ${noteName(p)}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onPress(p);
        }}
        onPointerUp={() => onRelease(p)}
        onPointerCancel={() => onRelease(p)}
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
          x={x(p) + 0.7}
          y={height}
          width={width(p) - 1.4}
          height={keyHeight}
          rx={2}
          fill={fill}
          stroke={expected.some((n) => n.pitch === p) ? "#b66f3c" : "#bfb6a8"}
          strokeWidth={expected.some((n) => n.pitch === p) ? 2 : 0.7}
        />
        {fingers && note?.finger && (
          <text
            x={x(p) + width(p) / 2}
            y={height + keyHeight - 20}
            textAnchor="middle"
            fontSize={Math.min(14, keyWidth * 0.55)}
            fill={black(p) ? "#fff" : "#403c35"}
          >
            {note.finger}
          </text>
        )}
        {!black(p) && (p % 12 === 0 || down) && (
          <text
            x={x(p) + width(p) / 2}
            y={height + keyHeight - 6}
            textAnchor="middle"
            fontSize={Math.min(10, keyWidth * 0.38)}
            fill="#766b5e"
          >
            {noteName(p)}
          </text>
        )}
      </g>
    );
  };
  return (
    <div className="piano-roll-scroll">
      <svg
        className="piano-roll"
        viewBox={`0 0 1000 ${height + 98}`}
        style={{ minWidth: full ? 850 : 540 }}
        aria-label={waterfall ? "瀑布流和可弹奏键盘" : "可弹奏钢琴键盘"}
      >
        <defs>
          <clipPath id="piano-waterfall-clip">
            <rect width="1000" height={height} />
          </clipPath>
        </defs>
        {waterfall && (
          <g clipPath="url(#piano-waterfall-clip)">
            <rect width="1000" height={height} fill="var(--piano-roll-bg)" />
            {whites.map((p) => (
              <line
                key={p}
                x1={x(p)}
                x2={x(p)}
                y1={0}
                y2={height}
                stroke="var(--piano-roll-grid)"
              />
            ))}
            {Array.from({ length: 8 }, (_, i) => Math.floor(beat) + i).map(
              (b) => (
                <line
                  key={b}
                  x1={0}
                  x2={1000}
                  y1={height - (b - beat) * scale}
                  y2={height - (b - beat) * scale}
                  stroke="var(--piano-roll-grid)"
                  strokeDasharray="3 6"
                />
              ),
            )}
            {visible.map((n) => (
              <g key={n.id}>
                <rect
                  x={x(n.pitch) + 2}
                  y={height - (n.beat + n.duration - beat) * scale}
                  width={Math.max(4, width(n.pitch) - 4)}
                  height={Math.max(6, n.duration * scale - 3)}
                  rx={4}
                  fill={n.hand === "left" ? "#6f9681" : "#c58a5b"}
                  opacity={n.beat <= beat ? 1 : 0.82}
                />
                {fingers && n.finger && (
                  <text
                    x={x(n.pitch) + width(n.pitch) / 2}
                    y={Math.max(14, height - (n.beat - beat) * scale - 9)}
                    textAnchor="middle"
                    fill="white"
                    fontSize={12}
                  >
                    {n.finger}
                  </text>
                )}
              </g>
            ))}
          </g>
        )}
        {whites.map(key)}
        {pitches.filter(black).map(key)}
        <line
          x1={0}
          x2={1000}
          y1={height}
          y2={height}
          stroke="#b98056"
          strokeWidth={3}
        />
      </svg>
    </div>
  );
}
