import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Github,
  Hash,
  Mail,
  Music,
  Rss,
  Terminal,
} from "lucide-react";
import type { HomePageProps } from "@/features/theme/contract/pages";
import { blogConfig } from "@/blog.config";
import { PostItem } from "@/features/theme/themes/default/components/post-item";
import { formatDate } from "@/lib/utils";

export function HomePage({
  posts,
  totalPosts,
  totalTags,
  totalGuitarTabs,
}: HomePageProps) {
  const latestDate = posts[0]?.publishedAt;

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto px-6 md:px-0 py-12 md:py-20 space-y-28">
      {/* ── Hero Section ── */}
      <section className="relative space-y-8">
        {/* Ambient decorative orbs — multi-layered dreamlike floating */}
        <div
          className="pointer-events-none absolute -top-24 -left-36 w-80 h-80 rounded-full opacity-[0.04] dark:opacity-[0.07] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 65%)",
            animation:
              "ambient-float 18s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 -right-28 w-64 h-64 rounded-full opacity-[0.03] dark:opacity-[0.05] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 65%)",
            animation:
              "ambient-float 15s cubic-bezier(0.45, 0, 0.55, 1) 3s infinite alternate-reverse",
          }}
        />
        {/* 第三个漂浮光球 — 更小、节奏不同 */}
        <div
          className="pointer-events-none absolute top-1/2 -right-16 w-40 h-40 rounded-full opacity-[0.025] dark:opacity-[0.04] blur-2xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 60%)",
            animation:
              "ambient-drift 20s cubic-bezier(0.45, 0, 0.55, 1) 6s infinite",
          }}
        />
        {/* 微粒装饰点 — 左侧 */}
        <div
          className="pointer-events-none absolute top-8 -left-8 w-1.5 h-1.5 rounded-full bg-accent/20 dark:bg-accent/30"
          style={{
            animation: "particle-float 8s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-16 -left-4 w-1 h-1 rounded-full bg-accent/15 dark:bg-accent/25"
          style={{
            animation: "particle-float 10s ease-in-out 2s infinite",
          }}
        />

        <header className="space-y-6" style={{ animation: "ink-reveal 1000ms var(--ease-out-expo) both" }}>
          <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-foreground flex items-center gap-4">
            你好 <span className="animate-wave origin-[70%_70%]">👋</span>
          </h1>

          <div className="space-y-4 max-w-2xl text-base md:text-lg text-muted-foreground font-light leading-relaxed">
            <p>
              我是{" "}
              <span className="text-accent font-medium">
                {blogConfig.author}
              </span>
              ，{blogConfig.description}
            </p>
          </div>
        </header>

        <div
          className="flex items-center gap-6 text-muted-foreground"
          style={{ animation: "bounce-drop 700ms var(--ease-spring) 400ms both" }}
        >
          {[
            { href: blogConfig.social.github, icon: Github, label: "GitHub", external: true },
            { href: "/rss.xml", icon: Rss, label: "RSS 订阅", external: true },
            { href: `mailto:${blogConfig.social.email}`, icon: Mail, label: "发送邮件", external: false },
          ].map(({ href, icon: Icon, label, external }, i) => (
            <a
              key={label}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className="hover:text-accent transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] hover:scale-115 active:scale-95"
              aria-label={label}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Icon size={20} strokeWidth={1.5} />
            </a>
          ))}
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section
        className="relative flex items-stretch py-6 px-4 sm:px-6 md:px-8 rounded-2xl bg-card border border-border/50 shadow-sm shadow-accent/[0.04] backdrop-blur-sm overflow-hidden"
        style={{ animation: "bounce-drop 900ms var(--ease-spring-soft) 200ms both" }}
      >
        {/* 装饰性背景光带 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--accent)) 0%, transparent 50%, hsl(var(--accent)) 100%)",
          }}
        />
        {[
          {
            icon: <BookOpen size={15} strokeWidth={1.5} className="text-accent/70" />,
            value: totalPosts,
            label: "篇文章",
            wide: false,
          },
          {
            icon: <Hash size={15} strokeWidth={1.5} className="text-accent/70" />,
            value: totalTags,
            label: "个标签",
            wide: false,
          },
          {
            icon: <Music size={15} strokeWidth={1.5} className="text-accent/70" />,
            value: totalGuitarTabs,
            label: "首吉他谱",
            wide: false,
          },
          {
            icon: <span className="text-accent/70 text-xs">✦</span>,
            value: latestDate ? formatDate(latestDate) : "—",
            label: "最近更新",
            wide: true,
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={`relative flex flex-col items-center justify-center gap-2 text-center ${
              stat.wide ? "flex-[1.6] min-w-0" : "flex-1 min-w-0"
            } ${i < 3 ? "border-r border-border/30" : ""}`}
            style={{
              animation: `jelly 800ms var(--ease-spring) ${200 + i * 100}ms both`,
            }}
          >
            {stat.icon}
            <span className={`font-serif font-medium text-foreground leading-none whitespace-nowrap ${
              stat.wide
                ? "text-base sm:text-lg md:text-xl tabular-nums"
                : "text-xl sm:text-2xl tabular-nums"
            }`}>
              {stat.value}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">
              {stat.label}
            </span>
          </div>
        ))}
      </section>

      {/* ── Recent Posts ── */}
      <section className="space-y-10">
        <div className="flex items-center gap-4">
          <h2
            className="text-xl font-serif font-medium text-foreground tracking-tight whitespace-nowrap"
            style={{ animation: "ink-reveal 900ms var(--ease-out-expo) both" }}
          >
            最新文章
          </h2>
          <div
            className="flex-1 h-px bg-border/40"
            style={{ animation: "line-grow 1.2s var(--ease-out-expo) 300ms both" }}
          />
        </div>

        <div className="space-y-4">
          {posts.map((post, i) => {
            // 交替使用不同动画效果，增加视觉丰富度
            const animations = [
              "apple-fade-up",
              "collision-right",
              "float-up",
            ];
            const anim = animations[i % animations.length];
            return (
              <div
                key={post.id}
                style={{
                  animation: `${anim} 700ms var(--ease-spring-soft) ${Math.min(150 + i * 80, 600)}ms both`,
                }}
              >
                <PostItem post={post} />
              </div>
            );
          })}
        </div>

        <div className="pt-4" style={{ animation: "collision-left 700ms var(--ease-spring) 500ms both" }}>
          <Link
            to="/posts"
            className="text-sm font-mono text-muted-foreground hover:text-accent transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] flex items-center gap-2 group"
          >
            <Terminal
              size={14}
              className="group-hover:translate-x-1 transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]"
            />
            cd /posts
          </Link>
        </div>
      </section>

      {/* ── Footer Motto ── */}
      <section className="relative py-12 flex flex-col items-center text-center">
        {/* 装饰性微粒 */}
        <div
          className="pointer-events-none absolute top-4 left-1/4 w-1 h-1 rounded-full bg-accent/15"
          style={{ animation: "breathe 6s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute bottom-8 right-1/3 w-0.5 h-0.5 rounded-full bg-accent/20"
          style={{ animation: "breathe 8s ease-in-out 2s infinite" }}
        />
        <div
          className="w-12 h-px bg-accent/30 mb-8"
          style={{ animation: "line-grow 1.4s var(--ease-out-expo) both" }}
        />
        <blockquote
          className="max-w-md font-serif text-lg md:text-xl italic text-muted-foreground/60 leading-relaxed"
          style={{ animation: "ink-reveal 1100ms var(--ease-out-expo) 300ms both" }}
        >
          "代码与文字，皆是思想的延伸。"
        </blockquote>
        <div className="mt-6 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/30">
          — {blogConfig.author}
        </div>
      </section>
    </div>
  );
}
