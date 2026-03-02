import { AlphaTabApi, Environment, PlayerMode, midi } from "@coderline/alphatab";
import {
  Activity,
  ChevronDown,
  ListMusic,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  Printer,
  Repeat,
  Square,
  Timer,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GuitarProViewerProps } from "./types";
import { Button } from "@/components/ui/button";

// ─── Helpers ────────────────────────────────────────────

/** 毫秒 → mm:ss */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 通过同步点将 MIDI 合成时间（synthTime）映射为伴奏音频时间（syncTime）。
 * 使用线性插值在两个相邻同步点之间计算精确位置。
 * 如果没有同步点则 1:1 映射。
 */
function synthTimeToAudioTime(
  synthTimeMs: number,
  syncPoints: Array<{ synthTime: number; syncTime: number }>,
): number {
  if (syncPoints.length === 0) return synthTimeMs;
  // 在第一个同步点之前
  if (synthTimeMs <= syncPoints[0].synthTime) {
    // 按第一段的比率反推（或 clamp 到 0）
    if (syncPoints.length >= 2) {
      const s0 = syncPoints[0];
      const s1 = syncPoints[1];
      const ratio =
        s1.synthTime !== s0.synthTime
          ? (s1.syncTime - s0.syncTime) / (s1.synthTime - s0.synthTime)
          : 1;
      return Math.max(0, s0.syncTime + (synthTimeMs - s0.synthTime) * ratio);
    }
    return Math.max(0, syncPoints[0].syncTime + (synthTimeMs - syncPoints[0].synthTime));
  }
  // 在最后一个同步点之后
  const last = syncPoints[syncPoints.length - 1];
  if (synthTimeMs >= last.synthTime) {
    if (syncPoints.length >= 2) {
      const prev = syncPoints[syncPoints.length - 2];
      const ratio =
        last.synthTime !== prev.synthTime
          ? (last.syncTime - prev.syncTime) / (last.synthTime - prev.synthTime)
          : 1;
      return last.syncTime + (synthTimeMs - last.synthTime) * ratio;
    }
    return last.syncTime + (synthTimeMs - last.synthTime);
  }
  // 二分查找区间
  let lo = 0;
  let hi = syncPoints.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (syncPoints[mid].synthTime <= synthTimeMs) lo = mid;
    else hi = mid;
  }
  const s0 = syncPoints[lo];
  const s1 = syncPoints[hi];
  const t =
    s1.synthTime !== s0.synthTime
      ? (synthTimeMs - s0.synthTime) / (s1.synthTime - s0.synthTime)
      : 0;
  return s0.syncTime + t * (s1.syncTime - s0.syncTime);
}

// ─── Constants ──────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];
const ZOOM_STEPS = [0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];
const DEFAULT_MASTER_VOLUME = 1.0;
const MAX_MASTER_VOLUME = 1.0;

/**
 * 根据轨道名称推断 MIDI Program 编号（General MIDI）。
 * 返回 null 表示不需要覆盖（保持原始音色）。
 */
function inferMidiProgram(trackName: string): number | null {
  const n = trackName.toLowerCase();
  // 钢琴 / 简谱 / 声乐
  if (/piano|钢琴|简谱|keyboard|键盘/.test(n)) return 0; // Acoustic Grand Piano
  if (/vocal|voice|声乐|人声|唱|歌/.test(n)) return 0; // Piano for vocal tracks
  // 吉他
  if (/acoustic.*guitar|木吉他|民谣吉他|nylon/i.test(n)) return 25; // Acoustic Guitar (Nylon)
  if (/steel|folk/i.test(n)) return 25; // Acoustic Guitar (Steel)
  if (/electric.*guitar|电吉他|e\.?guitar|clean/i.test(n)) return 27; // Electric Guitar (Clean)
  if (/overdriven|失真|distort|dist\.?/i.test(n)) return 29; // Overdriven Guitar
  if (/guitar|吉他/.test(n)) return 25; // Default guitar
  // 贝斯
  if (/bass|贝斯|低音/.test(n)) return 33; // Electric Bass (Finger)
  // 弦乐
  if (/violin|小提琴/.test(n)) return 40;
  if (/viola|中提琴/.test(n)) return 41;
  if (/cello|大提琴/.test(n)) return 42;
  if (/strings|弦乐/.test(n)) return 48; // String Ensemble
  // 管乐
  if (/flute|长笛/.test(n)) return 73;
  if (/trumpet|小号/.test(n)) return 56;
  if (/sax|萨克斯/.test(n)) return 65; // Alto Sax
  // 其他
  if (/organ|管风琴/.test(n)) return 19; // Church Organ
  if (/synth|合成/.test(n)) return 80; // Synth Lead
  if (/drum|鼓|percussion|打击/.test(n)) return null; // 鼓组不覆盖 (channel 9)
  return null;
}

/**
 * 歌词 monkey-patch（模块加载时执行）：
 * 1. 从 TabBarRendererFactory（六线谱）上移除歌词效果，避免多轨时歌词重复
 * 2. 为 NumberedBarRendererFactory（简谱）注入歌词效果，使简谱轨道显示歌词
 *
 * alphaTab 默认只在 TabBarRendererFactory 上注册了 LyricsEffectInfo，
 * 多轨渲染时会导致六线谱和简谱轨道各显示一份歌词。
 * 修复方式：从 Tab 渲染器中移除歌词，仅注入到简谱渲染器（SharedBottom）。
 */
const EFFECT_BAND_MODE_SHARED_BOTTOM = 3;
const NOTATION_ELEMENT_EFFECT_LYRICS = 24;
try {
  const env = Environment as unknown as Record<string, unknown>;
  const renderers = env.defaultRenderers as Array<unknown>;
  if (Array.isArray(renderers)) {
    let lyricsEffect: unknown = null;
    let numberedFactory: Record<string, unknown> | null = null;

    for (const factory of renderers) {
      const f = factory as Record<string, unknown>;

      // 识别 NumberedBarRendererFactory（staffId === 'numbered'）
      let staffId: unknown;
      try { staffId = f.staffId; } catch { /* */ }
      if (staffId === "numbered") {
        numberedFactory = f;
      }

      const bands = f.effectBands as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(bands)) continue;

      // 反向遍历以安全删除
      for (let i = bands.length - 1; i >= 0; i--) {
        const band = bands[i];
        const effect = band.effect as Record<string, unknown> | undefined;
        if (!effect) continue;
        let ne: unknown;
        try { ne = effect.notationElement; } catch { continue; }
        if (ne === NOTATION_ELEMENT_EFFECT_LYRICS) {
          lyricsEffect = effect;
          if (staffId === "numbered") {
            // 简谱渲染器：保留歌词，改为 SharedBottom
            band.mode = EFFECT_BAND_MODE_SHARED_BOTTOM;
          } else {
            // Tab / Score 等渲染器：移除歌词效果，避免与简谱重复
            bands.splice(i, 1);
          }
        }
      }
    }

    // 若简谱渲染器原本没有歌词效果，则注入
    if (numberedFactory && lyricsEffect) {
      const bands = numberedFactory.effectBands as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(bands)) {
        const hasLyrics = bands.some((b) => {
          try { return (b.effect as Record<string, unknown>)?.notationElement === NOTATION_ELEMENT_EFFECT_LYRICS; }
          catch { return false; }
        });
        if (!hasLyrics) {
          bands.push({ effect: lyricsEffect, mode: EFFECT_BAND_MODE_SHARED_BOTTOM });
        }
      }
    }
  }
} catch {
  // 静默失败
}

type DisplayMode = "default" | "scoreTab" | "score" | "tab";

interface DisplayModeOption {
  value: DisplayMode;
  label: string;
  profile: number;
}

const DISPLAY_MODES: Array<DisplayModeOption> = [
  { value: "default", label: "默认", profile: 0 },
  { value: "scoreTab", label: "标准 + TAB", profile: 1 },
  { value: "score", label: "五线谱", profile: 2 },
  { value: "tab", label: "TAB 谱", profile: 3 },
];

