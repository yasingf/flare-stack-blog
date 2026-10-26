import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Repeat2,
  RotateCcw,
  X,
} from "lucide-react";
import { beatSeconds, currentMeasure, type PianoScore } from "../score";
import type { PracticeOptions, usePractice } from "../use-practice";

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function HandPicker({
  hand,
  onChange,
}: {
  hand: PracticeOptions["hand"];
  onChange: (hand: PracticeOptions["hand"]) => void;
}) {
  return (
    <div className="piano-hand-picker" role="group" aria-label="练习左右手">
      {(
        [
          ["left", "左手"],
          ["both", "双手"],
          ["right", "右手"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          aria-label={`练习${label}`}
          aria-pressed={hand === value}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MeasureInput({
  value,
  max,
  label,
  onCommit,
}: {
  value: number;
  max: number;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      aria-label={label}
      value={draft ?? value}
      onFocus={(event) => {
        setDraft(String(value));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const raw = event.target.value.trim();
        const next =
          raw && Number.isFinite(Number(raw))
            ? Math.max(1, Math.min(max, Math.round(Number(raw))))
            : value;
        setDraft(null);
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.value = String(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function PracticeControls({
  score,
  options,
  practice,
  onChange,
}: {
  score: PianoScore;
  options: PracticeOptions;
  practice: ReturnType<typeof usePractice>;
  onChange: (update: Partial<PracticeOptions>) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const [picker, setPicker] = useState<"jump" | "loop" | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const drag = useRef<{ resume: boolean; beat: number } | null>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const count = score.measures.length;
  const beat = preview ?? practice.beat;
  const index = Math.max(0, currentMeasure(score, beat));
  const from = options.loop ? score.measures[options.startMeasure - 1].beat : 0;
  const to = options.loop
    ? (score.measures[options.endMeasure]?.beat ?? score.totalBeats)
    : score.totalBeats;
  const elapsed =
    Math.max(0, beatSeconds(score, beat) - beatSeconds(score, from)) /
    options.speed;
  const duration =
    (beatSeconds(score, to) - beatSeconds(score, from)) / options.speed;
  const position = Math.max(
    0,
    Math.min(100, ((beat - from) / (to - from)) * 100),
  );

  useEffect(() => {
    const element = grid.current;
    const current = element?.querySelector<HTMLElement>(
      '[aria-current="step"]',
    );
    if (element && current) {
      element.scrollTop =
        current.offsetTop - element.clientHeight / 2 + current.offsetHeight / 2;
      current.focus({ preventScroll: true });
    }
  }, [picker]);

  function closePicker() {
    setPicker(null);
    setAnchor(null);
    pickerButton.current?.focus();
  }
  function openPicker(mode: "jump" | "loop") {
    practice.pause();
    setAnchor(null);
    setPicker(picker === mode ? null : mode);
  }
  function loop(start: number, end: number) {
    onChange({ startMeasure: start, endMeasure: end, loop: true });
    practice.seek(score.measures[start - 1].beat);
  }
  function jump(number: number) {
    const outside =
      options.loop &&
      (number < options.startMeasure || number > options.endMeasure);
    const resume = practice.clock.current.playing && !outside;
    if (outside) onChange({ loop: false });
    practice.seek(score.measures[number - 1].beat, resume);
  }
  function finishDrag(value: number, cancel = false) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setPreview(null);
    if (cancel) practice.seek(state.beat);
    else seekPosition(value, state.resume);
  }
  function seekPosition(value: number, resume: boolean) {
    const atEnd = value >= to - 0.001;
    // The B boundary is the start of the following measure; keep the stopped
    // cursor inside B instead of highlighting a note outside the selected loop.
    practice.seek(options.loop && atEnd ? to - 0.001 : value, resume && !atEnd);
  }

  return (
    <div className="piano-practice-controls" aria-label="小节与循环控制">
      <div className="piano-seek-row">
        <div className="piano-measure-navigation">
          <button
            className="piano-icon-button"
            aria-label="回到练习段开头"
            title="回到练习段开头"
            onClick={() => practice.seek(from, practice.clock.current.playing)}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="piano-icon-button"
            aria-label="上一小节"
            disabled={index <= (options.loop ? options.startMeasure - 1 : 0)}
            onClick={() => jump(index)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>小节</span>
          <MeasureInput
            value={index + 1}
            max={count}
            label="跳转到演奏小节"
            onCommit={jump}
          />
          <span className="piano-measure-total">/ {count}</span>
          <button
            className="piano-icon-button"
            aria-label="下一小节"
            disabled={
              index >= (options.loop ? options.endMeasure - 1 : count - 1)
            }
            onClick={() => jump(index + 2)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            className="piano-icon-button"
            ref={pickerButton}
            aria-label="打开小节速选"
            aria-expanded={picker !== null}
            onClick={() => openPicker("jump")}
          >
            <Grid2X2 size={15} />
          </button>
        </div>
        <div className="piano-timeline">
          <input
            type="range"
            aria-label="曲谱播放位置"
            aria-valuetext={`第 ${score.measures[index].number} 小节，演奏顺序 ${index + 1}，${time(elapsed)}`}
            min={from}
            max={to}
            step="0.125"
            value={Math.min(to, Math.max(from, beat))}
            disabled={practice.busy}
            style={{
              backgroundImage: `linear-gradient(to right, var(--piano-accent) ${position}%, var(--piano-line) ${position}%)`,
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                resume: practice.clock.current.playing,
                beat: practice.clock.current.beat,
              };
              practice.pause();
            }}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (drag.current) setPreview(value);
              else seekPosition(value, practice.clock.current.playing);
            }}
            onPointerUp={(event) =>
              finishDrag(Number(event.currentTarget.value))
            }
            onPointerCancel={() => finishDrag(0, true)}
            onLostPointerCapture={() => finishDrag(0, true)}
            onBlur={() => finishDrag(0, true)}
          />
          <div className="piano-timeline-labels">
            <span>{options.loop ? `A ${options.startMeasure}` : "开头"}</span>
            <span>
              {preview !== null
                ? `松手定位 · 第 ${index + 1} 小节`
                : options.loop
                  ? "循环段进度"
                  : "全曲进度"}
            </span>
            <span>{options.loop ? `B ${options.endMeasure}` : "结尾"}</span>
          </div>
        </div>
        <output className="piano-play-time">
          {time(elapsed)} <span>/ {time(duration)}</span>
        </output>
      </div>
      <div className="piano-loop-controls">
        <button
          className="piano-loop-toggle"
          aria-pressed={options.loop}
          onClick={() => {
            if (options.loop) onChange({ loop: false });
            else loop(options.startMeasure, options.endMeasure);
          }}
        >
          <Repeat2 size={15} /> A–B 循环
        </button>
        <label>
          A{" "}
          <MeasureInput
            value={options.startMeasure}
            max={count}
            label="循环起始小节"
            onCommit={(n) => loop(n, Math.max(n, options.endMeasure))}
          />
        </label>
        <button
          title="当前位置的小节设为 A"
          onClick={() =>
            loop(index + 1, Math.max(index + 1, options.endMeasure))
          }
        >
          设 A
        </button>
        <label>
          B{" "}
          <MeasureInput
            value={options.endMeasure}
            max={count}
            label="循环结束小节"
            onCommit={(n) => loop(Math.min(n, options.startMeasure), n)}
          />
        </label>
        <button
          title="当前位置的小节设为 B"
          onClick={() =>
            loop(Math.min(index + 1, options.startMeasure), index + 1)
          }
        >
          设 B
        </button>
        <button
          aria-expanded={picker === "loop"}
          onClick={() => openPicker("loop")}
        >
          点选 A–B
        </button>
        <span
          className="piano-loop-presets"
          role="group"
          aria-label="快速循环长度"
        >
          {[2, 4, 8].map((length) => (
            <button
              key={length}
              title={`从当前小节循环 ${length} 小节`}
              onClick={() => loop(index + 1, Math.min(count, index + length))}
            >
              {length} 小节
            </button>
          ))}
        </span>
      </div>
      {picker && (
        <section
          className="piano-measure-picker"
          aria-label="小节速选"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closePicker();
            }
          }}
        >
          <div className="piano-picker-heading">
            <div className="piano-segments small">
              <button
                aria-pressed={picker === "jump"}
                onClick={() => {
                  setPicker("jump");
                  setAnchor(null);
                }}
              >
                定位小节
              </button>
              <button
                aria-pressed={picker === "loop"}
                onClick={() => {
                  setPicker("loop");
                  setAnchor(null);
                }}
              >
                选择循环段
              </button>
            </div>
            <button
              className="piano-icon-button"
              aria-label="关闭小节速选"
              onClick={closePicker}
            >
              <X size={15} />
            </button>
          </div>
          <p>
            {picker === "jump"
              ? "点选后跳到小节开头；跳出循环段会关闭循环。"
              : anchor === null
                ? "先点 A，再点 B；重复点击同一小节可单独循环。"
                : `已选 A：${anchor}，再点结束小节（可向前选）。`}
          </p>
          <div className="piano-measure-grid" ref={grid}>
            {score.measures.map((measure, i) => (
              <button
                key={i}
                aria-label={`选择演奏小节 ${i + 1}，谱面 ${measure.number}`}
                aria-current={i === index ? "step" : undefined}
                className={`${options.loop && i + 1 >= options.startMeasure && i + 1 <= options.endMeasure ? "in-loop" : ""} ${anchor === i + 1 ? "is-anchor" : ""}`}
                onClick={() => {
                  if (picker === "jump") {
                    jump(i + 1);
                    closePicker();
                  } else if (anchor === null) setAnchor(i + 1);
                  else {
                    loop(Math.min(anchor, i + 1), Math.max(anchor, i + 1));
                    closePicker();
                  }
                }}
              >
                {i + 1}
                {String(i + 1) !== measure.number && (
                  <small>谱 {measure.number}</small>
                )}
              </button>
            ))}
          </div>
          <small>编号按演奏顺序排列，包含反复段。</small>
        </section>
      )}
    </div>
  );
}
