import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Cloud,
  Music2,
  Upload,
  Trash2,
  Pencil,
  Link2,
  HardDrive,
} from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { orpcClient } from "@/lib/orpc";
import { SharingAgreement, useSharingAgreement } from "./sharing-agreement";
import { PIANO_SHARING_TERMS_URL } from "../sharing-terms";

const api = orpcClient.piano.shared;
const failure = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请重试。";
export const formatBytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(2)} MB`
      : `${(n / 1024).toFixed(1)} KB`;
export function SharedLibrary({
  admin = false,
  onOpen,
}: {
  admin?: boolean;
  onOpen?: (id: string) => void;
}) {
  const { data: session } = authClient.useSession();
  const agreement = useSharingAgreement(session?.user.id);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    composer: string;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey: ["piano-shared", search, page],
    queryFn: () => api.list({ search, page }),
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["piano-shared"] });
    await client.invalidateQueries({ queryKey: ["piano-storage"] });
  }
  async function upload() {
    if (!file || !session || !agreement.ready) return;
    setBusy(true);
    setNotice("");
    try {
      const { parseScore } = await import("../score");
      await parseScore(file);
      await agreement.ensureAccepted();
      await api.upload({ file, title, composer });
      setFile(null);
      setTitle("");
      setComposer("");
      if (fileInput.current) fileInput.current.value = "";
      setPage(0);
      setSearch("");
      await refresh();
      setNotice("上传成功，所有人都可以打开这首曲谱练习。");
    } catch (e) {
      setNotice(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="piano-shared-library"
      aria-label={admin ? "钢琴谱管理" : "全站共享曲库"}
    >
      {admin && <StorageUsage />}
      <div className="piano-library-heading">
        <h2>
          <Cloud size={19} /> {admin ? "共享曲谱管理" : "全站共享曲库"}{" "}
          <small>({query.data?.total ?? "…"})</small>
        </h2>
        <input
          className="piano-input"
          aria-label="搜索共享曲谱"
          placeholder="搜索曲名或作曲者…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <p className="piano-caption">
        注册用户可上传，上传后立即全站共享。支持 MIDI / MusicXML /
        MXL，单个文件不超过 4 MB；每账号最多 50 首，每小时最多上传 10
        次。请分享你有权公开的曲谱。
        <a href={PIANO_SHARING_TERMS_URL} target="_blank" rel="noreferrer">
          共享协议与权利反馈 →
        </a>
      </p>
      {session ? (
        <form
          className="piano-share-form"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <label>
            选择曲谱
            <input
              ref={fileInput}
              type="file"
              accept=".mid,.midi,.xml,.musicxml,.mxl"
              aria-label="上传共享钢琴谱"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0];
                setNotice("");
                if (next && next.size > 4 * 1024 * 1024) {
                  setFile(null);
                  e.target.value = "";
                  setNotice("单个文件不能超过 4 MB。");
                  return;
                }
                setFile(next ?? null);
                setTitle(next?.name.replace(/\.[^.]+$/, "") ?? "");
              }}
            />
          </label>
          {file && (
            <>
              <label>
                曲名
                <input
                  className="piano-input"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                作曲者（选填）
                <input
                  className="piano-input"
                  maxLength={160}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                />
              </label>
            </>
          )}
          <SharingAgreement agreement={agreement} />
          <button
            className="piano-button primary"
            disabled={!file || !title.trim() || busy || !agreement.ready}
          >
            <Upload size={16} />
            {busy ? "正在上传…" : "上传并全站共享"}
          </button>
        </form>
      ) : (
        <p className="piano-caption">
          <Link to="/login" search={{ redirectTo: "/piano" }}>
            登录或注册后上传曲谱 →
          </Link>{" "}
          · 看谱与练习无需登录
        </p>
      )}
      {notice && (
        <p className="piano-notice" role="status">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <p role="status">正在加载共享曲库…</p>
      ) : query.isError ? (
        <div className="piano-error" role="alert">
          曲库加载失败。
          <button onClick={() => void query.refetch()}>重试</button>
        </div>
      ) : !query.data.items.length ? (
        <p className="piano-caption">
          {search ? "没有找到匹配的曲谱。" : "还没有共享曲谱，上传第一首吧。"}
        </p>
      ) : (
        <div className="piano-library-grid">
          {query.data.items.map((item) => (
            <article className="piano-score-card" key={item.id}>
              <span className="piano-eyebrow">
                {item.fileName.split(".").at(-1)?.toUpperCase()} ·{" "}
                {formatBytes(item.size)}
              </span>
              {onOpen ? (
                <button
                  className="piano-card-open"
                  disabled={busy}
                  onClick={() => onOpen(item.id)}
                >
                  <Music2 size={26} />
                  <strong>{item.title}</strong>
                  <span className="piano-card-action">开始练习 →</span>
                </button>
              ) : (
                <a className="piano-card-open" href={`/piano?score=${item.id}`}>
                  <Music2 size={26} />
                  <strong>{item.title}</strong>
                  <span className="piano-card-action">打开练习室 →</span>
                </a>
              )}
              <span>{item.composer || "作曲者未填写"}</span>
              <span className="piano-caption">由 {item.uploader} 分享</span>
              <div className="piano-share-actions">
                <button
                  className="piano-text-button"
                  aria-label={`分享 ${item.title}`}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${location.origin}/piano?score=${item.id}`)
                      .then(() => setNotice("练习链接已复制。"))
                      .catch(() =>
                        setNotice(
                          `分享链接：${location.origin}/piano?score=${item.id}`,
                        ),
                      );
                  }}
                >
                  <Link2 size={14} />
                  分享
                </button>
                {admin && (
                  <button
                    className="piano-text-button"
                    onClick={() => setEditing(item)}
                  >
                    <Pencil size={14} />
                    编辑
                  </button>
                )}
                {(admin || session?.user.id === item.userId) && (
                  <button
                    className="piano-text-button"
                    disabled={busy}
                    aria-label={`删除共享曲谱 ${item.title}`}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `删除「${item.title}」？共享链接会失效，已下载的本机副本不受影响。`,
                        )
                      )
                        return;
                      setBusy(true);
                      void api
                        .remove({ id: item.id })
                        .then(refresh)
                        .then(() => setNotice("曲谱已删除。"))
                        .catch((e) => setNotice(failure(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {(query.data?.total ?? 0) > 24 && (
        <div className="piano-share-actions">
          <button
            className="piano-button"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span>第 {page + 1} 页</span>
          <button
            className="piano-button"
            disabled={(page + 1) * 24 >= (query.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
      )}
      {editing && (
        <form
          className="piano-share-form"
          aria-label="编辑曲谱信息"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void api
              .update(editing)
              .then(refresh)
              .then(() => setEditing(null))
              .catch((e) => setNotice(failure(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            曲名
            <input
              className="piano-input"
              required
              maxLength={160}
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
            />
          </label>
          <label>
            作曲者
            <input
              className="piano-input"
              maxLength={160}
              value={editing.composer}
              onChange={(e) =>
                setEditing({ ...editing, composer: e.target.value })
              }
            />
          </label>
          <button className="piano-button primary" disabled={busy}>
            保存信息
          </button>
          <button
            type="button"
            className="piano-button"
            onClick={() => setEditing(null)}
          >
            取消
          </button>
        </form>
      )}
    </section>
  );
}
function StorageUsage() {
  const stats = useQuery({
    queryKey: ["piano-storage"],
    queryFn: () => api.stats(),
  });
  const [bucket, setBucket] = useState<{
    files: number;
    bytes: number;
    at: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function measure() {
    setBusy(true);
    setError("");
    try {
      let cursor: string | undefined,
        files = 0,
        bytes = 0,
        pages = 0;
      do {
        const data = await api.storage({ cursor });
        files += data.files;
        bytes += data.bytes;
        cursor = data.cursor ?? undefined;
        if (++pages >= 50 && cursor)
          throw new Error(
            "文件过多，本次未完成统计。请在 Cloudflare 控制台查看用量。",
          );
      } while (cursor);
      setBucket({ files, bytes, at: Date.now() });
      await stats.refetch();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="piano-storage">
      <h2>
        <HardDrive size={20} /> 存储用量
      </h2>
      <div className="piano-storage-grid">
        <div>
          <span>全站共享钢琴谱</span>
          <strong>{stats.data ? formatBytes(stats.data.bytes) : "—"}</strong>
          <small>{stats.data?.files ?? "—"} 个文件</small>
        </div>
        <div>
          <span>博客文件存储桶</span>
          <strong>{bucket ? formatBytes(bucket.bytes) : "待统计"}</strong>
          <small>
            {bucket
              ? `${bucket.files} 个文件 · ${new Date(bucket.at).toLocaleTimeString()}`
              : "含图片、吉他谱与钢琴谱"}
          </small>
        </div>
      </div>
      <button
        className="piano-button"
        disabled={busy}
        onClick={() => void measure()}
      >
        {busy ? "正在统计…" : "刷新整个存储桶用量"}
      </button>
      <p className="piano-caption">
        钢琴谱用量按文件大小汇总；存储桶按当前文件逐页统计，不包含数据库、缓存、静态音源和其他存储桶，也不代表
        Cloudflare 账号的计费用量。
      </p>
      {(error || stats.isError) && (
        <p className="piano-error" role="alert">
          {error || "曲谱用量读取失败，请刷新重试。"}
        </p>
      )}
    </div>
  );
}