interface TrackState {
  index: number;
  name: string;
  isSelected: boolean;
  isMuted: boolean;
  isSolo: boolean;
  volume: number; // 0–16 (alphaTab range)
}

/**
 * alphaTab 光标样式 + 深色模式适配
 *
 * 注意：`.at-cursor-beat` 的 width / height / transform 由 alphaTab JS 通过
 * inline style 设定（ScalableHtmlElementContainer），CSS !important 无法覆盖。
 * 只有 background / opacity / box-shadow 等属性可以通过 CSS 安全修改。
 * I-beam（工字）效果通过 JS 叠加独立 DOM 元素实现，见 setupIBeamOverlay()。
 */
const ALPHATAB_CURSOR_STYLES = `
  .at-cursor-bar {
    background: hsl(var(--accent) / 0.06) !important;
  }
  .at-cursor-beat {
    /* 隐藏贯穿谱面的垂直线，只通过 I-beam 横杠显示位置指示 */
    background: transparent !important;
    opacity: 1 !important;
    z-index: 100 !important;
    overflow: visible !important;
  }
  .at-highlight * {
    fill: hsl(var(--accent)) !important;
  }
  .at-selection div {
    background: hsl(var(--accent) / 0.1) !important;
  }

  /* ── alphaTab 深色模式适配 ── */
  /* alphaTab SVG 使用 rgb(0,0,0) / rgb(255,255,255) 硬编码颜色 */
  .dark .at-surface svg text {
    fill: hsl(var(--foreground)) !important;
  }
  .dark .at-surface svg path {
    fill: hsl(var(--foreground) / 0.85) !important;
    stroke: hsl(var(--foreground) / 0.85) !important;
  }
  /* 背景矩形（白色 → 透明） */
  .dark .at-surface svg rect[fill="rgb(255,255,255)"],
  .dark .at-surface svg rect[fill="white"],
  .dark .at-surface svg rect[fill="#ffffff"],
  .dark .at-surface svg rect[fill="#FFFFFF"],
  .dark .at-surface svg rect[fill="#fff"] {
    fill: transparent !important;
  }
  /* 拍线和小节线 — 使用较高不透明度确保可见 */
  .dark .at-surface svg line {
    stroke: hsl(var(--foreground) / 0.75) !important;
  }
  /* 黑色细矩形（alphaTab 用于绘制小节线、beam 等） */
  .dark .at-surface svg rect[fill="rgb(0,0,0)"],
  .dark .at-surface svg rect[fill="black"],
  .dark .at-surface svg rect[fill="#000000"],
  .dark .at-surface svg rect[fill="#000"] {
    fill: hsl(var(--foreground) / 0.75) !important;
  }
  .dark .at-surface svg circle {
    fill: hsl(var(--foreground) / 0.85) !important;
    stroke: hsl(var(--foreground) / 0.85) !important;
  }
  /* 让高亮保持 accent 色不被覆盖 */
  .dark .at-highlight * {
    fill: hsl(var(--accent)) !important;
    stroke: hsl(var(--accent)) !important;
  }

  /* Viewer open/close — clip-path expand from origin */
  .gp-viewer-root {
    will-change: clip-path;
    transition: clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .gp-viewer-root[data-state="exiting"] {
    transition-duration: 350ms;
  }
  .gp-viewer-root[data-state="open"] {
    clip-path: inset(0 0 0 0);
  }

  /* Backdrop */
  .gp-viewer-backdrop {
    transition: opacity 400ms ease;
  }
  .gp-viewer-root[data-state="entering"] .gp-viewer-backdrop {
    opacity: 0;
  }
  .gp-viewer-root[data-state="open"] .gp-viewer-backdrop {
    opacity: 1;
  }
  .gp-viewer-root[data-state="exiting"] .gp-viewer-backdrop {
    opacity: 0;
    transition-duration: 250ms;
  }

  /* Inner panel — smooth fullscreen toggle */
  .gp-viewer-panel {
    transition: top 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
                left 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
                right 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
                bottom 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
                border-radius 400ms cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 400ms ease;
  }

  .gp-viewer-content {
    transition: opacity 350ms ease;
  }
  .gp-viewer-root[data-state="entering"] .gp-viewer-content {
    opacity: 0;
  }
  .gp-viewer-root[data-state="open"] .gp-viewer-content {
    opacity: 1;
  }
  .gp-viewer-root[data-state="exiting"] .gp-viewer-content {
    opacity: 0;
    transition-duration: 200ms;
  }
`;

// ─── Sub-components ─────────────────────────────────────

/** 自定义滑轨 — 带已填充进度指示 */
function SliderTrack({
  value,
  max,
  onChange,
  className = "",
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`relative h-1.5 group ${className}`}>
      {/* 轨道背景 + 已填充部分 */}
      <div className="absolute inset-0 bg-muted/30 overflow-hidden">
        <div
          className="h-full bg-foreground/30 group-hover:bg-foreground/50 transition-colors"
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* 不可见的原生滑块（提供交互） */}
      <input
        type="range"
        min={0}
        max={max}
        step={max / 200 || 0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
      />
      {/* 拖拽指示点 */}
      <div
        className="absolute top-1/2 w-2.5 h-2.5 bg-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ left: `${percent}%`, transform: "translate(-50%, -50%)" }}
      />
    </div>
  );
}

// ─── Audio Effects ──────────────────────────────────────

/**
 * 为 alphaTab 的音频输出添加效果链，提升 MIDI 音色质量。
 * 通过访问内部 AudioContext 实现（非公开 API，但稳定可用）。
 *
 * 信号链：
 *   outputNode → compressor → lowShelf EQ → chorus → dryGain ─┐
 *                                                              ├→ destination
 *   outputNode → compressor → lowShelf EQ → chorus → convolver → wetGain ─┘
 *
 * 改善：
 * - 低频架式 EQ：增强低音温暖度和持续感
 * - 更长的压缩器释放时间：让音符自然衰减而非突然截断
 * - 合唱效果：增加声音丰富度，减少机械感
 * - 混响：模拟空间感
 */
/** alphaTab 内部播放器输出结构（非公开 API） */
interface AlphaTabPlayerOutput {
  context?: AudioContext;
  _worklet?: AudioNode;
  _audioNode?: AudioNode;
}

