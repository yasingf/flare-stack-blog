# 钢琴练习室

入口为 `/piano`，沿用博客的 default 主题、导航及深浅色设置。钢琴模块在浏览器按需加载，不把 OSMD、Web Audio 或 MIDI 解析器打进服务器渲染路径。后台主题和现有文章、吉他谱流程保持兼容。

## 看谱与练习

- 导入 `.mid`、`.midi`、`.xml`、`.musicxml`、`.mxl`，单文件上限 4 MB。XML 使用 MusicXML score-partwise；PDF 不支持。
- MusicXML 保留原谱排版信息、双手谱表和指法。点音符可补充指法、调整练习时的左右手归属；指法可下载为 MusicXML。左右手调整是本机练习设置，不改动原谱的谱表布局。
- MIDI 保留演奏时序、速度变化、力度和踏板，另外生成量化的参考五线谱；MIDI 本身通常没有指法、可靠的左右手分配或原版记谱信息。初始以中央 C 分手，可手工调整。保存 MIDI 到账号保存的是原始文件；本机标注请另行下载 MusicXML 备份。
- 支持谱面、瀑布流、组合视图；显示/隐藏指法、缩放、跟随滚动、88 键/适配音域。
- 听示范、等我弹对、节奏跟弹；分手、0.25–1.5 倍速、节拍器、预备拍、A–B 小节循环及输入延迟校准。
- “等我弹对”要求和弦所有键同时按住。节奏跟弹按音高和起音时机判断正确、偏早、偏晚、错音、漏音；不评判手型、真实指法、触键质量或完整的音乐表现。练习结果和易错小节保存在本机。
- “点谱解释”可读指法、谱号、升降号、拍号、连线、力度、踏板等；所有解释来自内置词典，不调用 AI。不能直接命中的记号也可从读谱面板查阅。
- 屏幕琴键可试弹，电脑键盘 A–K 对应 C4–C5，W/E/T/Y/U 为黑键，空格播放/暂停。输入框内不拦截快捷键。
- 支持常见反复与跳房子、延音线。装饰音、D.C./D.S./Coda 等复杂演奏指示会提示限制；复杂曲谱应先核对示范顺序。谱面排版失败时仍可使用瀑布流。

## MIDI 设备与音源

USB/系统 MIDI 使用 Web MIDI，直接蓝牙使用 BLE MIDI 标准服务。需要 HTTPS 和浏览器设备授权。推荐桌面 Chrome/Edge；蓝牙也可先在操作系统的 MIDI 工具中配对，再从“USB / 系统 MIDI”选择。macOS 可使用“音频 MIDI 设置 → MIDI 工作室 → 蓝牙”。浏览器、驱动和设备支持会影响连接；USB/BLE 字节解析有测试，真实钢琴硬件仍需实际连接验收。普通蓝牙音频连接不等于蓝牙 MIDI。

音源使用 University of Iowa Electronic Music Studios 的 **Steinway & Sons Model B** 真实采样，pp/mf/ff 三层力度、90 个压缩样本，合计约 5.4 MB。相邻音高以最近采样移调；这是轻量网页采样器，并非商业钢琴音源或 Steinway 官方产品。使用 `scripts/prepare-piano-samples.py` 和 ffmpeg 可重新生成资源；来源、授权及逐文件 SHA-256 位于 `public/piano/steinway/`。

