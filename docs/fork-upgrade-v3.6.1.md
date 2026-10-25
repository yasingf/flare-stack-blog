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

托管平台仍是 Cloudflare Workers，仍使用 D1、R2、KV 和 Queue。上游把 `wrangler.jsonc` 换成 `cloudflare.config.ts`，命令换成 `cf` CLI，要求 Node 24，推荐 Cloudflare Workers Builds 从 GitHub 构建；上游移除了旧的 GitHub Actions 部署文件；此 fork 已保留并改写 `.github/workflows/deploy.yml`，main 推送仍会自动执行检查、构建、迁移和部署，无需改用 Workers Builds。CI 也继续通过 GitHub Actions 运行。

特别注意：新版 Durable Objects 使用 exports 声明；同一个 Worker 一旦按此方式部署，不能直接回滚为旧的 Wrangler migrations 配置。`cf deploy` 保留机密，但不会保留未声明的普通文本运行时变量。因此不应直接在当前生产 Worker 上覆盖试运行。

## 不影响现有博客的上线顺序

1. 登录 Cloudflare，先核对当前 Worker、域名/Routes、D1、R2、KV、Queue、OAuth、Turnstile 及所有构建变量/运行时机密。把 `blog.yasing.top` 当前 Worker 的版本、资源绑定和现有配置保存下来。
2. 保存 D1 Time Travel bookmark、通过只读批量查询复制数据并备份 R2，确认副本可恢复。D1 的整库 export 会暂时阻塞查询，不能直接在要求持续可读的生产环境运行。创建独立的预览 Worker、D1、R2、KV、Queue；复制生产数据和 R2 文件。预览阶段禁止复用生产 D1、Queue、KV 和可写 R2，避免发信、缓存清理或媒体删除影响线上。
3. 预览 Worker 的构建环境设置独立的 `WORKER_NAME`、`D1_DATABASE_ID`、`BUCKET_NAME`、`KV_NAMESPACE_ID`、`QUEUE_NAME` ；预览构建时不设置 `DOMAIN`，避免误绑定正式域名。运行时 `DOMAIN` 和 `BETTER_AUTH_URL` 使用预览地址，原 OAuth/Turnstile 密钥在正式域名切换时复用。运行时变量统一设为机密。预览禁用真实邮件、Webhook 和分析数据上报。
4. 用 Node 24 和锁定依赖执行 `bun ci`、`bun run check`、翻译检查、两套测试、`bun run build`。核实 D1 ID 确实是副本后，才在预览环境执行 `bun run deploy`。完整环境变量说明见 [deployment.md](deployment.md)。旧 `wrangler:prepare`、`db:push` 和手工 slug 脚本不适用于此次生产升级。
5. 在预览域名逐项验证：文章、搜索、图片、旧链接、吉他谱播放/音轨/投稿/审核、两类评论、登录/头像、Markdown 与富文本保存、站点设置、邮件及站点地图。核对各表行数、关键内容和 `PRAGMA foreign_key_check`，并保留迁移日志。
6. 正式切换前，先完成最新数据同步。为保证评论、投稿和编辑不丢失，需要短暂冻结这些写入，保持旧站阅读可用；通过只读批量查询复制最终 D1、同步新增 R2 文件、离线迁移并在新库原子导入，随后核对。若要求写入也完全不中断，需要另做增量复制方案，不能直接让两套 schema 混写。
7. 准备新 Worker 的生产 `DOMAIN`、`BETTER_AUTH_URL` 和 OAuth 回调，保留原 `BETTER_AUTH_SECRET`。在新 Worker 健康检查通过后切换 `blog.yasing.top` 的路由/域名绑定；不要在试部署时提前抢占生产 Custom Domain。观察登录、文章/资源/短链接、评论和错误日志后再恢复写入。
8. 回退时把域名/路由指回旧 Worker 和原资源。旧 Worker、旧 D1、旧 R2 在观察期内保留；新站已经产生的写入需要先导出/回迁，不能直接丢弃。不要尝试把升级后的库交给旧代码，或把新版 Worker 原地降回 Wrangler。

## 本地验证

使用 `.dev.vars` 的开发测试值及 `bun run db:migrate:local`；这些值不提交 Git。内容创建/编辑的浏览器测试仅在 localhost 执行。正式切换前，`blog.yasing.top` 用于读取原主题与公开谱例；正式切换记录见下文。没有发布测试文章或评论到正式博客。

已验证：

