# 钢琴练习室

入口为 `/piano`，沿用博客的 default 主题、导航及深浅色设置。看谱和音频模块在浏览器按需加载；服务器只使用轻量 MIDI/XML 校验器处理共享上传。后台主题和现有文章、吉他谱流程保持兼容。

## 看谱与练习

- 导入 `.mid`、`.midi`、`.xml`、`.musicxml`、`.mxl`，单文件上限 4 MB。XML 使用 MusicXML score-partwise；PDF 不支持。
- MusicXML 保留原谱排版信息、双手谱表和指法。点音符可补充指法、调整练习时的左右手归属；指法可下载为 MusicXML。左右手调整是本机练习设置，不改动原谱的谱表布局。
- MIDI 保留演奏时序、速度变化、力度和踏板，另外生成量化的参考五线谱；MIDI 本身通常没有指法、可靠的左右手分配或原版记谱信息。初始以中央 C 分手，可手工调整。保存 MIDI 到账号保存的是原始文件；本机标注请另行下载 MusicXML 备份。
- 默认“曲谱 + 琴键指法”，另有纯谱面、瀑布流、谱面 + 瀑布流；显示/隐藏指法、缩放、跟随滚动、88 键/适配音域。
- 听示范、等我弹对、节奏跟弹；分手、0.25–1.5 倍速、节拍器、预备拍、A–B 小节循环及输入延迟校准。
- 左手／双手／右手直接显示为按钮，全屏时仍保留在主控制条；听示范时只播放选定手，跟弹时沿用所选手练习、另一手伴奏的设置。
- 底部常驻小节与循环控制：前后小节、输入编号跳转、速选网格；编号按演奏顺序排列，反复段另标原谱编号。暂停时跳转也会让谱面跟随。跳出当前循环段会关闭循环并暂停。
- A–B 可输入、在当前位置设置 A/B、网格两次点选（支持反向和单小节），或从当前小节选取 2／4／8 小节。选择循环段会暂停并回到 A；打开速选会自动滚至当前小节，Esc 可关闭。数字输入提交时才校验，不打断多位数编辑。
- 进度条在开启循环后放大到 A–B 段，并显示该段用时；拖动时预览小节，松手定位，保留拖动前的播放／暂停状态。续播不重复预备拍；拖到末尾或取消拖动会停住，不自动重播。
- “等我弹对”要求和弦所有键同时按住。节奏跟弹按音高和起音时机判断正确、偏早、偏晚、错音、漏音；不评判手型、真实指法、触键质量或完整的音乐表现。练习结果和易错小节保存在本机。
- “点谱解释”可读指法、谱号、升降号、拍号、连线、力度、踏板等；所有解释来自内置词典，不调用 AI。不能直接命中的记号也可从读谱面板查阅。
- 屏幕琴键可试弹，电脑键盘 A–K 对应 C4–C5，W/E/T/Y/U 为黑键，空格播放/暂停。输入框、按钮及链接内不拦截快捷键。
- 延音踏板支持 MIDI CC64、屏幕切换按钮和按住 Shift；同时显示谱面踏板与当前实际踏板。MIDI 导出的参考谱包含踏板记号，MusicXML 的换踏板会先释放再踩下。示范与伴奏延音在 A–B 结束处停止。
- 踏板按钮、实际踩踏状态和谱面要求常驻练习底栏，所有全屏视图均显示；谱子未包含踏板信息时明确提示“未标记”。焦点在播放等按钮上时仍可按住 Shift 踩踏，编辑输入框不会误触发或释放踏板。
- 全屏保留当前视图，收起标题、曲库、设置与侧栏，保留紧凑的播放、进度和退出入口；设置和符号解释按需展开，也可切换瀑布流。手机进入时请求横屏；无法锁定方向时把练习区旋转为横向，退出后恢复。浏览器不支持系统全屏时使用铺满窗口的模式，支持 Esc 退出、焦点循环和恢复页面滚动。
- 每行最多四个小节，窄屏自动减少到一至三个。全屏按可用宽高重新排版；瀑布流画布和琴键独立适配宽高。动画以 requestAnimationFrame 跟随显示器刷新率，控制面板降低更新频率；可见音符用二分查找定位，谱面高亮只在和弦变化时更新。
- 琴键 SVG 使用实际容器像素尺寸排布，指法和音名以真实字号渲染，边框不随画布缩放；全屏与横向旋转不会把文字横向或纵向拉伸。
- 手机竖屏进入钢琴页显示“横屏练琴体验更佳，请旋转手机”；方向变化实时更新，横屏自动收起，也可手动关闭。
- 支持常见反复与跳房子、延音线。装饰音、D.C./D.S./Coda 等复杂演奏指示会提示限制；复杂曲谱应先核对示范顺序。谱面排版失败时仍可使用瀑布流。

