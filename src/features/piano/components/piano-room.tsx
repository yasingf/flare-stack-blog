import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bluetooth,
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  Download,
  HelpCircle,
  Library,
  LoaderCircle,
  Maximize2,
  Music2,
  Pause,
  Piano,
  Play,
  Repeat2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Usb,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { orpcClient } from "@/lib/orpc";
import { demoXml } from "../demo";
import {
  listLocalScores,
  readPreference,
  removeLocalScore,
  saveLocalScore,
  writePreference,
  type Annotation,
  type LibraryItem,
  type PracticeHistory,
} from "../library";
import { MidiConnection } from "../midi";
import { noteGroups, scoreFacts, type PracticeMode } from "../practice";
import {
  beatSeconds,
  currentMeasure,
  midiToXml,
  noteName,
  parseMusicXml,
  parseScore,
  tempoAt,
  type PianoScore,
} from "../score";
import { symbols } from "../symbols";
import { usePractice, type PracticeOptions } from "../use-practice";
import { PianoRoll } from "./piano-roll";
import { ScoreView } from "./score-view";

type OpenScore = { score: PianoScore; item: LibraryItem };
const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const sourceKey = (id: string) => id.replace(/^\d+\//, "");

export default function PianoRoom() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [opened, setOpened] = useState<OpenScore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cloud, setCloud] = useState<
    Awaited<ReturnType<typeof orpcClient.piano.list>>
  >([]);
  const [cloudError, setCloudError] = useState("");
  const [history, setHistory] = useState<PracticeHistory[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: session } = authClient.useSession();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    void listLocalScores()
      .then(setItems)
      .catch((e: unknown) => setError(message(e)));
    setHistory(readPreference("history", []));
  }, [opened]);
  useEffect(() => {
    let active = true;
    setCloud([]);
    setCloudError("");
    if (session?.user.id)
      void orpcClient.piano
        .list()
        .then((data) => {
          if (active) setCloud(data);
        })
        .catch((e: unknown) => {
          if (active) setCloudError(message(e));
        });
    return () => {
      active = false;
    };
  }, [session?.user.id, opened]);
  async function open(file: File, existing?: LibraryItem) {
    setBusy(true);
    setError("");
    try {
      const score = await parseScore(file);
      let item = existing;
      if (!item) {
        try {
          item = await saveLocalScore(file, score.title);
        } catch (e) {
          setError(`${message(e)} 本次仍可练习，离开前请保留原文件。`);
          item = {
            id: crypto.randomUUID(),
            title: score.title,
            fileName: file.name,
            file,
            addedAt: Date.now(),
          };
        }
      }
      setOpened({ score, item });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function openDemo() {
    const file = new File([demoXml], "晨光五指练习.musicxml", {
      type: "application/vnd.recordare.musicxml+xml",
    });
    setOpened({
      score: parseMusicXml(demoXml),
      item: {
        id: "demo-morning-v1",
        title: "晨光 · 五指练习",
        fileName: file.name,
        file,
        addedAt: 0,
      },
    });
  }
  return (
    <section className={`piano-room ${opened ? "piano-room-open" : ""}`}>
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept=".mid,.midi,.xml,.musicxml,.mxl"
        aria-label="导入钢琴谱"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void open(file);
          e.target.value = "";
        }}
      />
      {error && (
        <div className="piano-error" role="alert">
          {error}
          <button aria-label="关闭提示" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {opened ? (
        <PracticeDesk
          key={opened.item.id}
          initialScore={opened.score}
          item={opened.item}
          onBack={() => setOpened(null)}
          onImport={() => fileInput.current?.click()}
        />
      ) : (
        <>
          <header className="piano-room-heading">
            <div>
              <span className="piano-eyebrow">
                A LITTLE PRACTICE, EVERY DAY
              </span>
              <h1>
                钢琴练习室<span className="piano-title-dot">.</span>
              </h1>
              <p>一张谱，一双手。把喜欢的旋律，慢慢弹熟。</p>
            </div>
            <button
              className="piano-button primary"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Upload size={18} />
              )}
              导入曲谱
            </button>
          </header>
          <div
            className="piano-welcome"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void open(file);
            }}
          >
            <div className="piano-welcome-copy">
              <span className="piano-eyebrow">SCORE · LISTEN · PLAY</span>
              <h2>
                让每一次慢练，
                <br />
                都有迹可循。
              </h2>
              <p>
                五线谱与指法、下落的音符、等你弹对的下一拍。接上钢琴，也可以只用屏幕琴键先试一试。
              </p>
              <button className="piano-text-button" onClick={openDemo}>
                <Play size={16} /> 试弹「晨光 · 五指练习」 <span>↗</span>
              </button>
            </div>
            <div className="piano-welcome-keys" aria-hidden="true">
              <span className="piano-decor-note note-one">3</span>
              <span className="piano-decor-note note-two">1</span>
              <span className="piano-decor-note note-three">5</span>
              <div>
                {Array.from({ length: 10 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      [0, 1, 3, 4, 5, 7, 8].includes(i) ? "has-black" : ""
                    }
                  />
                ))}
              </div>
              <small>Steinway Model B · 真实钢琴采样</small>
            </div>
          </div>
          <div className="piano-library-heading">
            <h2>
              <Library size={19} /> 我的曲库
            </h2>
            <input
              className="piano-input"
              aria-label="搜索曲谱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="找一首想练的曲子…"
            />
          </div>
          <p className="piano-caption">
            支持 MIDI、MusicXML 和 MXL，单个文件不超过 4
            MB。拖入文件即可开始。本机曲谱仅保存在当前浏览器，登录后可手动保存到账号。
          </p>
          <div className="piano-library-grid">
            <button
              className="piano-score-card piano-demo-card"
              onClick={openDemo}
            >
              <span className="piano-eyebrow">入门 · 自带练习</span>
              <Music2 size={28} strokeWidth={1.2} />
              <strong>晨光 · 五指练习</strong>
              <span>8 小节 · 带指法 · C 大调</span>
              <span className="piano-card-action">开始练习 →</span>
            </button>
            {items
              .filter((item) =>
                item.title.toLowerCase().includes(search.toLowerCase()),
              )
              .sort((a, b) => b.addedAt - a.addedAt)
              .map((item) => (
                <div className="piano-score-card" key={item.id}>
                  <span className="piano-eyebrow">
                    本机曲谱 · {item.fileName.split(".").at(-1)?.toUpperCase()}
                  </span>
                  <button
                    className="piano-card-open"
                    onClick={() =>
                      void open(new File([item.file], item.fileName), item)
                    }
                    disabled={busy}
                  >
                    <Music2 size={28} strokeWidth={1.2} />
                    <strong>{item.title}</strong>
                    <span className="piano-card-action">继续练习 →</span>
                  </button>
                  <button
                    className="piano-delete"
                    aria-label={`移除本机曲谱 ${item.title}`}
                    onClick={() => {
                      void removeLocalScore(item.id)
                        .then(() => listLocalScores())
                        .then(setItems)
                        .catch((e: unknown) => setError(message(e)));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </div>
          <div className="piano-library-heading">
            <h2>
              <Cloud size={19} /> 账号曲库
            </h2>
            {!session && (
              <a className="piano-text-button" href="/login">
                登录后同步 →
              </a>
            )}
          </div>
          {cloudError && <p className="piano-error">{cloudError}</p>}
          {cloud.length ? (
            <div className="piano-cloud-list">
              {cloud
                .filter((i) =>
                  i.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((item) => (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        setBusy(true);
                        void orpcClient.piano
                          .load({ id: item.id })
                          .then((data) =>
                            open(
                              new File(
                                [
                                  Uint8Array.from(atob(data.base64), (c) =>
                                    c.charCodeAt(0),
                                  ),
                                ],
                                data.fileName,
                              ),
                            ),
                          )
                          .catch((e: unknown) => setError(message(e)))
                          .finally(() => setBusy(false));
                      }}
                      disabled={busy}
                    >
                      <Music2 size={18} />
                      <strong>{item.title}</strong>
                      <span>
                        {item.fileName.split(".").at(-1)?.toUpperCase()}
                      </span>
                    </button>
                    <button
                      aria-label={`删除账号曲谱 ${item.title}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `从账号删除「${item.title}」？本机文件会保留。`,
                          )
                        )
                          void orpcClient.piano
                            .remove({ id: item.id })
                            .then(() =>
                              setCloud((all) =>
                                all.filter((i) => i.id !== item.id),
                              ),
                            )
                            .catch((e: unknown) => setError(message(e)));
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <p className="piano-caption">
              {session
                ? "还没有账号曲谱。在练习页点击“保存到账号”，即可在其他设备上打开。"
                : "看谱、播放和 MIDI 跟弹无需登录。账号同步与 Cloudflare AI 建议仅向注册用户开放。"}
            </p>
          )}
          {history.length > 0 && (
            <div className="piano-recent">
              <h2>最近的练习</h2>
              {history.slice(0, 5).map((h) => (
                <div key={h.date}>
                  <span>{new Date(h.date).toLocaleDateString()}</span>
                  <strong>{h.title}</strong>
                  <span>
                    {h.speed}× · {h.result.correct} 个准确音 · {time(h.seconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="piano-source-credit">
            音源：
            <a
              href="https://theremin.music.uiowa.edu/MISpiano.html"
              target="_blank"
              rel="noreferrer"
            >
              University of Iowa · Steinway &amp; Sons Model B
            </a>
            ，pp / mf / ff 三层采样。
            <a
              href="/piano/steinway/LICENSE.txt"
              target="_blank"
              rel="noreferrer"
            >
              来源与授权
            </a>
          </p>
        </>
      )}
    </section>
  );
}

function annotate(
  score: PianoScore,
  annotations: Record<string, Annotation>,
): PianoScore {
  const notes = score.notes.map((n) => ({
    ...n,
    ...annotations[sourceKey(n.id)],
  }));
  if (score.format === "midi")
    return {
      ...score,
      notes,
      xml: Object.keys(annotations).length
        ? midiToXml({ ...score, notes })
        : score.xml,
    };
  if (!Object.keys(annotations).length) return score;
  const doc = new DOMParser().parseFromString(score.xml, "application/xml");
  let count = 0;
  [...doc.documentElement.children]
    .filter((e) => e.localName === "part")
    .forEach((part, pi) => {
      [...part.children]
        .filter((e) => e.localName === "measure")
        .forEach((measure, mi) => {
          [...measure.children]
            .filter(
              (e) =>
                e.localName === "note" &&
                e.querySelector("pitch") &&
                !e.querySelector("grace") &&
                Number(e.querySelector("duration")?.textContent) > 0,
            )
            .forEach((note) => {
              const a = annotations[`${pi}:${mi}:${count++}`];
              if (!a || a.finger === undefined) return;
              note.querySelectorAll("fingering").forEach((f) => f.remove());
              if (a.finger) {
                let notations = note.querySelector("notations");
                if (!notations) {
                  notations = doc.createElement("notations");
                  note.appendChild(notations);
                }
                let technical = notations.querySelector("technical");
                if (!technical) {
                  technical = doc.createElement("technical");
                  notations.appendChild(technical);
                }
                const f = doc.createElement("fingering");
                f.textContent = a.finger;
                technical.appendChild(f);
              }
            });
        });
    });
  return { ...score, notes, xml: new XMLSerializer().serializeToString(doc) };
}

function PracticeDesk({
  initialScore,
  item,
  onBack,
  onImport,
}: {
  initialScore: PianoScore;
  item: LibraryItem;
  onBack: () => void;
  onImport: () => void;
}) {
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>(
    () => readPreference(`annotations:${item.id}`, {}),
  );
  const score = useMemo(
    () => annotate(initialScore, annotations),
    [initialScore, annotations],
  );
  const [options, setOptions] = useState<PracticeOptions>({
    mode: "listen",
    hand: "both",
    speed: 1,
    loop: false,
    startMeasure: 1,
    endMeasure: score.measures.length,
    metronome: false,
    countIn: true,
    leftSound: true,
    rightSound: true,
    monitor: true,
    latency: 0,
  });
  const [view, setView] = useState<"score" | "waterfall" | "both">("both");
  const [zoom, setZoom] = useState(0.8);
  const [fingers, setFingers] = useState(true);
  const [explain, setExplain] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullKeys, setFullKeys] = useState(false);
  const [volume, setVolume] = useState(70);
  const [midiStatus, setMidiStatus] = useState("未连接 MIDI");
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    enabled: boolean;
    remaining: number;
    exhausted: boolean;
  } | null>(null);
  const [sidebar, setSidebar] = useState<"guide" | "symbols" | "results">(
    "guide",
  );
  const { data: session } = authClient.useSession();
  const practice = usePractice(score, options);
  const root = useRef<HTMLDivElement>(null);
  const midi = useRef<MidiConnection | null>(null);
  const input = useRef(practice.input);
  input.current = practice.input;
  const actions = useRef(practice);
  actions.current = practice;
  const selectedNote = score.notes.find((n) => n.id === selectedNoteId);
  const facts = useMemo(() => scoreFacts(score), [score]);
  const measureIndex = Math.max(0, currentMeasure(score, practice.beat));
  const endBeat = options.loop
    ? (score.measures[options.endMeasure]?.beat ?? score.totalBeats)
    : score.totalBeats;
  const next =
    practice.tracker.current?.next ||
    noteGroups(score, options.hand, practice.beat - 0.01, endBeat)[0];
  const totalJudged =
    practice.result.correct +
    practice.result.early +
    practice.result.late +
    practice.result.wrong +
    practice.result.missed;
  const accuracy = totalJudged
    ? Math.round((practice.result.correct * 100) / totalJudged)
    : null;
  function change(update: Partial<PracticeOptions>) {
    practice.pause();
    setOptions((old) => ({ ...old, ...update }));
  }
  useEffect(() => {
    const connection = new MidiConnection(
      (e) => input.current(e),
      setDevices,
      setMidiStatus,
    );
    midi.current = connection;
    return () => {
      void connection.disconnect();
    };
  }, []);
  useEffect(() => {
    const keys: Record<string, number> = {
      a: 60,
      w: 61,
      s: 62,
      e: 63,
      d: 64,
      f: 65,
      t: 66,
      g: 67,
      y: 68,
      h: 69,
      u: 70,
      j: 71,
      k: 72,
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest("input,select,textarea,[contenteditable]"))
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        void actions.current.start();
      } else if (keys[e.key.toLowerCase()] !== undefined) {
        e.preventDefault();
        input.current(
          {
            type: "on",
            pitch: keys[e.key.toLowerCase()],
            velocity: 0.65,
            channel: 0,
          },
          true,
        );
      }
    };
    const up = (e: KeyboardEvent) => {
      if (keys[e.key.toLowerCase()] !== undefined)
        input.current(
          {
            type: "off",
            pitch: keys[e.key.toLowerCase()],
            velocity: 0,
            channel: 0,
          },
          true,
        );
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setAiStatus(null);
    setAiText("");
    if (session?.user.id) {
      setAiText(readPreference(`advice:${session.user.id}:${item.id}`, ""));
      void orpcClient.piano
        .status()
        .then((status) => {
          if (active) setAiStatus(status);
        })
        .catch(() => {});
      void orpcClient.piano
        .savedAdvice(facts)
        .then((saved) => {
          if (active && saved.text) {
            setAiText(saved.text);
            writePreference(`advice:${session.user.id}:${item.id}`, saved.text);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [session?.user.id, item.id, facts]);
  function revealReadingHelp() {
    if (window.matchMedia("(max-width: 800px)").matches)
      root.current?.querySelector(".piano-sidebar")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }
  function explainSymbol(key: string) {
    setSymbol(symbols[key] ? key : "note");
    setSelectedNoteId(null);
    setSidebar("symbols");
    revealReadingHelp();
  }
  function editNote(update: Annotation) {
    if (!selectedNote) return;
    practice.pause();
    const data = {
      ...annotations,
      [sourceKey(selectedNote.id)]: {
        ...annotations[sourceKey(selectedNote.id)],
        ...update,
      },
    };
    setAnnotations(data);
    if (!writePreference(`annotations:${item.id}`, data))
      setNotice(
        "指法暂时生效，但浏览器存储失败。请下载标注后的 MusicXML 保存。",
      );
  }
  async function saveCloud() {
    if (!session) {
      setNotice("请先登录，再将曲谱保存到账号。");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      // MusicXML carries the user's edited fingering to the next device.
      const file =
        score.format === "musicxml"
          ? new File([score.xml], `${score.title}.musicxml`)
          : new File([item.file], item.fileName);
      await orpcClient.piano.save({ file, title: score.title });
      setSaved(true);
      setNotice("已保存到账号曲库，仅你登录后可读取。");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function advice() {
    if (!session) return;
    setAiBusy(true);
    setNotice("");
    try {
      const result = await orpcClient.piano.advice(facts);
      setAiText(result.text);
      writePreference(`advice:${session.user.id}:${item.id}`, result.text);
      setAiStatus((s) => (s ? { ...s, remaining: result.remaining } : null));
    } catch (e) {
      setNotice(message(e));
    } finally {
      setAiBusy(false);
    }
  }
  function downloadXml() {
    const url = URL.createObjectURL(
      new Blob([score.xml], { type: "application/vnd.recordare.musicxml+xml" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${score.title}_练习标注.musicxml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div ref={root} className="piano-desk">
      <header className="piano-desk-heading">
        <div>
          <button className="piano-text-button" onClick={onBack}>
            <ArrowLeft size={15} /> 返回曲库
          </button>
          <h1>{score.title}</h1>
          <p>
            {score.composer || "钢琴练习谱"}
            <span>·</span>
            {score.measures.length} 小节<span>·</span>
            {score.format === "musicxml" ? "MusicXML" : "MIDI"}
            <span>·</span>
            {facts.fingerings} 处指法
          </p>
        </div>
        <div className="piano-heading-actions">
          <button className="piano-button" onClick={onImport}>
            <Upload size={16} />
            导入
          </button>
          <button
            className="piano-button"
            onClick={() => void saveCloud()}
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : saved ? (
              <Check size={16} />
            ) : (
              <Cloud size={16} />
            )}
            {saved ? "已保存" : "保存到账号"}
          </button>
          <button
            className="piano-icon-button"
            aria-label="全屏练习"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void root.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setNotice("当前浏览器不支持全屏，请使用浏览器的全屏功能。"),
                  );
            }}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </header>
      {(notice || practice.error) && (
        <div className="piano-notice" role="status">
          {notice || practice.error}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="piano-workspace">
        <div className="piano-workspace-main">
          <div className="piano-toolbar">
            <div className="piano-segments" aria-label="练习模式">
              {(
                [
                  ["listen", "听示范"],
                  ["wait", "等我弹对"],
                  ["rhythm", "节奏跟弹"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  aria-pressed={options.mode === mode}
                  onClick={() => change({ mode: mode as PracticeMode })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="piano-toolbar-side">
              <button
                className={`piano-text-button ${explain ? "active" : ""}`}
                aria-pressed={explain}
                onClick={() => {
                  setExplain(!explain);
                  setSidebar("symbols");
                  revealReadingHelp();
                }}
              >
                <HelpCircle size={16} />
                点谱解释
              </button>
              <button
                className="piano-icon-button"
                aria-label="练习设置"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
          </div>
          <div className="piano-transport">
            <button
              className="piano-play"
              aria-label={practice.playing ? "暂停" : "开始练习"}
              disabled={practice.busy}
              onClick={() => void practice.start()}
            >
              {practice.busy ? (
                <LoaderCircle className="animate-spin" size={22} />
              ) : practice.playing ? (
                <Pause size={22} />
              ) : (
                <Play size={22} />
              )}
            </button>
            <button
              className="piano-icon-button"
              aria-label="回到练习段开头"
              onClick={() =>
                practice.seek(
                  options.loop
                    ? score.measures[options.startMeasure - 1].beat
                    : 0,
                )
              }
            >
              <RotateCcw size={17} />
            </button>
            <div className="piano-tempo">
              <strong>
                ♩ = {Math.round(tempoAt(score, practice.beat) * options.speed)}
              </strong>
              <label>
                <span className="sr-only">播放速度</span>
                <input
                  type="range"
                  min="0.25"
                  max="1.5"
                  step="0.05"
                  value={options.speed}
                  onChange={(e) => change({ speed: Number(e.target.value) })}
                />
                <span>{options.speed.toFixed(2)}×</span>
              </label>
            </div>
            <label className="piano-hand">
              <span>练习</span>
              <select
                aria-label="练习左右手"
                value={options.hand}
                onChange={(e) =>
                  change({ hand: e.target.value as PracticeOptions["hand"] })
                }
              >
                <option value="both">双手</option>
                <option value="right">右手</option>
                <option value="left">左手</option>
              </select>
            </label>
            <label className="piano-check">
              <input
                type="checkbox"
                checked={options.metronome}
                onChange={(e) => change({ metronome: e.target.checked })}
              />
              节拍器
            </label>
          </div>
          {settingsOpen && (
            <div className="piano-settings">
              <label>
                谱面缩放
                <input
                  type="range"
                  min="0.5"
                  max="1.3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <label>
                播放音量
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    practice.audio.current?.setVolume(v / 100);
                  }}
                />
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={fingers}
                  onChange={(e) => setFingers(e.target.checked)}
                />
                显示指法
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={fullKeys}
                  onChange={(e) => setFullKeys(e.target.checked)}
                />
                完整 88 键
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={options.countIn}
                  onChange={(e) => change({ countIn: e.target.checked })}
                />
                开始前预备四拍
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={options.leftSound}
                  onChange={(e) => change({ leftSound: e.target.checked })}
                />
                左手示范声音
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={options.rightSound}
                  onChange={(e) => change({ rightSound: e.target.checked })}
                />
                右手示范声音
              </label>
              <label className="piano-check">
                <input
                  type="checkbox"
                  checked={options.monitor}
                  onChange={(e) => change({ monitor: e.target.checked })}
                />
                MIDI 输入监听
              </label>
              <label>
                延迟校准 {options.latency} ms
                <input
                  type="range"
                  min="-150"
                  max="250"
                  step="10"
                  value={options.latency}
                  onChange={(e) => change({ latency: Number(e.target.value) })}
                />
              </label>
              <p>
                电钢琴自身有声音时可关闭 MIDI
                输入监听。延迟校准用于补偿蓝牙或音频设备延迟；正值会把收到的击键时间向前校正。
              </p>
            </div>
          )}
          <div className="piano-loop">
            <button
              className={`piano-text-button ${options.loop ? "active" : ""}`}
              aria-pressed={options.loop}
              onClick={() => change({ loop: !options.loop })}
            >
              <Repeat2 size={16} />
              A–B 循环
            </button>
            <label>
              A{" "}
              <input
                aria-label="循环起始小节"
                type="number"
                min="1"
                max={options.endMeasure}
                value={options.startMeasure}
                onChange={(e) =>
                  change({
                    startMeasure: Math.max(
                      1,
                      Math.min(options.endMeasure, Number(e.target.value) || 1),
                    ),
                  })
                }
              />
            </label>
            <span>—</span>
            <label>
              B{" "}
              <input
                aria-label="循环结束小节"
                type="number"
                min={options.startMeasure}
                max={score.measures.length}
                value={options.endMeasure}
                onChange={(e) =>
                  change({
                    endMeasure: Math.max(
                      options.startMeasure,
                      Math.min(
                        score.measures.length,
                        Number(e.target.value) || 1,
                      ),
                    ),
                  })
                }
              />
            </label>
            <button
              className="piano-text-button"
              onClick={() =>
                change({
                  startMeasure: measureIndex + 1,
                  endMeasure: Math.max(options.endMeasure, measureIndex + 1),
                  loop: true,
                })
              }
            >
              此处设为 A
            </button>
            <span className="piano-loop-label">按演奏顺序的小节</span>
          </div>
          <div className="piano-view-bar">
            <div className="piano-segments small">
              {(
                [
                  ["both", "谱面 + 瀑布流"],
                  ["score", "五线谱"],
                  ["waterfall", "瀑布流"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="piano-hand-legend">
              <i />
              右手 <i />
              左手
            </span>
          </div>
          <div className={`piano-stage view-${view}`}>
            {view !== "waterfall" && (
              <ScoreView
                score={score}
                beat={practice.beat}
                playing={practice.playing}
                zoom={zoom}
                explain={explain}
                fingers={fingers}
                onSeek={practice.seek}
                onNote={(id) => {
                  setSelectedNoteId(id);
                  setSymbol(null);
                  setSidebar("symbols");
                }}
                onSymbol={explainSymbol}
              />
            )}
            <PianoRoll
              score={score}
              beat={practice.beat}
              pressed={practice.pressed}
              feedback={practice.feedback}
              expected={options.mode !== "listen" ? next?.notes || [] : []}
              full={fullKeys}
              waterfall={view !== "score"}
              fingers={fingers}
              onPress={(pitch) =>
                practice.input(
                  { type: "on", pitch, velocity: 0.65, channel: 0 },
                  true,
                )
              }
              onRelease={(pitch) =>
                practice.input(
                  { type: "off", pitch, velocity: 0, channel: 0 },
                  true,
                )
              }
            />
            {practice.countdown > 0 && (
              <div className="piano-countdown" role="status">
                <span>预备</span>
                <strong>{practice.countdown}</strong>
              </div>
            )}
          </div>
          <div className="piano-progress">
            <input
              type="range"
              aria-label="曲谱播放位置"
              min="0"
              max={score.totalBeats}
              step="0.125"
              value={practice.beat}
              onChange={(e) => practice.seek(Number(e.target.value))}
            />
            <div>
              <span>
                第 {score.measures[measureIndex].number} 小节{" "}
                <small>
                  · {measureIndex + 1} / {score.measures.length}
                </small>
              </span>
              <span>
                {time(beatSeconds(score, practice.beat) / options.speed)} /{" "}
                {time(beatSeconds(score, score.totalBeats) / options.speed)}
              </span>
            </div>
          </div>
          <div className="piano-live-status" role="status">
            <span
              className={`piano-status-dot ${practice.playing ? "on" : ""}`}
            />
            <span>
              {practice.busy
                ? "正在加载斯坦威采样…"
                : practice.countdown
                  ? "跟着预备拍，放松双手"
                  : options.mode === "wait" && practice.playing
                    ? `等待：${next?.notes.map((n) => `${noteName(n.pitch)}${n.finger ? ` (${n.finger}指)` : ""}`).join(" + ") || "完成"}`
                    : practice.playing
                      ? "练习进行中"
                      : "准备好后，按下播放"}
            </span>
            {practice.feedback && options.mode !== "listen" && (
              <strong className={`verdict-${practice.feedback.verdict}`}>
                {
                  {
                    correct: "弹对了",
                    early: "稍早",
                    late: "稍晚",
                    wrong: "错音",
                    missed: "漏音",
                  }[practice.feedback.verdict]
                }
              </strong>
            )}
            <span className="piano-pedal">
              踏板 {practice.pedal ? "↓" : "↑"}
            </span>
          </div>
          <div className="piano-midi">
            <div>
              <span className="piano-eyebrow">CONNECT YOUR PIANO</span>
              <strong>{midiStatus}</strong>
            </div>
            <button
              className="piano-button"
              onClick={() => {
                practice.pause();
                void midi.current
                  ?.connectUsb()
                  .catch((e: unknown) => setNotice(message(e)));
              }}
            >
              <Usb size={16} />
              USB / 系统 MIDI
            </button>
            <button
              className="piano-button"
              onClick={() => {
                practice.pause();
                void midi.current
                  ?.connectBluetooth()
                  .catch((e: unknown) => setNotice(message(e)));
              }}
            >
              <Bluetooth size={16} />
              蓝牙 MIDI
            </button>
            {devices.length > 0 && (
              <select
                aria-label="MIDI 输入设备"
                value={deviceId || devices[0].id}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  midi.current?.select(e.target.value);
                }}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="piano-text-button"
              onClick={() => void midi.current?.disconnect()}
            >
              断开
            </button>
          </div>
          <details className="piano-help">
            <summary>
              连接与练习说明 <ChevronDown size={14} />
            </summary>
            <p>
              USB：连接电钢琴后，在桌面版 Chrome / Edge 中点击“USB / 系统
              MIDI”，允许访问。蓝牙：可点击“蓝牙
              MIDI”直接选择设备；若浏览器不支持，先在系统 MIDI
              设置中配对，再选择“USB / 系统 MIDI”。macOS 使用“音频 MIDI 设置 →
              MIDI 工作室 → 配置蓝牙”。设备必须支持
              MIDI，普通蓝牙音箱不能输入音符。
            </p>
            <p>
              “等我弹对”会等待正确音高；和弦需同时按住。“节奏跟弹”同时检查音高与击键时机，当前容差为
              ±180 ms，稍早/稍晚范围为 ±360
              ms。评分不评价手型、音色、踏板艺术处理或指法是否实际使用。
            </p>
            <p>
              空格播放 / 暂停；电脑键盘 A S D F G H J K 对应 C4 至 C5 的白键，W
              E T Y U
              对应黑键。窗口失去焦点或设备断开时自动暂停。屏幕键盘也可试弹。
            </p>
          </details>
        </div>
        <aside className="piano-sidebar">
          <div className="piano-sidebar-tabs">
            {(
              [
                ["guide", "练习笺"],
                ["symbols", "读谱"],
                ["results", "记录"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                aria-pressed={sidebar === v}
                onClick={() => setSidebar(v)}
              >
                {label}
              </button>
            ))}
          </div>
          {sidebar === "guide" && (
            <>
              <span className="piano-eyebrow">TODAY'S PRACTICE</span>
              <h2>
                先慢一点，
                <br />
                再连贯一点。
              </h2>
              <div className="piano-facts">
                <span>
                  难度参考<strong>{facts.estimatedDifficulty}</strong>
                </span>
                <span>
                  原始速度<strong>♩ {score.tempos[0].bpm}</strong>
                </span>
                <span>
                  音域
                  <strong>
                    {noteName(facts.range[0])} — {noteName(facts.range[1])}
                  </strong>
                </span>
              </div>
              <p className="piano-caption">
                难度由密度、和弦与时值粗估，不对应考级等级。
              </p>
              <ol className="piano-practice-tips">
                <li>
                  <span>01</span>
                  <div>
                    <strong>分手熟悉</strong>
                    <p>从 0.5× 开始，用“等我弹对”找准每个音和指法。</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>短句循环</strong>
                    <p>圈出 2–4 小节，连贯弹对三遍后再增加速度。</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>听见旋律</strong>
                    <p>
                      双手合起来时，让旋律突出，伴奏更轻。肩膀和手腕保持放松。
                    </p>
                  </div>
                </li>
              </ol>
              <div className="piano-ai">
                <span className="piano-eyebrow">
                  <Sparkles size={13} /> CLOUDFLARE AI
                </span>
                <h3>这首曲子的练习建议</h3>
                {aiText ? (
                  <div className="piano-ai-text">
                    {aiText}
                    <small>
                      AI
                      根据曲谱统计生成，仅供练习参考。已保存，查看不消耗额度。
                    </small>
                  </div>
                ) : (
                  <>
                    <p>
                      生成一次曲谱简介、难度分析和练习建议，保存后反复查看。
                    </p>
                    {!session ? (
                      <a href="/login" className="piano-text-button">
                        登录后使用 →
                      </a>
                    ) : (
                      <button
                        className="piano-button"
                        disabled={
                          aiBusy ||
                          !aiStatus?.enabled ||
                          aiStatus.exhausted ||
                          aiStatus.remaining === 0
                        }
                        onClick={() => void advice()}
                      >
                        {aiBusy ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        {aiBusy ? "正在写练习建议…" : "生成练习建议"}
                      </button>
                    )}
                    <small>
                      {session
                        ? aiStatus?.enabled
                          ? `今天还可生成 ${aiStatus.remaining} 次 · 每人每日 3 次`
                          : "AI 暂未启用，本页练习功能可正常使用。"
                        : "仅限注册用户 · 免费额度用尽后停止"}
                    </small>
                  </>
                )}
              </div>
            </>
          )}
          {sidebar === "symbols" && (
            <>
              <span className="piano-eyebrow">READ THE MUSIC</span>
              <h2>读懂每个记号。</h2>
              <p className="piano-caption">
                打开“点谱解释”，点击谱上的符号或音符；也可以在下面查阅。
              </p>
              {selectedNote && (
                <div className="piano-note-detail">
                  <h3>
                    {noteName(selectedNote.pitch)}{" "}
                    <span>
                      {selectedNote.hand === "right" ? "右手" : "左手"}
                    </span>
                  </h3>
                  <p>
                    第 {score.measures[selectedNote.measure].number} 小节 ·{" "}
                    {selectedNote.duration.toFixed(2).replace(/\.?0+$/, "")}{" "}
                    个四分音符拍
                  </p>
                  <label>
                    我的指法
                    <select
                      aria-label="编辑音符指法"
                      value={selectedNote.finger || ""}
                      onChange={(e) => editNote({ finger: e.target.value })}
                    >
                      <option value="">未标注</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} ·{" "}
                          {["拇指", "食指", "中指", "无名指", "小指"][n - 1]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    演奏手
                    <select
                      aria-label="编辑音符左右手"
                      value={selectedNote.hand}
                      onChange={(e) =>
                        editNote({ hand: e.target.value as "left" | "right" })
                      }
                    >
                      <option value="right">右手</option>
                      <option value="left">左手</option>
                    </select>
                  </label>
                  <small>
                    标注保存在本机；MusicXML 指法也可随下载文件保存。
                  </small>
                  <div className="piano-symbol-chips">
                    {selectedNote.symbols
                      .filter((s) => symbols[s])
                      .map((s) => (
                        <button key={s} onClick={() => setSymbol(s)}>
                          {symbols[s].name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {symbol && (
                <div className="piano-symbol-detail">
                  <span>{symbols[symbol].symbol}</span>
                  <h3>{symbols[symbol].name}</h3>
                  <p>{symbols[symbol].explanation}</p>
                  <strong>怎么练</strong>
                  <p>{symbols[symbol].practice}</p>
                </div>
              )}
              <div className="piano-symbol-grid">
                {Object.entries(symbols).map(([key, s]) => (
                  <button
                    key={key}
                    aria-pressed={symbol === key}
                    onClick={() => {
                      setSymbol(key);
                      setSelectedNoteId(null);
                    }}
                  >
                    <span>{s.symbol}</span>
                    {s.name}
                  </button>
                ))}
              </div>
              <button className="piano-text-button" onClick={downloadXml}>
                <Download size={15} /> 下载含指法的 MusicXML
              </button>
            </>
          )}
          {sidebar === "results" && (
            <>
              <span className="piano-eyebrow">ONE PHRASE AT A TIME</span>
              <h2>
                这一遍，
                <br />
                比上一遍更熟。
              </h2>
              <div className="piano-accuracy">
                <strong>{accuracy === null ? "—" : `${accuracy}%`}</strong>
                <span>已判定音符准确率</span>
              </div>
              <div className="piano-results-grid">
                <span>
                  准确<strong>{practice.result.correct}</strong>
                </span>
                <span>
                  错音<strong>{practice.result.wrong}</strong>
                </span>
                <span>
                  稍早 / 稍晚
                  <strong>
                    {practice.result.early} / {practice.result.late}
                  </strong>
                </span>
                <span>
                  漏音<strong>{practice.result.missed}</strong>
                </span>
              </div>
              <p className="piano-caption">
                完成一遍后自动保存到本机练习记录。听示范不评分。
              </p>
              <h3>再练一次这些小节</h3>
              {Object.entries(practice.result.byMeasure)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([index, count]) => (
                  <button
                    key={index}
                    className="piano-trouble"
                    onClick={() => {
                      const i = Number(index);
                      change({
                        loop: true,
                        startMeasure: i + 1,
                        endMeasure: i + 1,
                        speed: Math.min(options.speed, 0.65),
                      });
                      practice.seek(score.measures[i].beat);
                    }}
                  >
                    <span>第 {score.measures[Number(index)].number} 小节</span>
                    <span>{count} 次偏差 →</span>
                  </button>
                ))}
              {!Object.keys(practice.result.byMeasure).length && (
                <p className="piano-caption">
                  用 MIDI 或屏幕键盘开始跟弹后，这里会标出需要重复练习的小节。
                </p>
              )}
            </>
          )}
          {score.warnings.length > 0 && (
            <details className="piano-score-notes">
              <summary>
                <BookOpen size={14} /> 曲谱读取说明
              </summary>
              {score.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </details>
          )}
          <div className="piano-sound-credit">
            <Piano size={18} />
            <div>
              <strong>Steinway Model B</strong>
              <span>University of Iowa · 三层真实采样</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
