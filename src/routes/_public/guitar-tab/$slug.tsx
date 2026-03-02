import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  notFound,
  redirect,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  Eye,
  FileText,
  Guitar,
  Layers,
  Music2,
  Play,
  User,
} from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { GuitarProViewer } from "@/features/media/components/guitar-pro-viewer";
import { guitarTabDetailQuery } from "@/features/media/queries";
import { CommentSection } from "@/features/theme/themes/default/components/comments/view/comment-section";
import { blogConfig } from "@/blog.config";

const searchSchema = z.object({
  highlightCommentId: z.coerce.number().optional(),
  rootId: z.number().optional(),
});

export const Route = createFileRoute("/_public/guitar-tab/$slug")({
  validateSearch: searchSchema,
  component: GuitarTabDetailPage,
  beforeLoad: () => {
    if (!blogConfig.features.guitarTabs) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(
      guitarTabDetailQuery(params.slug),
    );
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const tab = loaderData?.tab;
    const title = tab
      ? `${tab.title || tab.fileName}${tab.artist ? ` — ${tab.artist}` : ""}`
      : "吉他谱";
    return {
      meta: [
        { title },
        { name: "description", content: `在线播放 ${title} 吉他谱` },
      ],
    };
  },
});

function GuitarTabDetailPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(guitarTabDetailQuery(slug));

  // 查看器状态 — Hooks 必须在条件分支之前无条件调用
  const [viewerOpen, setViewerOpen] = useState(false);

  const handlePlay = useCallback(() => {
    setViewerOpen(true);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  if (!data) return null;

  const { tab, relatedTabs } = data;
  const displayTitle = tab.title || tab.fileName;
  const coverUrl = tab.coverKey
    ? `/images/${tab.coverKey}?w=300&h=300&fit=cover`
    : null;
  const fileUrl = `/images/${tab.key}?original=true`;

  // 轨道名称解析
  let trackNames: Array<string> = [];
  try {
    trackNames = JSON.parse(tab.trackNames || "[]");
  } catch {
    // ignore
  }

  const formatViewCount = (count: number): string => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-[60vh] py-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* 返回按钮 */}
        <Link
          to="/guitar-tabs"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors mb-8 group"
          style={{
            animation: "ink-reveal 800ms var(--ease-out-expo) both",
          }}
        >
          <ArrowLeft
            size={14}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          返回吉他谱列表
        </Link>

        {/* ═══ 英雄区：封面 + 核心信息 ═══ */}
        <div
          className="relative rounded-3xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/30 overflow-hidden mb-8"
          style={{
            animation:
              "apple-fade-up 900ms var(--ease-spring-soft) 100ms both",
          }}
        >
          {/* 装饰背景 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-accent/5 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-accent/3 blur-3xl" />
          </div>

          <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
            {/* 封面 */}
            <div className="shrink-0">
              {coverUrl ? (
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border border-border/20 shadow-xl shadow-accent/5">
                  <img
                    src={coverUrl}
                    alt={displayTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl bg-gradient-to-br from-accent/15 via-accent/8 to-muted/10 border border-border/20 shadow-xl shadow-accent/5 flex items-center justify-center">
                  <Guitar size={56} className="text-accent/25" />
                </div>
              )}
            </div>

            {/* 信息区 — 统一左对齐 */}
            <div className="flex-1 min-w-0 flex flex-col justify-center text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-medium tracking-tight leading-tight mb-3">
                {displayTitle}
              </h1>

              {tab.artist && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 justify-center sm:justify-start">
                  <Music2 size={14} className="text-accent/60" />
                  <span className="font-medium">{tab.artist}</span>
                </div>
              )}

              {tab.album && (
                <p className="text-xs text-muted-foreground/50 mb-5 sm:mb-6">
                  专辑：{tab.album}
                </p>
              )}

              {!tab.album && tab.artist && <div className="mb-4 sm:mb-5" />}

              {/* 统计信息行 */}
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-xs text-muted-foreground/60 font-mono mb-6 justify-center sm:justify-start">
                {tab.viewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/8 text-accent/80 font-medium">
                    <Eye size={12} />
                    {formatViewCount(tab.viewCount)} 次播放
                  </span>
                )}
                {tab.trackCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Layers size={12} />
                    {tab.trackCount} 轨
                  </span>
                )}
                {tab.tempo > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {tab.tempo} BPM
                  </span>
                )}
                {tab.sizeInBytes > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText size={12} />
                    {tab.sizeInBytes >= 1048576
                      ? `${(tab.sizeInBytes / 1048576).toFixed(1)} MB`
                      : `${(tab.sizeInBytes / 1024).toFixed(0)} KB`}
                  </span>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-3 justify-center sm:justify-start">
                <button
                  onClick={handlePlay}
                  className="inline-flex items-center gap-2.5 px-7 py-3 rounded-xl bg-accent text-accent-foreground font-medium text-sm hover:bg-accent/90 transition-all duration-300 hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98] cursor-pointer"
                >
                  <Play size={18} className="ml-0.5" />
                  在线试听
                </button>
                <a
                  href={fileUrl}
                  download
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border/40 bg-card/80 text-sm text-muted-foreground hover:text-foreground hover:border-accent/30 transition-all duration-300 cursor-pointer"
                >
                  <Download size={16} />
                  下载
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 详细信息区（双栏布局） ═══ */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          style={{
            animation:
              "apple-fade-up 800ms var(--ease-spring-soft) 300ms both",
          }}
        >
          {/* 左栏：轨道列表 */}
          <div className="md:col-span-2">
            {trackNames.length > 0 && (
              <div className="rounded-2xl border border-border/30 bg-card/50 p-5 sm:p-6">
                <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground/50 mb-4 flex items-center gap-2">
                  <Layers size={14} className="text-accent/50" />
                  轨道列表
                </h2>
                <div className="space-y-1">
                  {trackNames.map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-muted/30 transition-colors duration-200 group stagger-item"
                      style={
                        { "--stagger-index": i } as React.CSSProperties
                      }
                    >
                      <span className="text-[10px] font-mono text-muted-foreground/30 w-6 text-right tabular-nums group-hover:text-accent/50 transition-colors">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm">
                        {name || `轨道 ${i + 1}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 如果没有轨道列表，显示一段简要描述 */}
            {trackNames.length === 0 && (
              <div className="rounded-2xl border border-border/30 bg-card/50 p-5 sm:p-6 flex flex-col items-center justify-center py-12 text-center">
                <Guitar
                  size={36}
                  className="text-muted-foreground/15 mb-3"
                />
                <p className="text-sm text-muted-foreground/50">
                  点击「在线试听」即可在浏览器中直接播放此吉他谱
                </p>
              </div>
            )}
          </div>

          {/* 右栏：曲目信息卡片 */}
          <div className="space-y-4">
            {/* 曲目信息 */}
            <div className="rounded-2xl border border-border/30 bg-card/50 p-5">
              <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground/50 mb-4">
                曲目信息
              </h2>
              <dl className="space-y-3 text-sm">
                {tab.artist && (
                  <div className="flex items-start gap-2">
                    <dt className="text-muted-foreground/50 shrink-0 w-14">
                      艺术家
                    </dt>
                    <dd className="font-medium">{tab.artist}</dd>
                  </div>
                )}
                {tab.album && (
                  <div className="flex items-start gap-2">
                    <dt className="text-muted-foreground/50 shrink-0 w-14">
                      专辑
                    </dt>
                    <dd>{tab.album}</dd>
                  </div>
                )}
                {tab.tempo > 0 && (
                  <div className="flex items-start gap-2">
                    <dt className="text-muted-foreground/50 shrink-0 w-14">
                      速度
                    </dt>
                    <dd className="font-mono">{tab.tempo} BPM</dd>
                  </div>
                )}
                {tab.trackCount > 0 && (
                  <div className="flex items-start gap-2">
                    <dt className="text-muted-foreground/50 shrink-0 w-14">
                      轨道数
                    </dt>
                    <dd className="font-mono">{tab.trackCount}</dd>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <dt className="text-muted-foreground/50 shrink-0 w-14">
                    文件
                  </dt>
                  <dd className="font-mono text-xs break-all text-muted-foreground/70">
                    {tab.fileName}
                  </dd>
                </div>
                {tab.createdAt && (
                  <div className="flex items-start gap-2">
                    <dt className="text-muted-foreground/50 shrink-0 w-14">
                      上传
                    </dt>
                    <dd className="text-xs text-muted-foreground/60 flex items-center gap-1">
                      <Calendar size={11} />
                      {formatDate(tab.createdAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* 上传者信息 */}
            {tab.uploaderName && (
              <div className="rounded-2xl border border-border/30 bg-card/50 p-5">
                <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground/50 mb-3">
                  上传者
                </h2>
                <div className="flex items-center gap-3">
                  {tab.uploaderImage ? (
                    <img
                      src={tab.uploaderImage}
                      alt={tab.uploaderName}
                      className="w-9 h-9 rounded-full ring-2 ring-border/30"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted/40 flex items-center justify-center">
                      <User size={16} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="text-sm font-medium">
                    {tab.uploaderName}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ 同首歌其他版本 ═══ */}
        {relatedTabs.length > 0 && (
          <div
            className="mb-10"
            style={{
              animation:
                "apple-fade-up 800ms var(--ease-spring-soft) 450ms both",
            }}
          >
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground/50 mb-4 flex items-center gap-2">
              <Music2 size={14} className="text-accent/50" />
              其他版本
            </h2>
            <div className="space-y-2">
              {relatedTabs.map((related, i) => (
                <Link
                  key={related.mediaId}
                  to="/guitar-tab/$slug"
                  params={{ slug: related.slug || String(related.mediaId) }}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border/30 bg-card/60 hover:border-accent/40 hover:bg-card hover:shadow-sm transition-all duration-300 group stagger-item"
                  style={
                    { "--stagger-index": i } as React.CSSProperties
                  }
                >
                  {/* 封面小图 */}
                  <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-muted/20 border border-border/20">
                    {related.coverKey ? (
                      <img
                        src={`/images/${related.coverKey}?w=80&h=80&fit=cover`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Guitar
                          size={16}
                          className="text-muted-foreground/30"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-accent transition-colors duration-200">
                      {related.fileName}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                      {related.trackCount > 0 && (
                        <span>{related.trackCount} 轨</span>
                      )}
                      {related.tempo > 0 && <span>{related.tempo} BPM</span>}
                      {related.sizeInBytes > 0 && (
                        <span>
                          {related.sizeInBytes >= 1048576
                            ? `${(related.sizeInBytes / 1048576).toFixed(1)} MB`
                            : `${(related.sizeInBytes / 1024).toFixed(0)} KB`}
                        </span>
                      )}
                      {related.uploaderName && (
                        <span className="flex items-center gap-0.5">
                          <User size={8} />
                          {related.uploaderName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-accent/8 text-accent/50 group-hover:bg-accent group-hover:text-accent-foreground transition-all duration-300">
                    <Play size={14} className="ml-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ═══ 评论区 ═══ */}
        <CommentSection guitarTabId={tab.id} />
      </div>

      {/* 全屏播放器 */}
      <GuitarProViewer
        isOpen={viewerOpen}
        fileUrl={fileUrl}
        fileName={displayTitle}
        onClose={handleCloseViewer}
      />
    </div>
  );
}