## MIDI 设备与音源

USB/系统 MIDI 使用 Web MIDI，直接蓝牙使用 BLE MIDI 标准服务。需要 HTTPS 和浏览器设备授权。推荐桌面 Chrome/Edge；蓝牙也可先在操作系统的 MIDI 工具中配对，再从“USB / 系统 MIDI”选择。macOS 可使用“音频 MIDI 设置 → MIDI 工作室 → 蓝牙”。浏览器、驱动和设备支持会影响连接；USB/BLE 字节解析有测试，真实钢琴硬件仍需实际连接验收。普通蓝牙音频连接不等于蓝牙 MIDI。

音源使用 University of Iowa Electronic Music Studios 的 **Steinway & Sons Model B** 真实采样，pp/mf/ff 三层力度、90 个压缩样本，合计约 5.4 MB。相邻音高以最近采样移调；这是轻量网页采样器，并非商业钢琴音源或 Steinway 官方产品。使用 `scripts/prepare-piano-samples.py` 和 ffmpeg 可重新生成资源；来源、授权及逐文件 SHA-256 位于 `public/piano/steinway/`。

- [采样来源](https://theremin.music.uiowa.edu/MISpiano.html)
- [Iowa 使用许可](https://theremin.music.uiowa.edu/MIS.html)
- [Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)

## 共享曲库、后台与本机使用

注册用户可以在共享曲库上传，立即全站公开，无审核。单文件 4 MB，支持 MIDI / MusicXML / MXL，压缩谱展开总量不得超过 8 MB，最多 16000 个音符。服务端检查实际格式；每账号共 50 首，每小时最多 10 次上传。公开链接为 `/piano?score=<id>`，所有人可直接打开练习。上传者可编辑自己曲谱的标题、作曲者并删除；管理员可编辑或删除全部共享谱。

后台 `/admin/piano` 提供上传、搜索、分页、信息编辑、删除和存储用量。钢琴谱字节数来自 D1 元数据；“刷新整个存储桶用量”逐页读取当前 R2 对象大小，统计含图片和吉他谱的博客文件总量。它不包括数据库、KV、静态采样或账号其他 bucket，不等于计费账单。只有管理员登录时，桌面导航、手机菜单及个人资料才显示后台入口；自定义导航中的后台链接也受此限制，服务端仍校验管理员身份。

未登录可使用本机曲库和全部本地练习功能。站内不再提供私人云曲库；所有历史账号曲谱与新上传曲谱均可公开读取。D1 `piano_scores` 记录上传者，编辑与删除限上传者或管理员。为兼容历史文件继续使用 R2 `piano-private/` 键，但它不再表示曲谱可见性；公开读取由曲谱接口按存在的元数据提供，旧图片接口仍拒绝该前缀，避免把原始 XML 作为活动页面提供。

浏览器本机曲谱使用 IndexedDB；标注、设置、练习历史使用 localStorage。清理浏览器数据会清除这些本机内容。本机导入无需登录，不自动上传；登录后“上传并共享”才会发布到全站曲库。

迁移 `0031` 增加 `composer`，公开查询包含全部历史曲谱，无需移动文件。旧版私人上传接口返回刷新提示，不能绕过共享协议继续上传；同一用户重复上传相同内容复用原文件。

`/piano-sharing-terms` 为非营利练琴互助的共享协议，明确分享权限、公开范围、有限许可、撤回、权利反馈和各方责任，不将“学习用途”或“非营利”作为自动免责。首次上传前需主动勾选；`0033` 的 `piano_sharing_consents` 保存账号、版本及服务器时间。服务端在每次上传时检查同意记录，同一账号跨设备只确认一次，历史文件不伪造同意记录。权利反馈邮箱沿用站点公开联系邮箱。

## 登录可用性

迁移 `0032` 添加通行密钥表。用户在个人资料绑定设备，在登录页用通行密钥登录；无需 Turnstile。采用 Better Auth Passkey / WebAuthn，限定站点 origin 和 RP ID，并在服务端要求设备用户验证。首次绑定需要近期登录，原有密码/GitHub 登录方式保留。浏览器虚拟认证器已验证绑定和登录；真实设备体验仍取决于系统支持。

认证表单通过服务端 `/api/auth/verification` 按 Workers 的 `request.cf.country` 分流：`CN` 使用同站托管的开源 ALTCHA，其他地区使用 Turnstile。不是根据可伪造的国家请求头、语言或前端参数决定。ALTCHA 只在大陆分支按需加载，使用 PBKDF2 工作量证明、签名、5 分钟过期、IP 绑定和 Durable Object 原子防重放；不调用付费 Sentinel、外部 API 或 AI。认证限流在验证之前执行。登录、注册、找回密码和重发验证邮件使用该策略，通行密钥在所有地区可用。

Turnstile 脚本加载超时/失败、挑战过期均展示提示和重试；密码登录按钮可点击并解释等待原因，不会静默灰住。验证失败时服务端仍拒绝登录。Cloudflare 的[大陆支持说明](https://developers.cloudflare.com/china-network/faq/)与 [ALTCHA 服务端集成](https://altcha.org/docs/integration/server/)是此次分流依据。未声称实测中国大陆运营商网络。

## Cloudflare AI 与免费额度

AI 仅生成一次性的简介、粗略难度和练习建议；不用于实时跟弹。仅登录且验证邮箱的用户可生成。输入仅为曲名、作者及曲谱统计，原始 XML/MIDI 不发送给 AI。输出是纯文本；不声称知道创作背景、考级等级或精确指法。

- Anthropic Haiku/Sonnet 经 AI Gateway 仍需额外付费，不使用 Workers AI 的免费 Neurons；本站不启用付费模型。
- 固定模型：`@cf/qwen/qwen3-30b-a3b-fp8`，无其他模型或付费服务回退。
- 每账号每日 10 次，全站每日最多 160 次，北京时间 08:00 重置。单次输出上限 768 tokens，输入 JSON 上限 4,000 UTF-8 字节。
- 单个 SQLite Durable Object `piano-coach-v1` 原子预留次数，阻止并发超额；相同曲谱统计在全站复用缓存（历史个人缓存仍可读取），不再调用模型。失败不退款、不自动重试。
- 已保存建议可跨设备读取，即使当天额度已用完或 AI 关闭。
- 按每次 50 Neurons 保守预留，站内最多预留 8,000 Neurons/日；截至 2026-10-26 官方 Workers AI 免费额度为账户共享的 10,000 Neurons/日。其他应用也可能使用这个额度，因此这不是“账户剩余量”。上游返回配额错误或单次实际用量超出预留时，停止当天新生成。
- 部署前 `scripts/piano-ai-free-plan.ts` 通过 `cf accounts subscriptions get` 检查账户。只有能确认没有 Workers 付费订阅才设置 `PIANO_AI_ENABLED=true` 并建立 AI binding；无法读取订阅时关闭 AI，其他功能仍可部署。不能把该开关用于 Workers Paid 来承诺零费用。若以后升级账户套餐，应先关闭这个开关并重新核查预算。
- 本地开发及测试默认不建立 AI binding；集成测试使用模拟模型，不消耗额度。

[Cloudflare 免费额度与计费](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [模型及 Neurons 单价](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)

## GoatCounter 统计

保留原 Umami 浏览器埋点，同时接入 `https://yasing.goatcounter.com`。后台热门文章和每日排名同步优先查询 GoatCounter；没有配置 GoatCounter 的其他部署仍可使用 Umami。`VITE_GOATCOUNTER_SITE` 是公开构建变量，`GOATCOUNTER_SITE` 是服务端地址，`GOATCOUNTER_API_TOKEN` 仅以 Worker secret 保存，不能放入 VITE 变量或提交仓库。

前台首次访问与 SPA 路由变化各记录一次，忽略查询参数、锚点和登录/账号页面；后台不加载统计脚本。API 读取前 30 个完整 UTC 日的各路径访问次数，分页遵守每秒 4 次限制，失败时保留原排名。GoatCounter 的 `count` 是访问次数，和原 Umami 的浏览量口径不同；后台已标明来源。新账号不含历史 Umami 数据，当天访问从次日完整日期窗口开始进入排名。

[GoatCounter API](https://www.goatcounter.com/help/api) · [SPA 接入](https://www.goatcounter.com/help/spa) · [Cloudflare AI Gateway 计费](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)

本 fork 按站主要求保留旧主题及 Umami 埋点，并改用 GoatCounter 查询；这覆盖上游 ADR 0012/0021 的 Fuwari 外观选择和 ADR 0016 的“只使用 Umami”约束。

## 部署与验证

使用仓库现有 Node 24/Bun 和 `cf` 部署流程。迁移 `0030_piano_scores.sql` 仅增加个人曲库表及索引，不改写文章、用户、吉他谱或既有数据；Drizzle snapshot/journal 同步更新。新增 `PianoCoach` 导出使用 SQLite Durable Object。不要删除既有 Durable Object 导出或改回旧 Wrangler migrations 部署配置。

验证命令：`bun run check`、`bun run test:node`、`bun run test`、`bun run build`。专门测试覆盖 MIDI/MusicXML 解析、指法、延音线、反复跳房子、和弦按键、节奏容差、BLE running status、账号所有权、公开媒体隔离以及 AI 并发配额/缓存。浏览器验收包含导入、采样播放、错音/正确反馈、点谱解释、手机布局和深色模式。

2026-10-26 布局复测使用《富士山下》85 小节指法踏板版，覆盖 1200×693、844×390、390×844 的曲谱加琴键、瀑布流及组合视图：练习区、琴键均位于可视范围内，谱面水平溢出为 0。踏板原生线条可点击或按 Enter 解释。长谱高亮改为独立覆盖层，旧主题的全站 CSS scope 改为稳定根节点，避免高亮触发整张 SVG 样式重算。开发环境桌面瀑布流实测约 60 FPS；手机尺寸加 4 倍 CPU 降速的组合视图平均约 45 FPS（8 秒采样），此前约 20 FPS。该数据不是所有设备的帧率保证，120 Hz 实机和真实 MIDI 硬件仍需单独验收。

## 上线记录（2026-10-26）

[PR #2](https://github.com/yasingf/flare-stack-blog/pull/2) 已合并为 `6f381e16`；[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40216994090) 和[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40217465771) 均通过，753 项 Node 测试、280 项 Cloudflare 集成测试通过。正式入口为 https://blog.yasing.top/piano 。0030 迁移已执行，发布前的 D1 恢复点和 Worker 版本记录保存在被 Git 忽略的 `.secrets/piano-2026-10-26/`。

自动部署凭据未能读取订阅信息，因此首次发布按保护规则关闭 AI。随后使用用户已授权的 Cloudflare OAuth 再次确认没有 Workers 付费订阅，使用相同提交、相同公开构建变量和生产资源重新构建，启用 AI。最终 Worker 版本为 `df0b4ae6-bae7-4577-9a08-ec0cb44bf65c`，AI binding 和 `PIANO_AI_ENABLED=true` 已核对，原有 14 个运行时机密均保留。已有页面缓存已刷新，首页、文章、吉他谱、登录、后台入口、会话、RSS、站点地图、钢琴页面和采样资源均返回 200；正式站示范播放及“错音不前进、正确才推进”已在浏览器验证。

后续 GitHub 自动部署若仍无法核验套餐，会再次关闭 AI；需要让部署凭据具备订阅读取能力，或沿用经 OAuth 核验免费套餐后启用的流程。不要绕过保护直接写死开关。真实 USB/BLE 钢琴尚未连接验收。用户提供的《富士山下》卷重新挂载后，已补测 MIDI 和带指法踏板的 MusicXML：85 小节、985 个谱面音符、903 处指法，手机横屏全屏与退出正常；文件仅用于本机验收，未发布到生产共享曲库。

### 共享曲库与登录更新（2026-10-26）

[PR #3](https://github.com/yasingf/flare-stack-blog/pull/3) 已合并为 `d4b75f7c`，[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40268421754) 和[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40269014055) 均通过。生产已执行 `0031`–`0033`，共享曲库、管理页、一次性协议授权、通行密钥及地区验证上线。原生产曲谱库为空，无历史文件迁移或伪造同意记录。

再次通过 OAuth 核验 Workers Free 后，使用同一代码和生产资源恢复预算内 AI；最终 Worker 版本为 `e41c7d84-76d4-4250-b513-3a33ba08e0db`，AI binding 与 `PIANO_AI_ENABLED=true` 已核对，14 个运行时机密均保留。数据库恢复点、发布前后版本信息位于被忽略的 `.secrets/piano-shared-2026-10-26/`。相关页面缓存已刷新，正式站手机方向提示、844×390 横向练习区、全屏退出、协议页和通行密钥入口已通过浏览器验收，无页面脚本错误。首次上传需同意协议，刷新后不再重复确认的流程已在本地注册账号验证。

### 看谱缩放、性能与 GoatCounter（2026-10-26）

[PR #4](https://github.com/yasingf/flare-stack-blog/pull/4) 合并为 `fa234368`，[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40275087378) 与[正式部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40275673543) 均通过，760 项 Node 测试、284 项 Cloudflare 集成测试通过，无新增数据库迁移。

自动部署后沿用 OAuth 免费套餐核验流程恢复 AI；最终 Worker 版本为 `441a2782-a166-4b7f-976c-38f31025c825`。15 个运行时机密（含 GoatCounter 只读 Token）均保留，AI binding、预算开关和 GoatCounter 地址已核对。发布前恢复点与版本记录位于被忽略的 `.secrets/piano-performance-2026-10-26/`；18 个公开页面缓存已清理。

线上使用同一 MusicXML 验证默认曲谱加琴键模式、每行至多四小节、22 组原生踏板解释目标、手机竖屏自动横向全屏和零水平溢出。生产瀑布流实测 60 FPS，页面脚本错误为 0。Umami 的 `/stats.js`、`/api/send` 与 GoatCounter 的脚本及计数请求均返回 200；新服务端客户端读取 GoatCounter API 成功，当前完整日期窗口暂无数据。匿名页面无后台链接，直接访问后台转到登录；首页、文章、吉他谱、登录、协议、RSS、站点地图和钢琴采样健康检查全部通过。用户提供的曲谱仅作本机测试，未发布到共享曲库。

### 小节导航、A–B 循环与播放控制（2026-10-26）

[PR #5](https://github.com/yasingf/flare-stack-blog/pull/5) 合并为 `52b11f20`，[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40280964935) 和[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40281678958) 均通过，764 项 Node 测试、284 项 Cloudflare 集成测试通过。新增测试覆盖拖动后的无预备拍续播、终点停播、异步音源取消和听示范分手播放；无数据库迁移。

按 OAuth 免费套餐核验流程完成最终发布，Worker 版本为 `b3b5925b-4b45-430e-81e1-c67c3aacabd5`，15 个运行时机密保留，AI binding、免费额度开关及 GoatCounter 地址已核对。发布前恢复点、版本信息与健康检查保存于被忽略的 `.secrets/piano-controls-2026-10-26/`；18 个页面缓存已刷新，13 个页面及资源检查通过。

正式站用同一 85 小节 MusicXML 验证全屏左右手按钮、多位数字输入、反向点选 A/B、跳出循环、小节末尾预设、拖动续播／取消和循环终点停在 B。1200×693、844×390、390×844 的控制条、速选面板和琴键均在可视范围内，页面脚本错误为 0。另在本地验证旋转后的进度拖动、暂停时进出全屏保持小节，新增控制条下瀑布流实测约 60 FPS。曲谱仍仅用于本机验收。

### 全屏踏板与琴键清晰度（2026-10-26）

[PR #6](https://github.com/yasingf/flare-stack-blog/pull/6) 合并为 `5e7a8a53`，[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40285885039) 和[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40286685633) 通过。全屏原先隐藏踏板控制条且按钮焦点会屏蔽 Shift，现已改为常驻底栏并修复键盘处理；琴键从固定 SVG 非等比拉伸改为实际像素排布。

经 OAuth 核验 Workers Free 后的最终版本为 `b1447547-0f75-40ba-94ea-5f64b0f69db0`，15 个机密及 AI binding 保留，18 个页面缓存已刷新，13 项线上健康检查通过。恢复点与版本信息位于被忽略的 `.secrets/piano-pedal-2026-10-26/`。正式站四种视图、四种窗口尺寸验证踏板可见与 Shift 操作，琴键两个方向缩放系数均为 1；本地额外验证 2 倍像素密度下的窗口全屏，无文字比例变化。

## 管理员曲谱文章草稿（2026-10-26）

`/admin/piano` 新增“管理员上传时自动生成草稿”开关，默认开启，只影响管理员上传。普通注册用户共享曲谱不调用 AI。每张曲谱卡片可以手动生成、查看状态、重试失败任务或进入现有文章编辑器；已生成的文章不会因重复上传或队列重复投递而被覆盖。删除文章后可以手动重新生成。文章始终以 `draft` 保存，管理员核对资料后自行发布；发布继续使用现有公开快照、搜索索引和 sitemap 流程。

资料检索使用 MusicBrainz 的作品、录音与署名关系，排除现场录音及明确的合辑/现场/混音专辑。同名条目不能唯一确认时保留待核实提示，可填写演唱／演奏者帮助检索；多个翻唱版本只在唯一作品关系核实后选用参考录音，并注明版本。维基百科只获取限定域名的文字摘要，排除消歧义页，专辑页面只提供相关段落。乐曲主题必须带有可在来源中逐字找到的证据，否则标注待补充。AI 简介、主题与练习建议仍需人工核对，来源链接随草稿保存。上传者填写的作曲者不会冒充数据库核实的署名。

模型为 `@cf/qwen/qwen3-30b-a3b-fp8`，输入最多 12,000 UTF-8 字节，输出最多 2,500 tokens。每次预留 150 Neurons（包含失败），全站文章最多 20 次/天、每位管理员最多 10 次/天，与练习建议共用同一个 Durable Object 的 8,000 Neurons 日预算；不使用付费备用模型，不自动重试 AI 请求。内容与统计一致的成功结果缓存 7 天。MusicBrainz 请求在该对象内串行并持久记录间隔，遵守每秒最多一次的限制。两次真实 Workers AI 验证分别使用约 9.37 和 10.45 Neurons，作为质量与接口验证，不代表所有乐曲的固定用量。

任务通过既有队列的 `PIANO_ARTICLE` 消息异步执行；每次生成有独立请求 ID。消费前检查状态，生成前及写入草稿时重新检查管理员身份，D1 事务原子写入文章和任务关联，过期任务不会覆盖新任务。运行超过 5 分钟可手动重试。AI 不可用或任务失败不影响已经成功共享的曲谱。迁移 `0034_ancient_galactus.sql` 只新增设置与任务关联两张表，不改写既有文章或曲谱。

### 文章草稿功能上线验收

[PR #7](https://github.com/yasingf/flare-stack-blog/pull/7) 合并为 `bbd50ae9`；[CI](https://github.com/yasingf/flare-stack-blog/actions/runs/40292750697) 与[自动部署](https://github.com/yasingf/flare-stack-blog/actions/runs/40293579485) 均成功，770 项 Node 测试、291 项 Cloudflare 集成测试通过。迁移 0034 已执行。经 OAuth 再次确认 Workers Free 后，最终 Worker 版本为 `77a45ae2-f1ef-49ca-b2a2-9581408d9817`，15 个运行时机密均保留，AI binding 和预算开关启用。发布前恢复点、配置核对、队列结果及健康检查保存于被忽略的 `.secrets/piano-articles-2026-10-26/`。

正式站 13 项页面/资源健康检查通过，两个文章管理读取接口对匿名请求均返回 401。用已共享、由管理员拥有的《富士山下》执行一次真实队列任务，生成文章 #5，状态为 `draft`，`published_at` 与 `public_slug` 均为 NULL。现有公开曲谱保持原文件；该文件有 903 处指法但没有踏板标记，因此练习室显示“谱面踏板：未标记”，可自行使用踏板控制。

首轮真实草稿核对发现 Workers 不接受 `redirect: "error"`，导致两个资料来源在请求构造阶段失败。改为 `manual` 并拒绝非成功状态，仍不跟随外部重定向；新增真实 workerd Request 解析回归测试，并更新文章缓存版本以免复用缺少来源的结果。修复后在 workerd 中实际请求 MusicBrainz 与维基百科均取得有效 JSON；外部服务偶发不可用仍按待核实处理。首份资料不完整的生成草稿将在核对无人工修改后重新生成。
