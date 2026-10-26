import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
} from "opensheetmusicdisplay";
import { enablePedalTargets } from "../pedal-targets";
import { currentMeasure, type PianoScore } from "../score";

type Props = {
  score: PianoScore;
  clock: RefObject<{ beat: number; playing: boolean }>;
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
  clock,
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
  const positionsByMeasure = useRef(new Map<number, Position[]>());
  const lastHighlighted = useRef<SVGElement[]>([]);
  const lastFollowedMeasure = useRef(-1);
  const geometry = useRef(
    new Map<
      SVGElement,
      { x: number; y: number; width: number; height: number }
    >(),
  );
  const highlights = useRef<HTMLDivElement[]>([]);
  const overlay = useRef<HTMLDivElement | null>(null);
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
      .then(
        async ({ OpenSheetMusicDisplay: Display, VexFlowMusicSheetDrawer }) => {
          enablePedalTargets(VexFlowMusicSheetDrawer);
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
          osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = 4;
          await osmd.load(score.xml);
          if (cancelled) return;
          if (compact) {
            osmd.EngravingRules.PageTopMargin = 1;
            osmd.EngravingRules.PageTopMarginNarrow = 1;
            osmd.EngravingRules.PageLeftMargin = 3;
            osmd.EngravingRules.PageRightMargin = 2;
          }
          const render = () => {
            if (!osmd || cancelled || element.clientWidth < 160) return;
            cleanups.splice(0).forEach((fn) => fn());
            osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = Math.max(
              1,
              Math.min(4, Math.floor(element.clientWidth / 260)),
            );
            if (compact)
              osmd.Zoom =
                (Math.max(0.48, Math.min(1.05, element.clientWidth / 1350)) *
                  zoom) /
                0.8;
            osmd.render();
            if (compact && scroll.current) {
              const system = osmd.GraphicSheet.MusicPages[0]?.MusicSystems[0];
              const systemHeight =
                (system?.PositionAndShape.MarginSize.height || 0) *
                10 *
                osmd.Zoom;
              const available = scroll.current.clientHeight - 22;
              if (systemHeight > available && available > 80) {
                osmd.Zoom = Math.max(
                  0.35,
                  (osmd.Zoom * available) / systemHeight,
                );
                osmd.render();
              }
            }
            lastHighlighted.current = [];
            lastFollowedMeasure.current = -1;
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
                        match?.id ||
                        (pitch === undefined ? "rest" : "notation");
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
                        for (const modifier of gNote.getModifierSVGs?.() ||
                          []) {
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
            positionsByMeasure.current = new Map();
            for (const position of positions.current) {
              const group =
                positionsByMeasure.current.get(position.sourceIndex) || [];
              group.push(position);
              positionsByMeasure.current.set(position.sourceIndex, group);
            }
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
            element
              .querySelectorAll('[data-piano-symbol="pedal"] path')
              .forEach((path) => {
                const hit = path.cloneNode(true) as SVGElement;
                hit.setAttribute("stroke", "transparent");
                hit.setAttribute("fill", "none");
                hit.setAttribute("stroke-width", "14");
                hit.setAttribute("aria-hidden", "true");
                path.parentNode?.appendChild(hit);
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
            // Read note geometry once after engraving. Playback moves small HTML
            // overlays; changing SVG classes would invalidate the entire score on
            // each note and trigger expensive layout/raster work on mobile.
            const origin = element.getBoundingClientRect();
            const rotated =
              getComputedStyle(element)
                .getPropertyValue("--piano-rotated")
                .trim() === "1";
            geometry.current = new Map();
            for (const p of positions.current) {
              const box = p.element.getBoundingClientRect();
              geometry.current.set(p.element, {
                x: rotated ? box.top - origin.top : box.left - origin.left,
                y: rotated ? origin.right - box.right : box.top - origin.top,
                width: rotated ? box.height : box.width,
                height: rotated ? box.width : box.height,
              });
            }
            const layer = document.createElement("div");
            layer.className = "piano-playhead-layer";
            layer.setAttribute("aria-hidden", "true");
            element.appendChild(layer);
            overlay.current = layer;
            highlights.current = [];
            setRevision((r) => r + 1);
          };
          render();
          setLoading(false);
          let width = element.clientWidth,
            height = scroll.current?.clientHeight;
          observer = new ResizeObserver(() => {
            if (
              Math.abs(width - element.clientWidth) > 4 ||
              (compact && height !== scroll.current?.clientHeight)
            ) {
              width = element.clientWidth;
              height = scroll.current?.clientHeight;
              clearTimeout(timer);
              timer = setTimeout(render, 200);
            }
          });
          observer.observe(element);
          if (scroll.current) observer.observe(scroll.current);
        },
      )
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
    let frame = 0;
    lastFollowedMeasure.current = -1;
    const update = () => {
      const beat = clock.current.beat;
      const measure = score.measures[Math.max(0, currentMeasure(score, beat))];
      if (!measure) return;
      const offset = beat - measure.beat;
      const available = (
        positionsByMeasure.current.get(measure.sourceIndex) || []
      ).filter((p) => p.offset <= offset + 0.04);
      const last = available.reduce(
        (max, p) => Math.max(max, p.offset),
        -Infinity,
      );
      const active = available
        .filter((p) => Math.abs(p.offset - last) < 0.04)
        .map((p) => p.element);
      if (
        active.length === lastHighlighted.current.length &&
        active.every((el, i) => el === lastHighlighted.current[i])
      )
        return;
      // Read scroll geometry before moving highlights; scrolling only needs to be
      // checked on a new measure, not on every sixteenth-note highlight.
      if (
        playing &&
        active[0] &&
        scroll.current &&
        lastFollowedMeasure.current !== measure.sourceIndex
      ) {
        lastFollowedMeasure.current = measure.sourceIndex;
        const box = geometry.current.get(active[0]);
        if (!box) return;
        const top =
          box.y + (host.current?.offsetTop || 0) - scroll.current.scrollTop;
        const bottom = top + box.height;
        const left = box.x - scroll.current.scrollLeft;
        const right = left + box.width;
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
            behavior: compact ? "instant" : "smooth",
          });
      }
      for (
        let i = 0;
        i < Math.max(active.length, highlights.current.length);
        i++
      ) {
        let mark = highlights.current[i];
        if (!mark && overlay.current) {
          mark = document.createElement("div");
          mark.className = "piano-playhead-note";
          overlay.current.appendChild(mark);
          highlights.current.push(mark);
        }
        if (!mark) continue;
        const box = active[i] && geometry.current.get(active[i]);
        mark.style.display = box ? "block" : "none";
        if (box) {
          mark.style.transform = `translate3d(${box.x - 3}px,${box.y - 3}px,0)`;
          mark.style.width = `${box.width + 6}px`;
          mark.style.height = `${box.height + 6}px`;
        }
      }
      lastHighlighted.current = active;
    };
    const tick = () => {
      update();
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [clock, playing, revision, score, compact]);

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