- [采样来源](https://theremin.music.uiowa.edu/MISpiano.html)
- [Iowa 使用许可](https://theremin.music.uiowa.edu/MIS.html)
- [Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)

## 账号与私人曲库

未登录可使用本机曲库和全部本地练习功能。登录后可手动保存最多 50 首到个人账号，使用 D1 `piano_scores` 元数据和 R2 `piano-private/` 对象。读取与删除均检查所有者；旧公开媒体接口拒绝该前缀。R2 bucket 必须保持关闭 r2.dev 和自定义公开域名，不能给整个 bucket 添加绕过鉴权的公开代理。

浏览器本机曲谱使用 IndexedDB；标注、设置、练习历史使用 localStorage。清理浏览器数据会清除这些本机内容。账号保存不会自动公开曲谱，也不会导入博客公共媒体库。

## Cloudflare AI 与免费额度

AI 仅生成一次性的简介、粗略难度和练习建议；不用于实时跟弹。仅登录且验证邮箱的用户可生成。输入仅为曲名、作者及曲谱统计，原始 XML/MIDI 不发送给 AI。输出是纯文本；不声称知道创作背景、考级等级或精确指法。

- 固定模型：`@cf/qwen/qwen3-30b-a3b-fp8`，无其他模型或付费服务回退。
- 每账号每日 3 次，全站每日 50 次，北京时间 08:00 重置。单次输出上限 768 tokens，输入 JSON 上限 4,000 UTF-8 字节。
- 单个 SQLite Durable Object `piano-coach-v1` 原子预留次数，阻止并发超额；同一账号同一曲谱统计缓存复用，不再调用模型。失败不退款、不自动重试。
- 已保存建议可跨设备读取，即使当天额度已用完或 AI 关闭。
- 按每次 100 Neurons 保守预留，站内最多预留 5,000 Neurons/日；截至 2026-10-26 官方 Workers AI 免费额度为账户共享的 10,000 Neurons/日。其他应用也可能使用这个额度，因此这不是“账户剩余量”。上游返回配额错误或单次实际用量超出预留时，停止当天新生成。
- 部署前 `scripts/piano-ai-free-plan.ts` 通过 `cf accounts subscriptions get` 检查账户。只有能确认没有 Workers 付费订阅才设置 `PIANO_AI_ENABLED=true` 并建立 AI binding；无法读取订阅时关闭 AI，其他功能仍可部署。不能把该开关用于 Workers Paid 来承诺零费用。若以后升级账户套餐，应先关闭这个开关并重新核查预算。
- 本地开发及测试默认不建立 AI binding；集成测试使用模拟模型，不消耗额度。

[Cloudflare 免费额度与计费](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [模型及 Neurons 单价](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)

## 部署与验证

使用仓库现有 Node 24/Bun 和 `cf` 部署流程。迁移 `0030_piano_scores.sql` 仅增加个人曲库表及索引，不改写文章、用户、吉他谱或既有数据；Drizzle snapshot/journal 同步更新。新增 `PianoCoach` 导出使用 SQLite Durable Object。不要删除既有 Durable Object 导出或改回旧 Wrangler migrations 部署配置。

验证命令：`bun run check`、`bun run test:node`、`bun run test`、`bun run build`。专门测试覆盖 MIDI/MusicXML 解析、指法、延音线、反复跳房子、和弦按键、节奏容差、BLE running status、账号所有权、公开媒体隔离以及 AI 并发配额/缓存。浏览器验收包含导入、采样播放、错音/正确反馈、点谱解释、手机布局和深色模式。

## 上线记录（2026-10-26）

[PR #2](https://github.com/yasingf/flare-stack-blog/pull/2) 已合并为 `6f381e16`；[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40216994090) 和[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40217465771) 均通过，753 项 Node 测试、280 项 Cloudflare 集成测试通过。正式入口为 https://blog.yasing.top/piano 。0030 迁移已执行，发布前的 D1 恢复点和 Worker 版本记录保存在被 Git 忽略的 `.secrets/piano-2026-10-26/`。

自动部署凭据未能读取订阅信息，因此首次发布按保护规则关闭 AI。随后使用用户已授权的 Cloudflare OAuth 再次确认没有 Workers 付费订阅，使用相同提交、相同公开构建变量和生产资源重新构建，启用 AI。最终 Worker 版本为 `df0b4ae6-bae7-4577-9a08-ec0cb44bf65c`，AI binding 和 `PIANO_AI_ENABLED=true` 已核对，原有 14 个运行时机密均保留。已有页面缓存已刷新，首页、文章、吉他谱、登录、后台入口、会话、RSS、站点地图、钢琴页面和采样资源均返回 200；正式站示范播放及“错音不前进、正确才推进”已在浏览器验证。

后续 GitHub 自动部署若仍无法核验套餐，会再次关闭 AI；需要让部署凭据具备订阅读取能力，或沿用经 OAuth 核验免费套餐后启用的流程。不要绕过保护直接写死开关。真实 USB/BLE 钢琴尚未连接验收；用户提供的《富士山下》卷已卸载，整曲验收和导入待重新挂载后补做。