function setupAudioEffects(api: AlphaTabApi): void {
  try {
    const output = (
      api as unknown as { player?: { output?: AlphaTabPlayerOutput } }
    ).player?.output;
    if (!output) return;

    const ctx: AudioContext | undefined = output.context;
    if (!ctx) return;

    // 找到 alphaTab 的输出节点（AudioWorklet 或 ScriptProcessor 模式）
    const outputNode: AudioNode | undefined =
      output._worklet ?? output._audioNode;
    if (!outputNode) return;

    // 断开原始连接（outputNode → destination）
    outputNode.disconnect();

    // ── 压缩器：增加延音 / 减少动态范围 ──
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -35; // 更低阈值，捕获更多信号
    compressor.knee.value = 25;
    compressor.ratio.value = 3; // 更温和的压缩比，保留动态
    compressor.attack.value = 0.005; // 稍慢的起音
    compressor.release.value = 1.2; // 慢释放 = 更长延音感，低音持续更久

    // ── 低频架式 EQ：增强低音温暖度 + 持续感 ──
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 250; // 250Hz 以下增强
    lowShelf.gain.value = 5; // +5dB 低音增强

    // ── 中高频柔化：減少 MIDI 的尖锐感 ──
    const midCut = ctx.createBiquadFilter();
    midCut.type = "peaking";
    midCut.frequency.value = 3000; // 3kHz 附近
    midCut.Q.value = 1.0;
    midCut.gain.value = -3; // 轻微削减刺耳频段

    // ── 合唱效果：增加声音丰富度，减少机械感 ──
    // 使用 delay + LFO 调制实现简单合唱
    const chorusDelay = ctx.createDelay(0.05);
    chorusDelay.delayTime.value = 0.015; // 15ms 基础延迟
    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.3; // 合唱混合量
    const chorusDryGain = ctx.createGain();
    chorusDryGain.gain.value = 1.0;
    // LFO 调制延迟时间
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.8; // 0.8Hz 调制频率
    lfoGain.gain.value = 0.003; // 调制深度 ±3ms
    lfo.connect(lfoGain);
    lfoGain.connect(chorusDelay.delayTime);
    lfo.start();

    // ── 混响（卷积器 + 算法脉冲响应）──
    const convolver = ctx.createConvolver();
    const reverbTime = 2.2; // 稍长混响
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * reverbTime);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // 指数衰减 + 随机噪声 = 类似厅堂混响
        // 使用更柔和的衰减曲线
        const t = i / length;
        const decay = Math.exp(-3.5 * t) * (1 - t * 0.3);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    convolver.buffer = impulse;

    // ── 干 / 湿混合 ──
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 0.68;
    wetGain.gain.value = 0.32;

    // ── 连接效果链 ──
    // outputNode → compressor → lowShelf → midCut → chorusMix → dry/wet
    outputNode.connect(compressor);
    compressor.connect(lowShelf);
    lowShelf.connect(midCut);

    // 合唱混合节点
    const chorusMerge = ctx.createGain();
    chorusMerge.gain.value = 1.0;

    // 干路（直通）
    midCut.connect(chorusDryGain);
    chorusDryGain.connect(chorusMerge);
    // 湿路（合唱延迟）
    midCut.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(chorusMerge);

    // 混响分支
    chorusMerge.connect(dryGain);
    chorusMerge.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(ctx.destination);
    wetGain.connect(ctx.destination);

    console.log(JSON.stringify({ message: "audio effects chain initialized (enhanced)" }));
  } catch (e) {
    // 如果 hack 失败，静默降级（无效果但仍可播放）
    console.warn(
      JSON.stringify({
        message: "audio effects setup failed, falling back to dry output",
        error: String(e),
      }),
    );
  }
}

// ─── I-beam Overlay ─────────────────────────────────────

/**
 * 在 `.at-cursor-beat` 内部创建 I-beam（工字）横杠。
 *
 * alphaTab 的拍光标是 ScalableHtmlElementContainer：
 *   - 基础尺寸 width:300px, height:100px
 *   - 用 transform: translate(X,Y) scale(sX,sY) translateX(-50%) 缩放到实际尺寸
 *
 * 将横杠作为 beatCursor 的 **子元素** 可以零延迟跟随移动，
 * 再通过反向 scale(1/sX, 1/sY) 抵消父级缩放，使横杠保持正常像素尺寸。
 */
function setupIBeamOverlay(container: HTMLElement): (() => void) | null {
  const beatCursor = container.querySelector(".at-cursor-beat");
  if (!beatCursor) return null;

  const SERIF_W = 16; // 横杠视觉宽度 px
  const SERIF_H = 2.5; // 横杠视觉高度 px
  const STEM_W = 2.5; // 竖线宽度 px
  const STEM_H = 6; // 竖线延伸长度 px（缩短以避免遮挡和弦名称）
  const ACCENT_COLOR = "hsl(var(--accent))";
  const ACCENT_SHADOW = "hsl(var(--accent) / 0.4)";

  /**
   * 创建 T 形元素（水平横杠 + 垂直竖线）
   * @param isTop true = T（竖线向下），false = ⊥（竖线向上）
   */
  function createTShape(isTop: boolean): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "ibeam-t";
    wrapper.style.position = "absolute";
    wrapper.style.left = "50%";
    wrapper.style.pointerEvents = "none";
    wrapper.style.zIndex = "101";

    // 横杠
    const bar = document.createElement("div");
    bar.style.position = "absolute";
    bar.style.left = "50%";
    bar.style.transform = "translateX(-50%)";
    bar.style.width = `${SERIF_W}px`;
    bar.style.height = `${SERIF_H}px`;
    bar.style.background = ACCENT_COLOR;
    bar.style.borderRadius = "1.5px";
    bar.style.boxShadow = `0 0 4px ${ACCENT_SHADOW}`;

    // 竖线
    const stem = document.createElement("div");
    stem.style.position = "absolute";
    stem.style.left = "50%";
    stem.style.transform = "translateX(-50%)";
    stem.style.width = `${STEM_W}px`;
    stem.style.height = `${STEM_H}px`;
    stem.style.background = ACCENT_COLOR;
    stem.style.borderRadius = "1px";

    if (isTop) {
      // T 形：横杠在上，竖线向下延伸
      bar.style.top = "0";
      stem.style.top = `${SERIF_H}px`;
    } else {
      // ⊥ 形：横杠在下，竖线向上延伸
      bar.style.bottom = "0";
      stem.style.bottom = `${SERIF_H}px`;
    }

    wrapper.appendChild(bar);
    wrapper.appendChild(stem);
    return wrapper;
  }

  const tTop = createTShape(true);
  const tBottom = createTShape(false);

  // T 顶部锚定在父级 top:0
  tTop.style.top = "0";
  tTop.style.transformOrigin = "center top";
  // ⊥ 底部锚定在父级 bottom:0
  tBottom.style.bottom = "0";
  tBottom.style.transformOrigin = "center bottom";

  beatCursor.appendChild(tTop);
  beatCursor.appendChild(tBottom);

  /**
   * 从 beatCursor 的 inline transform 中提取 scale(sX, sY) 并设置反向缩放。
   *
   * beat cursor 的 top:0 = 小节最顶部 (realBounds.y)。
   * T 固定在 top:0（和弦图谱上方），竖线缩短到 6px 以避免遮挡和弦名称。
   */
  function syncCounterScale() {
    const t = (beatCursor as HTMLElement).style.transform;
    const m = t.match(/scale\(\s*([\d.e+-]+)\s*,\s*([\d.e+-]+)\s*\)/);
    if (!m) return;
    const sX = parseFloat(m[1]);
    const sY = parseFloat(m[2]);
    if (!sX || !sY) return;
    // 反向缩放 + 水平居中
    const counter = `translateX(-50%) scale(${1 / sX}, ${1 / sY})`;
    tTop.style.transform = counter;
    tBottom.style.transform = counter;
    // T 固定在 top:0（小节最顶部，和弦图谱上方）
    tTop.style.top = "0";
  }

  // 监听 beatCursor style 属性变化
  const observer = new MutationObserver(syncCounterScale);
  observer.observe(beatCursor, {
    attributes: true,
    attributeFilter: ["style"],
  });

  // 初始同步
  syncCounterScale();

  return () => {
    observer.disconnect();
    tTop.remove();
    tBottom.remove();
  };
}

// ─── Main ───────────────────────────────────────────────

