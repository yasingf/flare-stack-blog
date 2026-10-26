import { useEffect, useRef, useState } from "react";
import type {
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
} from "opensheetmusicdisplay";
import { currentMeasure, type PianoScore } from "../score";

type Props = {
  score: PianoScore;
  beat: number;
  playing: boolean;
  zoom: number;
  explain: boolean;
  fingers: boolean;
  compact?: boolean;
  onSeek: (beat: number) => void;
  onNote: (id: string) => void;
  onSymbol: (key: string) => void;
};
type Position = {
  beat: number;
  sourceIndex: number;
  offset: number;
  element: SVGElement;
  noteId?: string;
};

export function ScoreView({
  score,
  beat,
  playing,
  zoom,
  explain,
  fingers,
  compact = false,
  onSeek,
  onNote,
  onSymbol,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef<Position[]>([]);
  const lastHighlighted = useRef<SVGElement[]>([]);
  const actions = useRef({ onSeek, onNote, onSymbol, explain });
  actions.current = { onSeek, onNote, onSymbol, explain };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (import.meta.env.SSR || !host.current) return;
    const element = host.current;
    let cancelled = false;
    let osmd: OpenSheetMusicDisplay | undefined;
    let observer: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const cleanups: (() => void)[] = [];
    setLoading(true);
    setError("");
    positions.current = [];
    void import("opensheetmusicdisplay")
      .then(async ({ OpenSheetMusicDisplay: Display }) => {
        if (cancelled) return;
        element.replaceChildren();
        osmd = new Display(element, {
          backend: "svg",
          autoResize: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawPartNames: false,
          drawFingerings: fingers,
          drawMeasureNumbers: true,
          followCursor: false,
          renderSingleHorizontalStaffline: false,
        });
        osmd.Zoom = zoom;
        osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = compact ? 0 : 4;
        await osmd.load(score.xml);
        if (cancelled) return;
        if (compact) {
          osmd.EngravingRules.PageTopMargin = 1;
          osmd.EngravingRules.PageTopMarginNarrow = 1;
          osmd.EngravingRules.PageLeftMargin = 3;
          osmd.EngravingRules.PageRightMargin = 2;
        }
        const render = () => {
          if (!osmd || cancelled) return;
          cleanups.splice(0).forEach((fn) => fn());
          osmd.render();
          positions.current = [];
          const sourceMeasures = osmd.Sheet.SourceMeasures;
          const bySource = new Map<number, typeof score.notes>();
          for (const note of score.notes) {
            const index = score.measures[note.measure].sourceIndex;
            if (!bySource.has(index)) bySource.set(index, []);
            bySource.get(index)!.push(note);
          }
          for (const [
            sourceIndex,
            staves,
          ] of osmd.GraphicSheet.MeasureList.entries()) {
            const firstPerformance = score.measures.find(
              (m) => m.sourceIndex === sourceIndex,
            );
            if (!firstPerformance) continue;
            for (const measure of staves)
              for (const staff of measure.staffEntries) {
                for (const fingering of staff.FingeringEntries || []) {
                  const label = fingering.SVGNode;
                  if (label instanceof Element)
                    label.setAttribute("data-piano-symbol", "fingering");
                }
              }
            for (const measure of staves)
              for (const staff of measure.staffEntries)
                for (const voice of staff.graphicalVoiceEntries)
                  for (const rawNote of voice.notes) {
                    const gNote = rawNote as VexFlowGraphicalNote;
                    const note = gNote.sourceNote;
                    // Each chord head has its own hit target; assigning handlers
                    // to the shared chord group would always select its last note.
                    const candidate =
                      gNote.getNoteheadSVGs?.()[gNote.vfnoteIndex] ||
                      gNote.getSVGGElement?.();
                    if (!(candidate instanceof SVGElement)) continue;
                    const svg = candidate;
                    const offset =
                      (note.getAbsoluteTimestamp().RealValue -
                        sourceMeasures[sourceIndex].AbsoluteTimestamp
                          .RealValue) *
                      4;
                    const pitch = note.Pitch
                      ? note.Pitch.getHalfTone() + 12
                      : undefined;
                    const match = bySource
                      .get(sourceIndex)
                      ?.find(
                        (n) =>
                          Math.abs(
                            n.beat - score.measures[n.measure].beat - offset,
                          ) < (score.format === "midi" ? 0.14 : 0.01) &&
                          (pitch === undefined || n.pitch === pitch),
                      );
                    const position = {
                      sourceIndex,
                      offset,
                      element: svg,
                      beat: firstPerformance.beat + offset,
                      noteId: match?.id,
                    };
                    positions.current.push(position);
                    svg.dataset.pianoNote =
                      match?.id || (pitch === undefined ? "rest" : "notation");
                    svg.setAttribute("tabindex", "0");
                    svg.setAttribute("role", "button");
                    svg.setAttribute(
                      "aria-label",
                      `第 ${firstPerformance.number} 小节，${match ? `${match.hand === "right" ? "右手" : "左手"}音符${match.finger ? `，指法 ${match.finger}` : ""}` : pitch === undefined ? "休止符" : "延续或装饰音符"}`,
                    );
                    const activate = (event: Event) => {
                      if (
                        event instanceof KeyboardEvent &&
                        event.key !== "Enter" &&
                        event.key !== " "
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const target = event.target as Element;
                      if (actions.current.explain) {
                        const cls = target
                          .closest("[data-piano-symbol]")
                          ?.getAttribute("data-piano-symbol");
                        if (cls) actions.current.onSymbol(cls);
                        else if (match) actions.current.onNote(match.id);
                        else
                          actions.current.onSymbol(
                            pitch === undefined ? "rest" : "note",
                          );
                      } else {
                        actions.current.onSeek(position.beat);
                        if (match) actions.current.onNote(match.id);
                      }
                    };
                    svg.addEventListener("click", activate);
                    svg.addEventListener("keydown", activate);
                    cleanups.push(() => {
                      svg.removeEventListener("click", activate);
                      svg.removeEventListener("keydown", activate);
                    });
                    for (const tie of gNote.getTieSVGs?.() || [])
                      tie.setAttribute("data-piano-symbol", "tied");
                    for (const slur of gNote.getSlurSVGs?.() || [])
                      slur.setAttribute("data-piano-symbol", "slur");
                    const articulation = match?.symbols.filter((s) =>
                      ["staccato", "tenuto", "accent", "fermata"].includes(s),
                    );
                    if (articulation?.length === 1) {
                      for (const modifier of gNote.getModifierSVGs?.() || []) {
                        if (!modifier.closest(".vf-accidental"))
                          modifier.setAttribute(
                            "data-piano-symbol",
                            articulation[0],
                          );
                      }
                    }
                  }
          }
          const selectors: [string, string][] = [
            [".vf-clef", "clef"],
            [".vf-keysignature", "key"],
            [".vf-timesignature", "time"],
            [".vf-accidental", "accidental"],
            [".vf-frethandfinger, .vf-stringnumber", "fingering"],
            [".vf-stavehairpin", "wedge"],
            [".vf-textdynamics", "dynamics"],
            [".vf-staverepetition", "repeat"],
            [".vf-pedalmarking", "pedal"],
            [".vf-stavetie", "tied"],
            [".vf-curve", "slur"],
            [".vf-ornament", "trill"],
            [".vf-articulation", "staccato"],
          ];
          for (const [selector, key] of selectors)
            element.querySelectorAll(selector).forEach((el) => {
              if (!el.hasAttribute("data-piano-symbol"))
                el.setAttribute("data-piano-symbol", key);
            });
          element
            .querySelectorAll(".vf-text:not(.measure-number)")
            .forEach((el) => {
              if (
                /^(p{1,3}|f{1,3}|m[pf]|s?fz|fp|rfz)$/.test(
                  el.textContent?.trim() || "",
                )
              )
                el.setAttribute("data-piano-symbol", "dynamics");
            });
          element.querySelectorAll("[data-piano-symbol]").forEach((el) => {
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            el.setAttribute("aria-label", "解释乐谱符号");
            const activate = (event: Event) => {
              if (!actions.current.explain) return;
              if (
                event instanceof KeyboardEvent &&
                !["Enter", " "].includes(event.key)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              actions.current.onSymbol(el.getAttribute("data-piano-symbol")!);
            };
            el.addEventListener("click", activate);
            el.addEventListener("keydown", activate);
            cleanups.push(() => {
              el.removeEventListener("click", activate);
              el.removeEventListener("keydown", activate);
            });
          });
          setRevision((r) => r + 1);
        };
        render();
        setLoading(false);
        let width = element.clientWidth;
        observer = new ResizeObserver(() => {
          if (Math.abs(width - element.clientWidth) > 4) {
            width = element.clientWidth;
            clearTimeout(timer);
            timer = setTimeout(render, 200);
          }
        });
        observer.observe(element);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "谱面排版失败，仍可使用瀑布流练习。",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
      osmd?.clear();
    };
  }, [score, zoom, fingers, compact]);

  useEffect(() => {
    const measure = score.measures[Math.max(0, currentMeasure(score, beat))];
    if (!measure) return;
    const offset = beat - measure.beat;
    const available = positions.current.filter(
      (p) => p.sourceIndex === measure.sourceIndex && p.offset <= offset + 0.04,
    );
    const last = available.reduce(
      (max, p) => Math.max(max, p.offset),
      -Infinity,
    );
    const active = available
      .filter((p) => Math.abs(p.offset - last) < 0.04)
      .map((p) => p.element);
    lastHighlighted.current.forEach((el) =>
      el.classList.remove("piano-note-current"),
    );
    active.forEach((el) => el.classList.add("piano-note-current"));
    lastHighlighted.current = active;
    if (playing && active[0] && scroll.current) {
      const box = active[0].getBoundingClientRect(),
        viewport = scroll.current.getBoundingClientRect();
      // A portrait phone can display a landscape practice surface with CSS.
      // Convert screen coordinates back to the scroller's axes in that case.
      const rotated =
        getComputedStyle(scroll.current)
          .getPropertyValue("--piano-rotated")
          .trim() === "1";
      const top = rotated ? viewport.right - box.right : box.top - viewport.top;
      const bottom = rotated
        ? viewport.right - box.left
        : box.bottom - viewport.top;
      const left = rotated ? box.top - viewport.top : box.left - viewport.left;
      const right = rotated
        ? box.bottom - viewport.top
        : box.right - viewport.left;
      const outsideVertical =
        top < 35 || bottom > scroll.current.clientHeight - 80;
      const outsideHorizontal =
        left < 24 || right > scroll.current.clientWidth - 24;
      if (outsideVertical || outsideHorizontal)
        scroll.current.scrollTo({
          top: outsideVertical
            ? scroll.current.scrollTop + top - 90
            : scroll.current.scrollTop,
          left: outsideHorizontal
            ? scroll.current.scrollLeft + left - 80
            : scroll.current.scrollLeft,
          behavior: "smooth",
        });
    }
  }, [beat, playing, revision, score]);

  return (
    <div
      className={`piano-score-scroll ${explain ? "is-explaining" : ""}`}
      ref={scroll}
      aria-label="五线谱"
    >
      {loading && (
        <p className="piano-empty" role="status">
          正在排版五线谱…
        </p>
      )}
      {error && (
        <p className="piano-error" role="alert">
          {error}
        </p>
      )}
      <div className="piano-notation" ref={host} />
    </div>
  );
}
