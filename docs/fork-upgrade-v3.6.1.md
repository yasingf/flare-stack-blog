# Yasin's Blog：v0.9.4 → 上游 v3.6.1

此升级基于生产分支 `9e664997`，合入 `du2333/flare-stack-blog` 的 `64cad830`（v3.6.1）。升级工作保存在 `codex/upgrade-upstream-v3.6.1`，前台保留原有 default 主题：暖色纸张配色、衬线字体、`[ blog ]` 导航、首页问候/统计、文章列表及阅读布局。后台同样恢复 Git 历史中的 default 主题、固定侧边栏、顶部导航和字号/动画；保留新版功能和数据接口。设置页移除仅适用于 Fuwari 的横幅、头像和色相控件；旧主题背景仍使用原有 `VITE_DEFAULT_*` 构建变量。

## 已迁移的定制功能

吉他谱浏览、播放、投稿、审核、封面、下载、浏览量、评论及回复；编辑器中的 Guitar Pro 嵌入和 Markdown 源码编辑；用户上传头像；用户管理和搜索引擎验证/提交工具。旧文章与吉他谱的短链接保留，`legacy_slug` 继续重定向。媒体清理保护吉他谱、共用封面、文章嵌入和上传头像。

上游文章发布改为 Public Content Snapshot，评论正文改为纯文本；原有已发布内容和评论通过迁移保留。上游不再使用旧的文章浏览量表，改用可选 Umami；吉他谱浏览量独立保留。上游新视频、公式等节点也可在 Markdown 编辑中保留。

## 数据库迁移

- `0000`–`0009` 保持 fork 已部署的原 SQL 文件名和内容，不能用上游同编号文件替换。
- `0010_preserve_guitar_comments.sql` 先迁出吉他谱评论，保留 ID、用户和回复关系，再让上游重建文章评论表。尚未审核的历史吉他谱评论保持原状态，不自动公开。
- 上游原 `0004`–`0022` 按顺序编号为 `0011_upstream_*`–`0029_upstream_*`。
- Drizzle journal 和最终 schema snapshot 已更新；`bun run db:generate` 应报告无 schema 变化。
- `scripts/fork-upgrade.test.ts` 验证空库初始化和旧 fork 数据升级。集成测试在本地 Cloudflare D1/R2 环境执行。
- 迁移包含表重建和删列，不能把旧版本与新版本同时连接到同一个升级后的生产数据库。

## Cloudflare 部署变化

托管平台仍是 Cloudflare Workers，仍使用 D1、R2、KV 和 Queue。上游把 `wrangler.jsonc` 换成 `cloudflare.config.ts`，命令换成 `cf` CLI，要求 Node 24，推荐 Cloudflare Workers Builds 从 GitHub 构建；旧的 GitHub Actions 自动部署文件已移除。CI 仍通过 GitHub Actions 运行。

特别注意：新版 Durable Objects 使用 exports 声明；同一个 Worker 一旦按此方式部署，不能直接回滚为旧的 Wrangler migrations 配置。`cf deploy` 保留机密，但不会保留未声明的普通文本运行时变量。因此不应直接在当前生产 Worker 上覆盖试运行。

## 不影响现有博客的上线顺序

1. 登录 Cloudflare，先核对当前 Worker、域名/Routes、D1、R2、KV、Queue、OAuth、Turnstile 及所有构建变量/运行时机密。把 `blog.yasing.top` 当前 Worker 的版本、资源绑定和现有配置保存下来。
2. 导出 D1、备份 R2，并确认备份能恢复到独立数据库。创建独立的预览 Worker、D1、R2、KV、Queue；复制生产数据和 R2 文件。预览阶段禁止复用生产 D1、Queue、KV 和可写 R2，避免发信、缓存清理或媒体删除影响线上。
3. 预览 Worker 的构建环境设置独立的 `WORKER_NAME`、`D1_DATABASE_ID`、`BUCKET_NAME`、`KV_NAMESPACE_ID`、`QUEUE_NAME` 和预览 `DOMAIN`，并使用预览 OAuth/Turnstile 配置。运行时变量统一设为机密。预览禁用真实邮件、Webhook 和分析数据上报。
4. 用 Node 24 和锁定依赖执行 `bun ci`、`bun run check`、翻译检查、两套测试、`bun run build`。核实 D1 ID 确实是副本后，才在预览环境执行 `bun run deploy`。完整环境变量说明见 [deployment.md](deployment.md)。旧 `wrangler:prepare`、`db:push` 和手工 slug 脚本不适用于此次生产升级。
5. 在预览域名逐项验证：文章、搜索、图片、旧链接、吉他谱播放/音轨/投稿/审核、两类评论、登录/头像、Markdown 与富文本保存、站点设置、邮件及站点地图。核对各表行数、关键内容和 `PRAGMA foreign_key_check`，并保留迁移日志。
6. 正式切换前，先完成最新数据同步。为保证评论、投稿和编辑不丢失，需要短暂冻结这些写入，保持旧站阅读可用；最终导出旧 D1、同步新增 R2 文件、在新库重跑迁移并核对。若要求写入也完全不中断，需要另做增量复制方案，不能直接让两套 schema 混写。
7. 准备新 Worker 的生产 `DOMAIN`、`BETTER_AUTH_URL` 和 OAuth 回调，保留原 `BETTER_AUTH_SECRET`。在新 Worker 健康检查通过后切换 `blog.yasing.top` 的路由/域名绑定；不要在试部署时提前抢占生产 Custom Domain。观察登录、文章/资源/短链接、评论和错误日志后再恢复写入。
8. 回退时把域名/路由指回旧 Worker 和原资源。旧 Worker、旧 D1、旧 R2 在观察期内保留；新站已经产生的写入需要先导出/回迁，不能直接丢弃。不要尝试把升级后的库交给旧代码，或把新版 Worker 原地降回 Wrangler。

## 本地验证

使用 `.dev.vars` 的开发测试值及 `bun run db:migrate:local`；这些值不提交 Git。浏览器验证也只对 localhost 写入。`blog.yasing.top` 仅用于读取现有样式和公开谱例；没有在生产发布内容、运行迁移或修改绑定。

已验证：

- Node 24 下 lint、格式、TypeScript、翻译完整性及未使用翻译检查通过。
- 94 个 Node 测试文件、741 项测试通过；20 个 Cloudflare 集成测试文件、274 项测试通过。
- 生产构建及 SSR chunk graph 检查通过；本地 30 个数据库迁移全部执行成功。
- 浏览器完成媒体上传、吉他谱解析/播放、Markdown 与富文本切换、吉他谱嵌入、文章保存/发布及重新读取验证；前台和后台在 390px 手机宽度及深色模式下无横向溢出。

Cloudflare CLI 在本次工作开始时未登录，因此生产资源盘点、真实数据副本验证和域名切换需在具备账号访问后完成。本地测试不能替代这三步。