- Node 24 下 lint、格式、TypeScript、翻译完整性及未使用翻译检查通过。
- 94 个 Node 测试文件、741 项测试通过；20 个 Cloudflare 集成测试文件、274 项测试通过。
- 生产构建及 SSR chunk graph 检查通过；本地 30 个数据库迁移全部执行成功。
- 浏览器完成媒体上传、吉他谱解析/播放、Markdown 与富文本切换、吉他谱嵌入、文章保存/发布及重新读取验证；前台和后台在 390px 手机宽度及深色模式下无横向溢出。

## 已建立的独立预览

原预览地址为 `https://my-blog-v361-preview.yasingfls.workers.dev`，现已提升为正式站 https://blog.yasing.top ，workers.dev 入口已关闭。Worker、D1、R2、KV、Queue 分别使用 `my-blog-v361-preview`、`blog-d1-v361-preview`、`blog-r2-v361-preview`、`blog-kv-v361-preview` 和 `blog-queue-v361-preview`。这些名称在提升为正式站后保持不变。

2026-10-25 已通过 Cloudflare 授权完成生产资源盘点、原 Worker 版本备份、D1 只读数据副本和 R2 备份。副本含 3 篇文章、5 首吉他谱、48 个媒体文件（15,733,158 字节）；全部媒体的 ETag 和大小一致，真实 D1 副本执行到第 30 个迁移后行数及外键检查通过。原评论为 2 条已发布和 1 条已删除，无待审核内容被公开。

预览禁用邮件、Webhook 和分析上报，清除了复制的会话/验证记录，并使用 `ENVIRONMENT=dev` 返回禁止收录的 robots.txt 和 X-Robots-Tag。这些限制仅用于预览阶段；最终切换时从原库重新同步了完整配置、会话和验证记录，恢复原有邮件/Webhook 设置，并将运行环境设为 `prod`。原 Worker 和原数据库继续保留，正式域名已切换。敏感备份仅保存在本地被 Git 忽略的 `.secrets/upgrade-2026-10-25/` 中，不提交仓库。

仓库原部署所用 Secrets 仍在 GitHub。CI 的手动运行新增 `upgrade_runtime` 选项，默认 `none` 仍执行完整检查；`preview` 或 `production` 仅通过 `scripts/sync-upgrade-runtime.ts` 为固定的独立升级 Worker 配置现有密钥，不迁移数据库、不修改域名，也不修改原 `my-blog` Worker。密钥只在 GitHub runner 与 Cloudflare 之间传递，不输出值、不上传 artifact。`production` 选项仅在最终同步和切换准备完成后使用。

## 正式切换记录（2026-10-26）

用户确认接受约 1–2 分钟暂停评论、投稿和编辑后，部署临时 `my-blog-upgrade-gate`：GET/HEAD 阅读请求仍由原 `my-blog` 服务，写入返回升级提示及 Retry-After。最终数据通过只读批量查询复制，在本地完成迁移与逐表替换演练后，原子导入升级 D1；外键检查通过，9 个预览缓存键清除。48 个 R2 文件的 ETag/大小再次逐一一致。新增的用户会话也已纳入最终副本，共 17 条会话记录。

`blog.yasing.top` 随后从只读入口切换到 `my-blog-v361-preview`，写入恢复。停写至完成初步健康检查合计约 92 秒，期间阅读保持可用。首页、文章、吉他谱、登录和会话接口、RSS、站点地图均为 HTTP 200，正式域名无 noindex；浏览器控制台无错误，多轨谱面及播放正常。GitHub 原有 BETTER_AUTH_SECRET、OAuth、Turnstile 和统计配置均通过受保护的工作流复用，未导出密钥值。

PR #1 已合并： https://github.com/yasingf/flare-stack-blog/pull/1 。原生产版本 `9e664997` 和 Cloudflare Worker 版本 `eaef2d70-a1ca-4525-82f9-9c140da58c56` 留作参考。原 `my-blog`、`blog-d1`、`blog-r2` 和 KV/Queue 未删除。只读入口目前不绑定正式域名。回退前必须保护升级后新产生的写入，再按上文回退流程处理。

自动部署固定使用升级资源：D1 `eb1a1370-c8cd-4180-a6a2-0eeb9b03e8c7`、KV `c9782cd037204c78884af8c189877ae0`、R2 `blog-r2-v361-preview`、Queue `blog-queue-v361-preview`。仓库原有资源 ID Secrets 保留用于识别旧资源，不再被新工作流用于部署，以免误改原库。