export default function GuitarProViewer({
  isOpen,
  fileUrl,
  fileName,
  onClose,
  originRect,
}: GuitarProViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const ibeamCleanupRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── clip-path 展开/折叠动画 ──
  // 计算从 originRect 到全屏的 inset 值
  const getClipInset = useCallback(() => {
    if (!originRect) return "inset(0 0 0 0)";
    const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
    const top = originRect.top;
    const right = vw - originRect.left - originRect.width;
    const bottom = vh - originRect.top - originRect.height;
    const left = originRect.left;
    return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
  }, [originRect]);

  type ViewerState = "entering" | "open" | "exiting";
  const [viewerState, setViewerState] = useState<ViewerState>("entering");

  // ── 锁定 body 滚动，防止查看器打开期间页面漂移 ──
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const origOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = origOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const el = rootRef.current;
    if (!el) return;
    // 设置初始 clip-path (卡片位置)
    el.style.clipPath = getClipInset();
    // 下一帧展开到全屏
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.clipPath = "inset(0 0 0 0)";
        setViewerState("open");
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, getClipInset]);

  const handleClose = useCallback(() => {
    const el = rootRef.current;
    if (el) {
      el.style.clipPath = getClipInset();
    }
    setViewerState("exiting");
    setTimeout(() => onClose(), 370);
  }, [onClose, getClipInset]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  // ── 基础状态 ──
  const [isLoading, setIsLoading] = useState(true);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── 播放控制 ──
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(DEFAULT_MASTER_VOLUME);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);

  // ── 显示 ──
  const [displayMode, setDisplayMode] = useState<DisplayMode>("default");
  const [scale, setScale] = useState(1.0);
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── 轨道 ──
  const [tracks, setTracks] = useState<Array<TrackState>>([]);
  const [showTrackPanel, setShowTrackPanel] = useState(false);

  // ── 内嵌伴奏轨（独立于 MIDI 播放）──
  const [hasBackingTrack, setHasBackingTrack] = useState(false);
  const backingTrackRef = useRef<HTMLAudioElement | null>(null);
  const [backingTrackUrl, setBackingTrackUrl] = useState<string | null>(null);
  const [backingTrackMuted, setBackingTrackMuted] = useState(false);
  const [backingTrackVolume, setBackingTrackVolume] = useState(1.0);
  const [midiEnabled, setMidiEnabled] = useState(true);

  // ── 用户伴奏音频轨 ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [audioTrackUrl, setAudioTrackUrl] = useState<string | null>(null);
  const [audioTrackName, setAudioTrackName] = useState<string>("");
  const [audioVolume, setAudioVolume] = useState(1.0);
  const [audioMuted, setAudioMuted] = useState(false);

  // ── 段落进度（rehearsal marks）──
  const [sections, setSections] = useState<Array<{ name: string; barIndex: number; startTick: number; endTick: number }>>([]); 
  const [currentTick, setCurrentTick] = useState(0);
  const [endTick, setEndTick] = useState(0);

  // ── 内嵌伴奏同步点（synthTime → syncTime 映射）──
  const syncPointsRef = useRef<Array<{ synthTime: number; syncTime: number }>>([]);

  const prevVolumeRef = useRef(DEFAULT_MASTER_VOLUME);

  // ────────────────────────────────────────────────────
  // 初始化 alphaTab
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    setIsLoading(true);
    setLoadError(null);
    setIsPlayerReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setTotalTime(0);

    const api = new AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: "/font/",
        engine: "svg",
        logLevel: 1,
        enableLazyLoading: true,
        useWorkers: false, // 主线程渲染，使歌词位置 monkey-patch 生效
      },
      display: {
        scale: 1.0,
        layoutMode: 0, // Page
        staveProfile: 0, // Default — 尊重 GP 文件中每个轨道的谱面设置（吉他→TAB，声乐→简谱+歌词）
        padding: [40, 40, 40, 40],
        lyricLinesPaddingBetween: 8, // 多行歌词间距
      },
      player: {
        playerMode: PlayerMode.EnabledAutomatic,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableElementHighlighting: true,
        enableUserInteraction: true,
        soundFont: "/soundfont/sonivox.sf2",
        scrollMode: 1, // Continuous
        scrollSpeed: 300,
        scrollElement: scrollContainerRef.current ?? undefined,
      },
      notation: {
        notationMode: 0, // GuitarPro
      },
      importer: {
        beatTextAsLyrics: true, // 将拍文本解析为歌词（GP3-5）
      },
    });

    // 提高默认音量
    api.masterVolume = DEFAULT_MASTER_VOLUME;

    apiRef.current = api;
    const unsubs: Array<() => void> = [];

    // 乐谱信息
    unsubs.push(
      api.scoreLoaded.on(
        (score: {
          title?: string;
          artist?: string;
          tracks: Array<{ name: string; playbackInfo?: { primaryChannel: number; program: number } }>;
          backingTrack?: { rawAudioFile?: Uint8Array };
          masterBars: Array<{
            index: number;
            isSectionStart: boolean;
            section?: { marker: string; text: string } | null;
          }>;
        }) => {
          setSongTitle(score.title || fileName);
          setSongArtist(score.artist || "");

          // 根据轨道名称覆盖 MIDI Program（在 MIDI 合成之前执行）
          for (const track of score.tracks) {
            const inferred = inferMidiProgram(track.name);
            if (inferred !== null && track.playbackInfo) {
              const orig = track.playbackInfo.program;
              if (orig !== inferred) {
                track.playbackInfo.program = inferred;
                console.log(
                  JSON.stringify({
                    message: "MIDI program overridden",
                    track: track.name,
                    from: orig,
                    to: inferred,
                  }),
                );
              }
            }
          }

          // 检测内嵌伴奏音轨（GP7/8 文件可能嵌入录音伴奏）
          const rawAudio = score.backingTrack?.rawAudioFile;
          const hasBacking = !!(rawAudio?.length);
          setHasBackingTrack(hasBacking);

          // 提取嵌入音频 → 独立 Audio 元素播放
          if (hasBacking && rawAudio) {
            const blob = new Blob([rawAudio], { type: "audio/ogg" });
            const url = URL.createObjectURL(blob);
            if (backingTrackUrl) URL.revokeObjectURL(backingTrackUrl);
            setBackingTrackUrl(url);
            const audio = new Audio(url);
            audio.volume = backingTrackVolume;
            audio.muted = backingTrackMuted;
            audio.load();
            backingTrackRef.current = audio;

            // 强制 MIDI 合成（不走内嵌伴奏模式，我们自己管理伴奏音频）
            api.settings.player.playerMode = PlayerMode.EnabledSynthesizer;
            // 注意：延后 updateSettings()，在 scoreLoaded 结尾统一执行

            // 提取同步点（synthTime ↔ syncTime 映射）
            try {
              const pts = midi.MidiFileGenerator.generateSyncPoints(
                score as unknown as Parameters<typeof midi.MidiFileGenerator.generateSyncPoints>[0],
              );
              if (pts && pts.length > 0) {
                syncPointsRef.current = pts
                  .filter((p) => p.synthTime >= 0 && p.syncTime >= 0)
                  .sort((a, b) => a.synthTime - b.synthTime)
                  .map((p) => ({ synthTime: p.synthTime, syncTime: p.syncTime }));
                console.log(
                  JSON.stringify({
                    message: "sync points loaded",
                    count: syncPointsRef.current.length,
                    first: syncPointsRef.current[0],
                    last: syncPointsRef.current[syncPointsRef.current.length - 1],
                  }),
                );
              } else {
                syncPointsRef.current = [];
              }
            } catch (e) {
              console.warn(
                JSON.stringify({
                  message: "sync points generation failed, falling back to linear sync",
                  error: String(e),
                }),
              );
              syncPointsRef.current = [];
            }
          } else {
            syncPointsRef.current = [];
          }

          setTracks(
            score.tracks.map((t, i) => ({
              index: i,
              name: t.name || `轨道 ${i + 1}`,
              isSelected: true,
              isMuted: false,
              isSolo: false,
              volume: 16,
            })),
          );

          // 确保所有轨道都被渲染（tracks: [-1] 不一定可靠）
          console.log(
            JSON.stringify({
              message: "score tracks loaded",
              count: score.tracks.length,
              names: score.tracks.map((t) => t.name),
            }),
          );

          // 延迟到下一帧：先应用设置变更（如 playerMode），再显式渲染全部轨道
          requestAnimationFrame(() => {
            if (api.score) {
              // 设置 core.tracks 为全部轨道索引（避免 -1 在某些版本不可靠）
              api.settings.core.tracks = api.score.tracks.map((_: unknown, i: number) => i);
              api.updateSettings();
              const allTracks = [...api.score.tracks];
              console.log(
                JSON.stringify({
                  message: "renderTracks all",
                  count: allTracks.length,
                  names: allTracks.map((t: { name: string }) => t.name),
                }),
              );
              api.renderTracks(allTracks);
            }
          });

          // 解析段落标记（Intro / Verse / Chorus 等）
          const sectionList: Array<{ name: string; barIndex: number; startTick: number; endTick: number }> = [];
          for (const mb of score.masterBars) {
            if (mb.isSectionStart && mb.section) {
              sectionList.push({
                name: mb.section.marker || mb.section.text || `Section`,
                barIndex: mb.index,
                startTick: 0, // 稍后用 tickCache 填充
                endTick: 0,
              });
            }
          }
          setSections(sectionList);
        },
      ),
    );

    unsubs.push(
      api.renderFinished.on(() => {
        setIsLoading(false);
        // 初始化 I-beam 叠加层（需在 DOM 渲染完成后）
        if (containerRef.current) {
          // 清理之前的叠加层（缩放/模式切换会触发重新渲染）
          if (ibeamCleanupRef.current) ibeamCleanupRef.current();

          ibeamCleanupRef.current =
            setupIBeamOverlay(containerRef.current) ?? null;
        }
      }),
    );
    unsubs.push(
      api.playerReady.on(() => {
        setIsPlayerReady(true);
        // 注入混响 + 压缩器效果链
        setupAudioEffects(api);

        // 用 tickCache 填充段落的 tick 区间
        const tc = api.tickCache;
        if (tc && api.score) {
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const totalMasterBars = api.score!.masterBars;
            return prev.map((sec, i) => {
              const mb = totalMasterBars[sec.barIndex];
              if (!mb) return sec;
              const lookup = tc.getMasterBar(mb);
              const startTick = lookup?.start ?? 0;
              // endTick = start of next section, or end of song
              const nextSec = prev[i + 1];
              let eTick = tc.masterBars[tc.masterBars.length - 1]?.end ?? 0;
              if (nextSec) {
                const nextMb = totalMasterBars[nextSec.barIndex];
                if (nextMb) {
                  const nextLookup = tc.getMasterBar(nextMb);
                  eTick = nextLookup?.start ?? eTick;
                }
              }
              return { ...sec, startTick, endTick: eTick };
            });
          });
          // Also set endTick for overall progress
          const lastMb = tc.masterBars[tc.masterBars.length - 1];
          if (lastMb) setEndTick(lastMb.end);
        }
      }),
    );
    unsubs.push(
      api.playerStateChanged.on((args: { state: number }) => {
        const playing = args.state === 1;
        setIsPlaying(playing);
        // 同步用户伴奏音频
        if (audioRef.current) {
          if (playing) audioRef.current.play().catch(() => {});
          else audioRef.current.pause();
        }
        // 同步内嵌伴奏音频
        if (backingTrackRef.current) {
          if (playing) backingTrackRef.current.play().catch(() => {});
          else backingTrackRef.current.pause();
        }
      }),
    );
    unsubs.push(
      api.playerPositionChanged.on(
        (args: { currentTime: number; endTime: number; currentTick: number; endTick: number }) => {
          setCurrentTime(args.currentTime);
          setTotalTime(args.endTime);
          setCurrentTick(args.currentTick);
          if (args.endTick > 0) setEndTick(args.endTick);

          // 同步用户伴奏音频位置（偏差 >500ms 时校正）
          if (audioRef.current && !audioRef.current.paused) {
            const audioMs = audioRef.current.currentTime * 1000;
            if (Math.abs(audioMs - args.currentTime) > 500) {
              audioRef.current.currentTime = args.currentTime / 1000;
            }
          }
          // 同步内嵌伴奏音频位置（使用同步点插值映射 synthTime → syncTime）
          if (backingTrackRef.current && !backingTrackRef.current.paused) {
            const targetAudioMs = synthTimeToAudioTime(
              args.currentTime,
              syncPointsRef.current,
            );
            const audioMs = backingTrackRef.current.currentTime * 1000;
            if (Math.abs(audioMs - targetAudioMs) > 500) {
              backingTrackRef.current.currentTime = targetAudioMs / 1000;
            }
          }
        },
      ),
    );
    unsubs.push(
      api.error.on((error: unknown) => {
        console.error(
          JSON.stringify({ message: "alphaTab error", error: String(error) }),
        );
        setLoadError("无法加载乐谱文件");
        setIsLoading(false);
      }),
    );

    // 通过 fetch 获取二进制数据再传给 alphaTab
    let cancelled = false;
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) api.load(new Uint8Array(buffer));
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(
            JSON.stringify({
              message: "guitar pro file fetch failed",
              url: fileUrl,
              error: String(err),
            }),
          );
          setLoadError("无法下载乐谱文件");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
      if (ibeamCleanupRef.current) {
        ibeamCleanupRef.current();
        ibeamCleanupRef.current = null;
      }
      api.destroy();
      apiRef.current = null;
      // 停止伴奏音频
      if (audioRef.current) {
        audioRef.current.pause();
      }
      // 停止 & 释放内嵌伴奏音频
      if (backingTrackRef.current) {
        backingTrackRef.current.pause();
        backingTrackRef.current = null;
      }
      // backingTrackUrl 的清理由 React state 管理（组件卸载时释放）
    };
  }, [isOpen, fileUrl, fileName]);

  // ────────────────────────────────────────────────────
  // 快捷键: Space 播放/暂停, Esc 关闭
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " " && isPlayerReady) {
        e.preventDefault();
        apiRef.current?.playPause();
      } else if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, isPlayerReady, handleClose]);

  // ────────────────────────────────────────────────────
  // 操作回调
  // ────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => apiRef.current?.playPause(), []);
  const handleStop = useCallback(() => {
    apiRef.current?.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (backingTrackRef.current) {
      backingTrackRef.current.pause();
      // 使用同步点映射确定音频起始位置
      const startAudioMs = synthTimeToAudioTime(0, syncPointsRef.current);
      backingTrackRef.current.currentTime = startAudioMs / 1000;
    }
  }, []);

  // 速度
  const handleSpeedChange = useCallback((s: number) => {
    if (!apiRef.current) return;
    apiRef.current.playbackSpeed = s;
    if (audioRef.current) audioRef.current.playbackRate = s;
    if (backingTrackRef.current) backingTrackRef.current.playbackRate = s;
    setSpeed(s);
  }, []);

  // 主音量
  const handleVolumeChange = useCallback((v: number) => {
    if (!apiRef.current) return;
    // 只有 MIDI 启用时才设置给 alphaTab
    if (midiEnabled) apiRef.current.masterVolume = v;
    setVolume(v);
    setIsMuted(v === 0);
    if (v > 0) prevVolumeRef.current = v;
  }, [midiEnabled]);

  const handleToggleMute = useCallback(() => {
    if (!apiRef.current) return;
    if (isMuted) {
      const restore = prevVolumeRef.current || DEFAULT_MASTER_VOLUME;
      apiRef.current.masterVolume = restore;
      setVolume(restore);
      setIsMuted(false);
    } else {
      prevVolumeRef.current = volume;
      apiRef.current.masterVolume = 0;
      setVolume(0);
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // 循环
  const handleToggleLoop = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.isLooping = !isLooping;
    setIsLooping(!isLooping);
  }, [isLooping]);

  // 节拍预备
  const handleToggleCountIn = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.countInVolume = countInEnabled ? 0 : 1;
    setCountInEnabled(!countInEnabled);
  }, [countInEnabled]);

  // 节拍器
  const handleToggleMetronome = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.metronomeVolume = metronomeEnabled ? 0 : 1;
    setMetronomeEnabled(!metronomeEnabled);
  }, [metronomeEnabled]);

  // 进度跳转
  const handleSeek = useCallback(
    (val: number) => {
      if (apiRef.current && totalTime > 0) {
        const ms = (val / 100) * totalTime;
        apiRef.current.timePosition = ms;
        if (audioRef.current) audioRef.current.currentTime = ms / 1000;
        if (backingTrackRef.current) {
          const targetMs = synthTimeToAudioTime(ms, syncPointsRef.current);
          backingTrackRef.current.currentTime = targetMs / 1000;
        }
      }
    },
    [totalTime],
  );

  // 显示模式
  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    if (!apiRef.current?.score) return;
    const cfg = DISPLAY_MODES.find((d) => d.value === mode);
    if (!cfg) return;
    apiRef.current.settings.display.staveProfile = cfg.profile;
    apiRef.current.updateSettings();
    // 使用 renderTracks 而非 render()，确保保持当前选中的轨道
    const selected = tracks
      .filter((t) => t.isSelected)
      .map((t) => apiRef.current!.score!.tracks[t.index]);
    if (selected.length > 0) {
      apiRef.current.renderTracks(selected);
    } else {
      apiRef.current.render();
    }
    setDisplayMode(mode);
    setShowDisplayMenu(false);
  }, [tracks]);

  // 缩放
  const handleZoomIn = useCallback(() => {
    const idx = ZOOM_STEPS.findIndex((z) => z > scale);
    if (idx < 0) return;
    const next = ZOOM_STEPS[idx];
    if (apiRef.current) {
      apiRef.current.settings.display.scale = next;
      apiRef.current.updateSettings();
      apiRef.current.render();
    }
    setScale(next);
  }, [scale]);

  const handleZoomOut = useCallback(() => {
    const reversed = [...ZOOM_STEPS].reverse();
    const idx = reversed.findIndex((z) => z < scale);
    if (idx < 0) return;
    const next = reversed[idx];
    if (apiRef.current) {
      apiRef.current.settings.display.scale = next;
      apiRef.current.updateSettings();
      apiRef.current.render();
    }
    setScale(next);
  }, [scale]);

  // 打印 / 导出 PDF
  const handlePrint = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.print();
  }, []);

  // 轨道 — 渲染可见性 + 播放静音
  const handleTrackToggle = useCallback(
    (trackIndex: number) => {
      if (!apiRef.current?.score) return;
      const updated = tracks.map((t) =>
        t.index === trackIndex ? { ...t, isSelected: !t.isSelected } : t,
      );
      if (updated.every((t) => !t.isSelected)) return;
      setTracks(updated);

      // 更新渲染（只显示选中的轨道）
      const selected = updated
        .filter((t) => t.isSelected)
        .map((t) => apiRef.current!.score!.tracks[t.index]);
      apiRef.current.renderTracks(selected);

      // 更新播放：取消选中的轨道静音，选中的轨道取消静音
      const toggled = updated.find((t) => t.index === trackIndex)!;
      const track = apiRef.current.score.tracks[trackIndex];
      if (!toggled.isSelected) {
        // 取消选中 → 静音该轨道
        apiRef.current.changeTrackMute([track], true);
      } else if (!toggled.isMuted) {
        // 重新选中 → 取消静音（除非用户手动设了静音）
        apiRef.current.changeTrackMute([track], false);
      }
    },
    [tracks],
  );

  // 轨道 — 静音
  const handleTrackMute = useCallback(
    (trackIndex: number) => {
      if (!apiRef.current?.score) return;
      const cur = tracks.find((t) => t.index === trackIndex);
      if (!cur) return;
      const newMuted = !cur.isMuted;
      const track = apiRef.current.score.tracks[trackIndex];
      apiRef.current.changeTrackMute([track], newMuted);
      setTracks((prev) =>
        prev.map((t) =>
          t.index === trackIndex ? { ...t, isMuted: newMuted } : t,
        ),
      );
    },
    [tracks],
  );

  // 轨道 — 独奏
  const handleTrackSolo = useCallback(
    (trackIndex: number) => {
      if (!apiRef.current?.score) return;
      const cur = tracks.find((t) => t.index === trackIndex);
      if (!cur) return;
      const newSolo = !cur.isSolo;
      const track = apiRef.current.score.tracks[trackIndex];
      apiRef.current.changeTrackSolo([track], newSolo);
      setTracks((prev) =>
        prev.map((t) =>
          t.index === trackIndex ? { ...t, isSolo: newSolo } : t,
        ),
      );
    },
    [tracks],
  );

  // 轨道 — 音量
  const handleTrackVolume = useCallback(
    (trackIndex: number, newVol: number) => {
      if (!apiRef.current?.score) return;
      const track = apiRef.current.score.tracks[trackIndex];
      apiRef.current.changeTrackVolume([track], newVol);
      setTracks((prev) =>
        prev.map((t) =>
          t.index === trackIndex ? { ...t, volume: newVol } : t,
        ),
      );
    },
    [],
  );

  // ── MIDI / 内嵌伴奏独立控制 ──

  /** 切换 MIDI 合成（通过 masterVolume 控制） */
  const handleToggleMidi = useCallback(() => {
    if (!apiRef.current) return;
    const nextEnabled = !midiEnabled;
    setMidiEnabled(nextEnabled);
    if (nextEnabled) {
      apiRef.current.masterVolume = volume;
    } else {
      apiRef.current.masterVolume = 0;
    }
  }, [midiEnabled, volume]);

  /** 切换内嵌伴奏播放 */
  const handleToggleBackingTrack = useCallback(() => {
    const next = !backingTrackMuted;
    setBackingTrackMuted(next);
    if (backingTrackRef.current) {
      backingTrackRef.current.muted = next;
    }
  }, [backingTrackMuted]);

  /** 调节内嵌伴奏音量 */
  const handleBackingTrackVolume = useCallback((v: number) => {
    setBackingTrackVolume(v);
    setBackingTrackMuted(v === 0);
    if (backingTrackRef.current) {
      backingTrackRef.current.volume = Math.min(v, 1);
      backingTrackRef.current.muted = v === 0;
    }
  }, []);

  // ── 伴奏音频轨道 ──

  /** 加载本地音频文件作为伴奏 */
  const handleLoadAudioTrack = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // 释放之前的 URL
      if (audioTrackUrl) URL.revokeObjectURL(audioTrackUrl);
      const url = URL.createObjectURL(file);
      setAudioTrackUrl(url);
      setAudioTrackName(file.name);

      // 创建或复用 audio 元素
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = url;
      audioRef.current.volume = audioVolume;
      audioRef.current.muted = audioMuted;
      audioRef.current.load();

      // 如果正在播放，同步开始
      if (isPlaying && apiRef.current) {
        audioRef.current.currentTime = currentTime / 1000;
        audioRef.current.play().catch(() => {});
      }

      // 清理 input
      if (audioInputRef.current) audioInputRef.current.value = "";
    },
    [audioTrackUrl, audioVolume, audioMuted, isPlaying, currentTime],
  );

  /** 移除伴奏音轨 */
  const handleRemoveAudioTrack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (audioTrackUrl) URL.revokeObjectURL(audioTrackUrl);
    setAudioTrackUrl(null);
    setAudioTrackName("");
  }, [audioTrackUrl]);

  /** 调节伴奏音量 */
  const handleAudioVolumeChange = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = Math.min(v, 1);
    setAudioVolume(v);
    setAudioMuted(v === 0);
  }, []);

  /** 伴奏静音 */
  const handleToggleAudioMute = useCallback(() => {
    if (audioRef.current) audioRef.current.muted = !audioMuted;
    setAudioMuted(!audioMuted);
  }, [audioMuted]);

  // ── 派生值 ──
  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;
  const currentDisplayLabel =
    DISPLAY_MODES.find((d) => d.value === displayMode)?.label ?? "";
  const VolumeIcon =
    isMuted || volume === 0
      ? VolumeX
      : volume < MAX_MASTER_VOLUME * 0.3
        ? Volume1
        : Volume2;

  // 当前段落索引
  const currentSectionIndex = useMemo(() => {
    if (sections.length === 0 || endTick === 0) return -1;
    for (let i = sections.length - 1; i >= 0; i--) {
      if (currentTick >= sections[i].startTick) return i;
    }
    return -1;
  }, [sections, currentTick, endTick]);

  // 点击段落跳转
  const handleSectionClick = useCallback(
    (sectionIndex: number) => {
      if (!apiRef.current || !apiRef.current.score) return;
      const sec = sections[sectionIndex];
      if (!sec) return;
      const mb = apiRef.current.score.masterBars[sec.barIndex];
      if (!mb) return;
      const tc = apiRef.current.tickCache;
      if (!tc) return;
      const lookup = tc.getMasterBar(mb);
      if (!lookup) return;
      apiRef.current.tickPosition = lookup.start;
      // 同步音频
      if (audioRef.current) {
        const ratio = lookup.start / (endTick || 1);
        audioRef.current.currentTime = ratio * (totalTime / 1000);
      }
      if (backingTrackRef.current) {
        const ratio = lookup.start / (endTick || 1);
        backingTrackRef.current.currentTime = ratio * (totalTime / 1000);
      }
    },
    [sections, endTick, totalTime],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] gp-viewer-root overflow-hidden"
      data-state={viewerState}
    >
      {/* 注入拍光标样式 */}
      <style>{ALPHATAB_CURSOR_STYLES}</style>

      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 gp-viewer-backdrop"
        onClick={handleClose}
      />

      {/* 查看器面板 */}
      <div
        className={`gp-viewer-panel absolute flex flex-col bg-background overflow-hidden ${
          isFullscreen
            ? "inset-0"
            : "top-[4%] left-[8%] right-[8%] bottom-[4%] rounded-2xl shadow-2xl"
        }`}
      >
        {/* ════════════════════════════════════════════════
          顶部工具栏
          ════════════════════════════════════════════════ */}
        <div className="h-12 border-b border-border/20 flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur-sm gp-viewer-content">
          {/* 左：曲目信息 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10">
              <Music size={14} className="text-accent" />
            </div>
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="text-sm font-medium truncate max-w-[280px]">
                {songTitle || fileName}
              </span>
              {songArtist && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:inline">
                  {songArtist}
                </span>
              )}
            </div>
          </div>

          {/* 右：显示控制 */}
          <div className="flex items-center gap-0.5">
            {/* 谱面模式 */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisplayMenu((v) => !v)}
                className="rounded-lg h-8 gap-1 text-xs uppercase tracking-wider font-mono px-2.5"
              >
                <span className="hidden sm:inline">{currentDisplayLabel}</span>
                <span className="sm:hidden">谱面</span>
                <ChevronDown size={10} />
              </Button>
              {showDisplayMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowDisplayMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-background border border-border rounded-lg shadow-lg min-w-[130px] overflow-hidden">
                    {DISPLAY_MODES.map((m) => (
                      <button
                        key={m.value}
                        className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                          displayMode === m.value
                            ? "text-foreground bg-accent/5"
                            : "text-muted-foreground hover:bg-accent/5"
                        }`}
                        onClick={() => handleDisplayModeChange(m.value)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 缩放 */}
            <div className="hidden sm:flex items-center border-l border-border/20 ml-1 pl-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={scale <= ZOOM_STEPS[0]}
                className="rounded-lg h-7 w-7"
                title="缩小"
              >
                <ZoomOut size={12} />
              </Button>
              <button
                className="text-xs font-mono w-10 text-center tabular-nums text-muted-foreground select-none hover:text-foreground transition-colors"
                onClick={() => {
                  // 重置为 100%
                  if (apiRef.current) {
                    apiRef.current.settings.display.scale = 1.0;
                    apiRef.current.updateSettings();
                    apiRef.current.render();
                  }
                  setScale(1.0);
                }}
                title="重置缩放"
              >
                {Math.round(scale * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                className="rounded-lg h-7 w-7"
                title="放大"
              >
                <ZoomIn size={12} />
              </Button>
            </div>

            {/* 全屏切换 + 打印 + 关闭 */}
            <div className="border-l border-border/20 ml-1 pl-1 flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrint}
                disabled={isLoading}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
                title="打印 / 导出 PDF"
              >
                <Printer size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFullscreen}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
                title={isFullscreen ? "退出全屏" : "全屏"}
              >
                {isFullscreen ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="关闭 (Esc)"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
          乐谱渲染区域
          ════════════════════════════════════════════════ */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 relative overflow-auto custom-scrollbar gp-viewer-content"
        >
          {/* 加载中 */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-5">
                {/* 音符形态的加载动画 */}
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <Music
                    size={20}
                    className="text-accent/60"
                    style={{ animation: "breathe 2s ease-in-out infinite" }}
                  />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-accent/15"
                    style={{ animation: "pulse-ring 2s cubic-bezier(0.45, 0, 0.55, 1) infinite" }}
                  />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="loading-bars">
                    <span /><span /><span /><span />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    解析乐谱中...
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 错误 */}
          {loadError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4 text-center">
                <Music
                  size={48}
                  strokeWidth={1}
                  className="text-muted-foreground opacity-30"
                />
                <p className="text-sm font-mono text-muted-foreground">
                  {loadError}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  className="rounded-lg font-mono text-xs"
                >
                  关闭
                </Button>
              </div>
            </div>
          )}

          {/* alphaTab 渲染容器 */}
          <div
            ref={containerRef}
            className="w-full min-h-full"
            style={{ position: "relative" }}
          />
        </div>

        {/* ════════════════════════════════════════════════
          轨道面板（浮动在底栏上方）
          ════════════════════════════════════════════════ */}
        {showTrackPanel && (
          <>
            <div
              className="absolute inset-0 z-[201]"
              onClick={() => setShowTrackPanel(false)}
            />
            <div className={`absolute ${sections.length > 0 ? 'bottom-[5.25rem]' : 'bottom-14'} right-3 z-[202] w-[340px] max-h-80 overflow-y-auto bg-background border border-border rounded-xl shadow-xl`}>
              <div className="px-3 py-2.5 border-b border-border/30">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  轨道管理
                </span>
              </div>

              {/* ── MIDI 轨道 ── */}
              <div className="px-3 py-2 border-b border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Activity size={12} className="text-accent" />
                    <span className="text-xs font-mono font-medium">MIDI 合成</span>
                  </div>
                  <button
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded transition-colors ${
                      midiEnabled
                        ? "text-accent bg-accent/10"
                        : "text-red-500 bg-red-500/10"
                    }`}
                    onClick={handleToggleMidi}
                  >
                    {midiEnabled ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="space-y-0.5">
                  {tracks.map((track) => (
                    <div
                      key={track.index}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/5 transition-colors"
                    >
                      <button
                        className={`shrink-0 w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                          track.isSelected
                            ? "bg-foreground border-foreground"
                            : "border-muted-foreground/40"
                        }`}
                        onClick={() => handleTrackToggle(track.index)}
                        title="显示 / 隐藏"
                      >
                        {track.isSelected && (
                          <span className="text-background text-[9px] leading-none">✓</span>
                        )}
                      </button>
                      <span className="flex-1 text-[13px] font-mono truncate min-w-0">
                        {track.name}
                      </span>
                      <button
                        className={`shrink-0 text-[11px] font-mono font-bold w-6 h-6 rounded flex items-center justify-center transition-colors ${
                          track.isSolo
                            ? "text-amber-500 bg-amber-500/10"
                            : "text-muted-foreground/40 hover:text-muted-foreground"
                        }`}
                        onClick={() => handleTrackSolo(track.index)}
                        title="独奏"
                      >
                        S
                      </button>
                      <button
                        className={`shrink-0 text-[11px] font-mono font-bold w-6 h-6 rounded flex items-center justify-center transition-colors ${
                          track.isMuted
                            ? "text-red-500 bg-red-500/10"
                            : "text-muted-foreground/40 hover:text-muted-foreground"
                        }`}
                        onClick={() => handleTrackMute(track.index)}
                        title="静音"
                      >
                        M
                      </button>
                      <div className="shrink-0 w-16">
                        <SliderTrack
                          value={track.volume}
                          max={16}
                          onChange={(v) => handleTrackVolume(track.index, v)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 内嵌伴奏音轨（独立于 MIDI） ── */}
              {hasBackingTrack && (
                <div className="px-3 py-2 border-b border-border/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Mic size={12} className="text-purple-500" />
                      <span className="text-xs font-mono font-medium">内嵌音轨</span>
                      <span className="text-[11px] text-muted-foreground/60">（人声/伴奏）</span>
                    </div>
                    <button
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded transition-colors ${
                        !backingTrackMuted
                          ? "text-purple-500 bg-purple-500/10"
                          : "text-red-500 bg-red-500/10"
                      }`}
                      onClick={handleToggleBackingTrack}
                    >
                      {!backingTrackMuted ? "ON" : "OFF"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-2">
                    <Volume2 size={12} className="shrink-0 text-muted-foreground/60" />
                    <div className="flex-1">
                      <SliderTrack
                        value={backingTrackVolume}
                        max={1}
                        onChange={handleBackingTrackVolume}
                      />
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-8 text-right">
                      {Math.round(backingTrackVolume * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* ── 用户伴奏音频轨 ── */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    外部伴奏
                  </span>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleLoadAudioTrack}
                  />
                  <button
                    className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => audioInputRef.current?.click()}
                  >
                    <Upload size={11} />
                    添加
                  </button>
                </div>

                {audioTrackUrl ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-accent/5 rounded">
                    <Mic size={13} className="shrink-0 text-purple-500" />
                    <span className="flex-1 text-[13px] font-mono truncate min-w-0">
                      {audioTrackName}
                    </span>
                    <button
                      className={`shrink-0 text-[11px] font-mono font-bold w-6 h-6 rounded flex items-center justify-center transition-colors ${
                        audioMuted
                          ? "text-red-500 bg-red-500/10"
                          : "text-muted-foreground/40 hover:text-muted-foreground"
                      }`}
                      onClick={handleToggleAudioMute}
                      title="静音伴奏"
                    >
                      M
                    </button>
                    <div className="shrink-0 w-16">
                      <SliderTrack
                        value={audioVolume}
                        max={1}
                        onChange={handleAudioVolumeChange}
                      />
                    </div>
                    <button
                      className="shrink-0 text-muted-foreground/50 hover:text-red-500 transition-colors"
                      onClick={handleRemoveAudioTrack}
                      title="移除伴奏"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-muted-foreground/50 px-2 py-1.5">
                    未加载伴奏音轨 · 支持 MP3 / WAV / OGG
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════
          段落进度条（Intro / Verse / Chorus 等）
          ════════════════════════════════════════════════ */}
        {sections.length > 0 && endTick > 0 && (
          <div className="h-7 border-t border-border/10 flex items-stretch shrink-0 bg-background/90 backdrop-blur-sm gp-viewer-content overflow-x-auto">
            {sections.map((sec, i) => {
              const secStart = sec.startTick;
              const secEnd = sec.endTick;
              const secWidth = ((secEnd - secStart) / endTick) * 100;
              const isCurrent = i === currentSectionIndex;
              // Progress within this section
              let innerProgress = 0;
              if (isCurrent && secEnd > secStart) {
                innerProgress = Math.min(
                  100,
                  Math.max(0, ((currentTick - secStart) / (secEnd - secStart)) * 100),
                );
              }
              const isDone = currentTick >= secEnd;

              return (
                <button
                  key={i}
                  className={`relative flex items-center justify-center px-1 min-w-0 border-r border-border/10 last:border-r-0 transition-colors cursor-pointer hover:bg-accent/5 ${
                    isCurrent ? "text-accent" : isDone ? "text-muted-foreground/70" : "text-muted-foreground/40"
                  }`}
                  style={{ width: `${Math.max(secWidth, 3)}%` }}
                  onClick={() => handleSectionClick(i)}
                  title={`${sec.name} (Bar ${sec.barIndex + 1})`}
                >
                  {/* 已完成/进行中的进度填充 */}
                  <div
                    className={`absolute inset-0 transition-all duration-300 ${
                      isDone ? "bg-accent/8" : isCurrent ? "bg-accent/12" : ""
                    }`}
                    style={
                      isCurrent
                        ? { width: `${innerProgress}%` }
                        : isDone
                          ? { width: "100%" }
                          : undefined
                    }
                  />
                  <span className="relative z-10 text-[11px] font-mono truncate leading-none select-none">
                    {sec.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════════════════════════
          底部播放控制栏
          ════════════════════════════════════════════════ */}
        <div className="h-14 border-t border-border/20 flex items-center gap-1.5 px-3 shrink-0 bg-background/95 backdrop-blur-sm relative gp-viewer-content">
          {/* ── 播放 / 停止 ── */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            disabled={!isPlayerReady}
            className="rounded-full h-9 w-9 bg-accent/10 hover:bg-accent/20 text-accent disabled:opacity-30 transition-all"
            title={isPlaying ? "暂停 (Space)" : "播放 (Space)"}
          >
            {isPlaying ? (
              <Pause size={16} />
            ) : (
              <Play size={16} className="ml-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStop}
            disabled={!isPlayerReady}
            className="rounded-lg h-8 w-8"
            title="停止"
          >
            <Square size={13} />
          </Button>

          <div className="w-px h-5 bg-border/20 mx-0.5" />

          {/* ── 循环 / 预备 / 节拍器 ── */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleLoop}
            className={`rounded-lg h-8 w-8 transition-colors ${
              isLooping ? "text-accent bg-accent/10" : "text-muted-foreground"
            }`}
            title="循环播放"
          >
            <Repeat size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleCountIn}
            className={`rounded-lg h-8 w-8 transition-colors ${
              countInEnabled
                ? "text-accent bg-accent/10"
                : "text-muted-foreground"
            }`}
            title="节拍预备（播放前倒数）"
          >
            <Timer size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleMetronome}
            className={`rounded-lg h-8 w-8 transition-colors ${
              metronomeEnabled
                ? "text-accent bg-accent/10"
                : "text-muted-foreground"
            }`}
            title="节拍器"
          >
            <Activity size={13} />
          </Button>

          <div className="w-px h-5 bg-border/20 mx-0.5" />

          {/* ── 时间 + 进度条 ── */}
          <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0 w-12 text-right select-none">
            {formatTime(currentTime)}
          </span>

          <div className="flex-1 mx-1.5 min-w-[60px]">
            <SliderTrack
              value={progress}
              max={100}
              onChange={handleSeek}
              disabled={!isPlayerReady}
            />
          </div>

          <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0 w-12 select-none">
            {formatTime(totalTime)}
          </span>

          <div className="w-px h-5 bg-border/20 mx-0.5" />

          {/* ── 速度 ── */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const idx = SPEED_OPTIONS.indexOf(speed);
                if (idx > 0) handleSpeedChange(SPEED_OPTIONS[idx - 1]);
              }}
              disabled={speed <= SPEED_OPTIONS[0]}
              className="rounded-lg h-7 w-7"
              title="减速"
            >
              <Minus size={11} />
            </Button>
            <span className="text-xs font-mono w-9 text-center tabular-nums select-none">
              {speed}x
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const idx = SPEED_OPTIONS.indexOf(speed);
                if (idx < SPEED_OPTIONS.length - 1)
                  handleSpeedChange(SPEED_OPTIONS[idx + 1]);
              }}
              disabled={speed >= SPEED_OPTIONS[SPEED_OPTIONS.length - 1]}
              className="rounded-lg h-7 w-7"
              title="加速"
            >
              <Plus size={11} />
            </Button>
          </div>

          <div className="w-px h-5 bg-border/20 mx-0.5 hidden sm:block" />

          {/* ── 主音量 ── */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleMute}
              className="rounded-lg h-8 w-8"
              title={isMuted ? "取消静音" : "静音"}
            >
              <VolumeIcon size={14} />
            </Button>
            <div className="w-20 hidden sm:block">
              <SliderTrack
                value={volume}
                max={MAX_MASTER_VOLUME}
                onChange={handleVolumeChange}
              />
            </div>
          </div>

          {/* ── 轨道按钮 ── */}
          <div className="w-px h-5 bg-border/20 mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTrackPanel((v) => !v)}
            className={`rounded-lg h-8 gap-1 text-xs uppercase tracking-wider font-mono px-2 ${
              showTrackPanel
                ? "text-foreground bg-accent/10"
                : audioTrackUrl || hasBackingTrack
                  ? "text-purple-500"
                  : "text-muted-foreground"
            }`}
            title="轨道管理 / 伴奏音轨"
          >
            <ListMusic size={13} />
            <span className="hidden sm:inline">轨道</span>
            {(audioTrackUrl || hasBackingTrack) && (
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full shrink-0" />
            )}
          </Button>
        </div>
      </div>
      {/* end gp-viewer-panel */}
    </div>,
    document.body,
  );
}
