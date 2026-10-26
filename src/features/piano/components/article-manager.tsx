import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FilePenLine } from "lucide-react";
import { orpcClient } from "@/lib/orpc";
const api = orpcClient.piano.articles;
type Job = Awaited<ReturnType<typeof api.list>>[number];
const failure = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";

export function ArticleSettings() {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["piano-article-settings"],
    queryFn: () => api.settings(),
    refetchInterval: 30000,
  });
  const [busy, setBusy] = useState(false);
  const [pendingSetting, setPendingSetting] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  async function configure(autoGenerate: boolean) {
    setBusy(true);
    setPendingSetting(autoGenerate);
    setError("");
    try {
      await api.configure({ autoGenerate });
      await client.invalidateQueries({ queryKey: ["piano-article-settings"] });
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
      setPendingSetting(null);
    }
  }
  return (
    <div className="piano-article-settings">
      <h2>
        <FilePenLine size={20} /> 曲谱文章草稿
      </h2>
      <p className="piano-caption">
        管理员上传后，用 Workers AI
        整理乐曲介绍、资料来源与练习建议，保存到文章草稿。核对后在文章编辑器中发布，发布后可供搜索引擎收录。
      </p>
      <label className="piano-article-toggle">
        <input
          type="checkbox"
          checked={pendingSetting ?? settings.data?.autoGenerate ?? false}
          disabled={busy || !settings.data}
          onChange={(e) => void configure(e.target.checked)}
        />{" "}
        管理员上传时自动生成草稿
      </label>
      <p className="piano-caption">
        普通用户上传不触发生成；关闭后仍可对单首曲谱手动生成。已有文章不会被重复生成或覆盖。
      </p>
      {settings.data && (
        <p className="piano-caption">
          {settings.data.enabled
            ? `你今日还可生成 ${settings.data.remaining} 篇（每位管理员 ${settings.data.dailyLimit} 篇，全站最多 ${settings.data.siteLimit} 篇）。`
            : "Workers AI 当前未启用，曲谱上传和练习照常可用。"}
          {` 与练习建议共用每日 ${settings.data.budget.toLocaleString()} Neurons 预算，已预留 ${settings.data.reservedNeurons.toLocaleString()}。北京时间 08:00 重置。`}
        </p>
      )}
      <p className="piano-caption">
        资料来自 MusicBrainz
        与维基百科。同名曲目、专辑版本和主题解读请核对来源；未核实的项目会在草稿中标明。
      </p>
      {(error || settings.isError) && (
        <p className="piano-error" role="alert">
          {error || "文章设置读取失败，请刷新重试。"}
        </p>
      )}
    </div>
  );
}

export function useArticleJobs(ids: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["piano-articles", ids],
    queryFn: () => api.list({ ids }),
    enabled: enabled && ids.length > 0,
    refetchInterval: (query) =>
      query.state.data?.some(
        (j) => ["queued", "running"].includes(j.status) && !j.stale,
      )
        ? 3000
        : false,
  });
}
export function ArticleAction({
  scoreId,
  job,
}: {
  scoreId: string;
  job?: Job;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [artist, setArtist] = useState(job?.artistHint || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending =
    job && ["queued", "running"].includes(job.status) && !job.stale;
  async function generate() {
    setBusy(true);
    setError("");
    try {
      await api.generate({ id: scoreId, artistHint: artist });
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["piano-articles"] });
      await client.invalidateQueries({ queryKey: ["piano-article-settings"] });
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="piano-article-action">
      {job?.postId ? (
        <Link
          className="piano-text-button"
          to="/admin/posts/edit/$id"
          params={{ id: String(job.postId) }}
        >
          <FilePenLine size={14} />{" "}
          {job.postStatus === "published" ? "编辑已发布文章" : "核对并编辑草稿"}{" "}
          →
        </Link>
      ) : (
        <>
          {pending ? (
            <span role="status" className="piano-caption">
              {job.status === "queued"
                ? "文章正在排队…"
                : "正在查找资料并生成草稿…"}
            </span>
          ) : (
            <button
              type="button"
              className="piano-text-button"
              onClick={() => setOpen(!open)}
            >
              <FilePenLine size={14} />{" "}
              {job ? "重新生成文章草稿" : "生成文章草稿"}
            </button>
          )}
          {job?.stale && (
            <p className="piano-caption">任务超时，可手动重试。</p>
          )}
          {job?.error && <p className="piano-caption">{job.error}</p>}
          {job?.status === "ready" && !job.postId && (
            <p className="piano-caption">此前生成的文章已删除。</p>
          )}
          {open && (
            <form
              className="piano-article-form"
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <label>
                演唱／演奏者（选填，用于区分同名曲目）
                <input
                  className="piano-input"
                  maxLength={160}
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </label>
              <div className="piano-share-actions">
                <button className="piano-button" disabled={busy}>
                  {busy ? "正在提交…" : "开始生成草稿"}
                </button>
                <button
                  type="button"
                  className="piano-text-button"
                  onClick={() => setOpen(false)}
                >
                  取消
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {error && (
        <p className="piano-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
