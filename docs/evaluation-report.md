# 鲲鹏の博客 量化评估报告（2026-09-17）

本报告是对当前仓库（基线提交 `b1a04d7`，`main` 分支）的一次独立、多维度量化评估。
结论只依据本次实测输出与源码行号，不沿用仓库内既有结论；每条结论标注证据类型：

- **实测（A）**：本次运行命令/脚本得到的原始输出，可复现。
- **代码（B）**：源码 `文件:行`，可核对。
- **推断（C）**：无法直接验证的判断，已显式标注。

临时进度记录与原始产物在 `.research/eval/`（本地研究目录，已被 `.gitignore` 忽略），
本报告只保留可长期使用的结论与口径。评估过程未修改任何受版本控制的文件
（`git status` 为空，8 个主页壁纸与 `HEAD` 逐字节一致）。

---

## 一、总分与维度得分

满分 100，按维度加权。**修复前 81.7 / 100 → 修复后 89.7 / 100**（各维度的修复项与复验证据见
第四节；本节分数为修复后的当前状态，括号内为修复前）。

| 维度 | 权重 | 得分 | 档位 | 主要证据来源 |
|---|---|---|---|---|
| D1 后端架构与代码质量 | 12 | **88**（84） | 扎实，有结构性缺口 | 独立子评估（代码 + 运行） |
| D2 API 契约与数据模型 | 8 | **87**（78） | 扎实，契约有明显缺口 | 独立子评估 |
| D3 安全防护 | 16 | **88**（79） | 无高危，但存在可用性型缺陷 | 独立对抗性渗透（本报告作者交叉复现） |
| D4 前端设计与视觉体系 | 12 | **89**（82） | 体系完整，hero 可读性与细节需收紧 | 令牌审计 + 像素级对比度 + 源码 |
| D5 可用性与可访问性 | 10 | **93**（79） | 键盘/语义强，但首屏文本对比度不合格 | axe-core + 像素级对比度 + 真实键盘遍历 |
| D6 性能与前端效率 | 10 | **89**（79） | 服务端优秀，传输层与单页有真实缺陷 | 本地生产构建 + CDP 实测 |
| D7 SEO 与元数据 | 6 | **91**（84） | 强，少量语义/状态码问题 | 18 条路由元数据实测 |
| D8 测试与质量保障 | 10 | **86**（80） | 断言质量高，覆盖有真实空洞 | 实际运行完整检查链 |
| D9 运维与可部署性 | 8 | **86**（66） | 存在真实缺陷（最低维度） | 故障注入实测 |
| D10 文档与可维护性 | 4 | **92**（84） | 新鲜、可执行，个别描述失真 | 全量文档核对 |
| D11 产品完整度与内容体验 | 4 | **86**（81） | 闭环完整，个别能力缺失 | 页面/接口实测 |

> 修复前：`(84×12 + 78×8 + 79×16 + 82×12 + 79×10 + 79×10 + 84×6 + 80×10 + 66×8 + 84×4 + 81×4) / 100 = 81.7`
> 修复后：`(88×12 + 87×8 + 88×16 + 89×12 + 93×10 + 89×10 + 91×6 + 86×10 + 86×8 + 92×4 + 86×4) / 100 = 89.7`

> D5 的判定依据「实测到的缺陷」而非「未测到的部分」：键盘可达性与焦点可见性、区域/命名/语言语义、
> 横向溢出、reduced-motion 都经实测通过；扣分来自首屏文本在壁纸上的像素级对比度不达标（见 F1）。

每条维度的原始证据（脚本、JSON、截图、原始日志）都在本地 `.research/eval/` 下，不进版本库：

| 证据包 | 内容 |
|---|---|
| `.research/eval/live-probe.{mjs,json}` | 18 条页面 + 40 条 API 的头部、缓存、元数据、错误信封、边界输入 |
| `.research/eval/authz-probe.{mjs,json}` | 匿名 / 普通用户 / 管理员 × 30 端点的授权矩阵 |
| `.research/eval/api-bench.{mjs,json}` | 端点延迟分位、1/8/32 并发、SSR 耗时、真实压缩率 |
| `.research/eval/browser-probe.mjs`、`focus-probe.mjs` | LCP/CLS/TBT、资源体积、键盘遍历、reduced-motion、横向溢出 |
| `.research/eval/backend.md`、`backend-tools/` | 后端架构/契约/数据模型/测试的完整证据与三张比对表 |
| `.research/eval/security.md`、`sec-d3/` | 对抗性渗透的 13 条发现、原始响应与复现命令 |
| `.research/eval/frontend.md`、`frontend-tools/` | 令牌审计、56 次 axe 运行、像素级对比度、DOM 审计 |
| `.research/eval/check-full.log`、`check-final.log` | 完整检查链（`npm run check`）的原始输出，退出码 0 |

工具口径：渗透测试与后端审计各自在**隔离数据库 + 独立端口**上启动生产模式实例，
不触碰 `prisma/dev.db`、`backups/` 与任何受版本控制的文件。

### 一句话结论

这是一个**工程纪律明显高于个人博客平均水平**的项目：Web/API 边界是真的、零 `any`、
零循环依赖、测试断言质量高、限流/同源/JWT/Cookie 等安全控制在对抗性测试下全部守住、
构建与检查链在 CI 上端到端跑通。

首轮评估发现四类实质缺陷，**均已在同一轮修复并用实测复验**：

1. **健康检查与启动校验会说谎** → 探针改查 `_prisma_migrations`，空库返回 503；
   启动期强制校验 `JWT_SECRET`/`SITE_URL`，非法直接退出；
2. **首屏文本在壁纸上的对比度不合格** → 压暗层加强 + 文字改为不透明，
   像素级实测由 1.6–2.4:1 提升到 4.5:1 以上（并顺带修掉一个更严重的真实缺陷：
   CSS 组件类的优先级覆盖了 Tailwind 工具类，导致 hero 上的导航一直是深色文字）；
3. **契约与请求校验不完整** → 统一 `requestBody()` 守卫（缺失/非对象体 400）、
   OpenAPI 重复键消除并改为严格的自身解析器、补齐 23 处 403/429 与 `q` 参数；
4. **限流配置在真实部署形态下反而制造可用性事故** → 登录失败桶不再锁死正确密码、
   `x-forwarded-for` 明确拒绝、未开代理信任时启动警告。

修复后 `npm run check` 端到端仍然全绿（lint、类型检查、114 个测试、文档、契约、浏览器冒烟）。

---

## 二、本轮修复与复验证据

下表每一行都是「修复 → 复验」的成对记录：修复前现象取自第一轮评估，复验证据取自修复后在同构实例上的重新测量。
涉及运行时的项都在**生产模式 + 隔离数据库**下复验，不依赖 mock。

### 后端与运维

| # | 修复 | 复验证据 |
|---|---|---|
| 1 | 健康探针改查 `_prisma_migrations`（`health-service.ts`） | 空库文件：`GET /health` → **503 degraded**（修复前 200 ok，而数据端点 500）；已迁移库 → 200 ok；目录不存在 → 503 |
| 2 | 启动期配置校验 + 优雅关闭（`index.ts`） | `JWT_SECRET` 非法时 stderr 打印原因并 `exit 1`；SIGTERM 日志出现「开始优雅关闭 / 已关闭 HTTP 服务与数据库连接」；未开 `TRUST_PROXY` 时打印全站单桶警告 |
| 3 | 登录失败桶不再锁死正确密码（`routes/auth.ts`） | 回归测试：10 次错误密码后**正确密码仍 200**（修复前 429），失败计数在成功登录后清零 |
| 4 | 统一请求体守卫 `requestBody()`（`http.ts` + 6 个路由） | 回归测试：无 body / `null` body / 非对象 body 的 8 个写端点全部 **400 BAD_REQUEST**（修复前 500） |
| 5 | `x-forwarded-for` 明确拒绝（`request-guard.ts`） | 单测：配置为 xff 时身份返回 `unsupported-proxy-header` 并记录警告；伪造头不再能自选限流桶 |
| 6 | 响应压缩（`server/compression.ts`） | `/api/public/rss-data` 43,211 B → **brotli 1,640 B / gzip 2,511 B（17.2×）**；`/api/articles?limit=50` 28,568 → 2,185 B；< 1 KB 的响应不压；所有响应带 `Vary: Accept-Encoding` |
| 7 | `docs/openapi.yaml` 重复 `/health` 键 + 严格解析（`check-openapi.ts`） | 契约校验通过；故意注入重复键时校验**报错退出**（修复前的逐行正则发现不了）；解析器同时修正了「子路径被当成顶层路径」的旧缺陷 |
| 8 | `Comment.parentId` 索引 + 迁移 | `EXPLAIN QUERY PLAN` 由 `SCAN Comment` 变为 `SEARCH Comment USING INDEX Comment_parentId_idx`；`prisma migrate diff` 无漂移 |

### 前端与性能

| # | 修复 | 复验证据 |
|---|---|---|
| 9 | hero 压暗加强 + 首屏文字不透明（`globals.css`、`HeroSection.tsx`） | 像素级实测（去掉文字笔画后采样真实背景）：hero 说明 2.37 → **4.79**、提示 1.97 → **5.64**、kicker 1.82 → **4.62**（阈值 4.5），h1 最差像素 2.75 → **4.59**（阈值 3） |
| 10 | **CSS 优先级缺陷**：`header[data-over-hero]` 规则（`globals.css`、`Header.tsx`） | 修复前 `.nav-link`/`.icon-button` 自带 `color` 压过 Tailwind 工具类，hero 上的导航实测仍是 `rgb(70,86,110)`、对比度 **1.17:1**；修复后为 `rgba(255,255,255,.92)`，背景中位亮度 0.184 → 对比度 **4.49:1** |
| 11 | Markdown 正文标题降级 + 卡片标题分级（`MarkdownContent.tsx`、`ArticleCard.tsx`） | 文章页 `h1` 由 **2 → 1**；列表页标题序列由 `h2 h2 h1 h3…` 变为连续的 `h1 → h2` |
| 12 | 页脚标题层级（`Footer.tsx`） | 页脚分组标题 h2 → h3，消除流式渲染下「页脚先到达」造成的 heading-order 跳级 |
| 13 | axe 违规清零（CookieNotice 角色、装饰头像、代码块、分类/标签区域） | axe-core 4.12.1，14 页 × 2 视口 × 2 主题 **56 次运行 0 违规**（修复前 68 个节点：aria-allowed-role 56 + heading-order 12） |
| 14 | 根级品牌化 404（`app/not-found.tsx` + `NotFoundView` + `PublicChrome`） | 未知路径 `/totally-unknown` 由 Next 默认英文 404 → **站点头尾 + 品牌化 404 + noindex**（实测 `hasHeader/hasFooter=true`） |
| 15 | 页脚 RSS/sitemap 关闭预取（`Footer.tsx`） | 浏览器实测资源列表中不再出现 `rss.xml?_rsc=` / `sitemap.xml?_rsc=`（此前每页约 64 KB 无效传输） |
| 16 | hero 模糊层由重复 `<Image>` 改为 CSS 背景（`HeroSection.tsx`） | 首屏不再为同一张壁纸发两次图片请求；首页「无尺寸 img」由 2 → 0 |
| 17 | 首页补 canonical（`(public)/page.tsx`） | 渲染 HTML 出现 `<link rel="canonical" href="…">` |
| 18 | 留言板布局稳定 | 桌面 `/messages` CLS 由 **0.273 → 0.0043**；首页/列表/文章/归档在桌面与移动均为 **0** |

### 质量门禁

| # | 修复 | 复验证据 |
|---|---|---|
| 19 | `check-docs.mjs` 忽略 `tmp/` | `check:docs` 通过（14 个 Markdown、9 篇索引文档、28 个环境变量） |
| 20 | `eslint.config.mjs` 忽略 `apps/web/tmp/**` | `npm run lint` 由 2390 error（编译产物噪音）→ **0 error 0 warning** |
| 21 | 新增回归测试 | 测试数 **107 → 114**，`npm run check` 退出码 0（lint → 类型检查 → 114 测试 → 文档 → 契约 → 浏览器冒烟 11 页） |

### 仍未修复（有意保留，或超出本轮范围）

- **软 404**：文章/分类/标签不存在时仍返回 200 + `noindex`（有品牌化 404 内容，但状态码语义不理想）。
- **API 契约仍无请求体 schema**：`requestBody()` 只保证「是对象」，字段级校验仍在服务层手工做。
- **生产依赖的第 5 条公告**：`scripts/check-audit.mjs` 白名单接受，前提（不可达）已核对。
- **私有 Admin 分离**：仍是「已批准未实现」，公开页脚仍有 `/admin` 入口。
- **分类/标签写接口**：仍只能通过 Markdown frontmatter 指定。
- **真实代理/TLS 形态**：本机没有 Nginx/TLS，压缩、HSTS、代理覆盖行为只能按文档推演。

---

## 三、评估方法与覆盖

| 手段 | 具体做法 | 覆盖 |
|---|---|---|
| 完整检查链 | `npm run check`（lint → typecheck → 107 测试 → 文档 → OpenAPI → 浏览器冒烟） | 退出码 0 |
| 生产构建 | Next.js 16.3.5 `next build --webpack` + `tsc`/`tsc-alias` | 通过 |
| 隔离实例 | 独立 SQLite 临时库（72 篇已发布 + 5 篇草稿 + 344 条评论 + 6 分类 + 18 标签）、生产模式 API（3312）+ 生产构建 Web（3311）、`NEXT_DIST_DIR` 隔离 | 全程真实运行 |
| HTTP 语义探针 | 18 条页面 + 40 条 API 请求：状态码、缓存头、错误信封、分页边界、SQL/排序注入、路径穿越、代理命名空间 | 原始 JSON 已留档 |
| 授权矩阵 | 匿名 / 普通用户 / 管理员三种身份 × 30 个端点 | 90 次请求 |
| 对抗性渗透 | 独立代理在 4187/4188 端口自建生产实例，JWT 伪造 14 例、21 个变更端点跨源矩阵、XFF 伪造、存储型 XSS（真实 Chromium DOM）、上传绕过、`npm audit` | 无 Critical/High |
| 渲染测量 | CDP：18 组合 axe-core、移动（4× CPU 降速）/桌面 LCP·CLS·TBT、真实 Tab 键遍历 5 个页面 × 30 步、`prefers-reduced-motion`、7 组视口 × 双主题 DOM 审计 | 68 条 axe 违规原始记录 |
| 性能基准 | 18 个端点 × 30 次延迟分位、1/8/32 并发混合读、5 个 SSR 页面耗时、真实 gzip/brotli 协商 | 原始 JSON 已留档 |
| 故障注入 | 数据库目录缺失 / 文件缺失 / 文件损坏 / 空文件四种形态、`JWT_SECRET` 缺失、备份→恢复演练 | 4 类故障全部实测 |
| 文档核对 | 14 个文档的修改时间、`npm run` 命令可达性、OpenAPI 路径/方法与真实路由逐条比对 | 37 路径 / 45 端点 |

---

## 四、各维度评分理由

> 下面每一条「扣分点」记录的是**第一轮评估时的状态与证据**，用于说明分数是怎么来的；
> 其中已被本轮修复的项，复验证据在第二节的表格里。每个维度标题后的分数是**修复后**的分数，
> 括号内是修复前。

### D1 后端架构与代码质量 84 → **88**

**已验证的强项（实测）**

- Web/API 边界是真实约束，不是文档口号：`apps/web` 内 `PrismaClient`、`JWT_SECRET`、`bcrypt`、
  JWT 库引用均为 0；`apps/web/src/app` 下只有 1 个 route handler（RSS），且只调用 API 客户端；
  `apps/web/src/proxy.ts` 只做「取 cookie → 问 `/api/auth/me` → 决定跳转」，不持有密钥。
- 零 `any` / `as any` / `@ts-ignore` / `@ts-expect-error` / 非空断言；零 import 环；
  最大源文件 456 行，无 god module。
- 无冗余计数字段（无 `viewCount`/`commentCount`），因此不存在「计数读改写」竞态。
- 分页在时间戳完全打平时仍不重不漏（12 篇并列时间戳按 3 条/页翻 4 页，12 条唯一）。
- 级联语义与迁移可部署性实测正确（删文章级联删评论、留言板不受影响、删用户置 NULL、
  14 个迁移全部可在有数据的库上部署，`prisma migrate diff` 报告无漂移）。

**扣分点（实测/代码）**

1. **完全没有请求体校验**：无 Fastify JSON schema，无 zod/valibot，16 处 `request.body as Record<string, unknown>`
   依赖服务层手工兜底。直接后果见 D2-4。
2. **契约重复**：`apps/web/src/lib/api/public-api.ts` 自行声明 9 个响应形状，其中 3 个与
   `apps/api/src/server/public/public-service.ts:36-63` 逐字段重复，而 `packages/contracts` 恰好没覆盖它们；
   `packages/contracts/src/index.ts:18-22` 的 `HealthResponse` 与真实 `/health` 载荷不一致且无人引用。
3. **业务逻辑落在路由层**：限流 key 派生与 SHA-256 哈希写在 `routes/auth.ts:46-53`、`routes/comments.ts:47,56`、
   `routes/publishing.ts:24`，与 `apps/api/README.md:35`「Route 只处理 HTTP 关注点」相悖。
4. **两套错误信封**：`http.ts` 的 `ServiceError` 信封 vs Fastify 默认 404/405 body。
5. 死代码：`logoutAdmin`、`getCurrentAdminSession`，以及只被测试引用的 `getSiteUrl`/`getOpenGraphImageUrl`。

### D2 API 契约与数据模型 78 → **87**

**已验证的强项**

- 路由集合与 OpenAPI **路径/方法完全对齐**：37 路径 / 45 端点，0 缺失、0 多余、0 方法不一致。
- 分页/过滤的垃圾输入被安全钳制（`limit=999`→50、`limit=0`→默认、`page=0/-3/abc`→1），
  `sort`/`q` 无注入面，SQL 全部参数化。
- 草稿在所有公开数据集（详情、索引、RSS、sitemap）中均不可见（实测 404/`null`/不出现）。
- 数据完整性：`Parent/Child` 回复、留言板 `postId IS NULL`、`SetNull` 语义均实测正确。

**扣分点**

1. **`docs/openapi.yaml` 存在重复的顶层 `/health` 键**（第 34 行与第 956 行），严格 YAML 解析器
   直接抛错，宽松解析器静默丢弃第一份；而 `check:openapi` 用逐行正则解析，仍打印「接口契约一致」并退出 0（实测）。
2. **20 个端点会返回未文档化的 403**（同源校验）、**2 个未文档化的 429**、`GET /api/articles` 的 `q` 参数
   完全未写入契约、`PUT /api/comments/:id` 未文档化 400/404。
3. **`Comment.parentId` 没有索引**，而回复查询按 `parentId IN (...)` 取值——`EXPLAIN QUERY PLAN` 显示全表扫描，
   且这是每次打开文章页/留言板都会走的路径。
4. **无 body（或 body 为 `null`）的写请求返回 500**，应为 400：`POST /api/articles`、`POST /api/comments`、
   `POST /api/guestbook`、`PUT /api/comments/:id`（已实测复现）。
5. 不存在资源返回 `200 + data:null`（文章/相邻/标签/分类），契约未体现可空性；201 不带 `Location`；
   `/api/import` 在 `imported:0` 时也返回 201。

### D3 安全防护 79 → **88**

**结论：无 Critical / High。未发现认证绕过、越权、SQL 注入、存储型 XSS、SSRF 或凭据泄漏。**

**守住的防线（对抗性尝试后仍然有效）**

- 21 个变更端点对跨源 `Origin`（含 `null`、后缀伪装 `127.0.0.1.evil.com`、仅 Referer、`_method` 覆盖）
  一律 403；缺少 Origin 时放行是明确设计（供 CLI 发布），浏览器侧由 `SameSite=Lax` + 浏览器强制发送 Origin 兜住。
- JWT 伪造 14 例全部拒绝（`none` 算法、错密钥、过期、篡改 `tokenVersion`、空签名）；令牌内提权 `role` 无效（以数据库为准）。
- 登出/改密即时吊销该用户全部令牌（第二张令牌立即 401）。
- 会话 Cookie：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`。`Secure` 按环境切换（生产强制）。
- 草稿在全部公开数据集不可见；评论正文以纯文本渲染（React 转义），Markdown 的 `javascript:` 链接被
  默认 URL 转换器置空（实测渲染为 `href=""`），原生 HTML 标签不解析（未启用 `rehype-raw`），
  全仓仅 4 处 `dangerouslySetInnerHTML`，均为已转义 `<` 的 JSON-LD/主题引导脚本。
- `TRUST_PROXY=false` 时 `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` 伪造完全无效。
- 请求 ID 头注入被替换为 UUID；限流桶目标键做了大小写/空白归一；验证码一次性且并发重放只有 1 次成功。
- 无 SMTP 且未显式开启调试时，注册流程 fail-closed（不回显验证码）。
- 受版本控制文件与 101 次提交历史中无密钥；`npm audit` 的 5 条生产公告由 `scripts/check-audit.mjs`
  白名单接受且已核对可达性（`mysql2`/`deepmerge-ts` 在本项目不可达）。

**扣分点**

1. **登录失败桶会锁死账号（Medium，已独立复现）**：`routes/auth.ts:90-104` 在验密**之前**就检查失败桶。
   实测连续 10 次错误密码后，**正确密码也返回 429**；单 IP 每 15 分钟补 10 次即可长期锁死唯一管理员。
   这与 `docs/registration-delivery.md:51-53` 与 `request-guard.ts:220-226` 中「不会被定向锁死」的承诺相反。
2. **`TRUST_PROXY=true` + `x-forwarded-for` 时身份可自选（Medium）**：`request-guard.ts:170-171` 取 XFF 最左项，
   而仓库自带 nginx 片段用 `$proxy_add_x_forwarded_for`（追加不覆盖）——文档推荐的组合反而不安全。
3. **默认 `TRUST_PROXY=false` 下所有访客共用同一个限流桶（Medium）**：经 Web 代理时 API 只看到 `127.0.0.1`，
   单个攻击者 20 请求/15 分钟即让**全站登录**不可用、5 请求/小时让**全站注册发码**不可用。
4. Low：头像 URL 的「禁止协议相对地址」检查可被反斜杠绕过（`/\evil.example/av.svg`，浏览器解析为外部地址）；
   登录存在用户枚举时间侧信道（≈60ms vs ≈7ms）；全站无 CSP/HSTS、Cookie 无 `__Host-` 前缀；
   音频上传只校验扩展名 + 客户端 MIME，不校验 magic bytes（当前服务端 `audio/mpeg`+`nosniff`，尚不可 XSS）。
5. Info：`/health` 公开暴露版本与运行时长；`scripts/deploy-verify/verify-deploy.sh` 硬编码固定
   `JWT_SECRET` 与端口，误在服务器工作区执行会打到正在运行的实例；JWT 未固定 `algorithms`。

### D4 前端设计与视觉体系 82 → **89**

**已验证的强项**

- 设计令牌体系完整且**真的在被使用**：`globals.css` 921 行、170 个自定义属性、`@theme inline` 映射 114 个令牌，
  四种圆角、两级阴影，组件层**零**任意圆角/阴影值；公开页面 186 处语义色工具类 vs 3 处遗留写法。
- 明暗双主题都有完整令牌集（`--bg/--surface/--border/--text/--primary/--accent/...`），
  暗色不是简单反色，配色与亮色同源。
- 排版基线被实测确认：界面最小字号 13px（唯一 12px 是 hero 的 `Enter` 键提示），
  阅读列 `.reading` 为 17px/1.75。
- 首页呈现质量高：沉浸式 hero、柔和渐变压暗、清晰标题层级与 CTA；实拍（1440 浅色 / 1440 暗色 / 390 移动）与设计规范一致。
- 页面结构完整：首页四段（hero / 最新文章 / 近况 / 分类与标签），文章页为阅读器
  （粘性目录 + 滚动高亮 + 移动端抽屉 + 720px 阅读列 + 代码块复制 + 图片灯箱 + 操作栏），
  另有归档、分类、标签、关于、近况、留言板、RSS、sitemap；打印样式与 `reduced-motion` 规则齐备。
- 7 组视口（360/390/768/1024/1280/1440/1920）在首页与文章页**零横向溢出**，无重叠、无裁切。

**扣分点**

1. **hero 可读性依赖一层不够强的压暗**（见第二节第 9–10 项）：`--hero-scrim` 在 45% 处只有 `0.10` 不透明度，
   而 hero 说明文字用 `text-white/85`、提示用 `text-white/70`，在浅色壁纸区域实测只有 1.8–2.4:1。
   头条 `h1` 因带 `text-shadow` 尚可（中位 8.24:1，最差 2.75:1），但正文级文字不合格。
2. **通用 404 未品牌化**：未知路径由 Next.js 默认 404 页面渲染（英文 "This page could not be found."、
   无站点头尾、白底黑字写死样式）——实测 `hasHeader=false hasFooter=false`。
   文章/分类/标签的「不存在」有品牌化设计，两者不一致。
3. **软 404**：`/articles/<不存在>`、`/categories/<不存在>`、`/tags/<不存在>` 返回 **HTTP 200**，
   靠 `noindex` 兜住索引风险，但状态码语义不对（Google 会判为 soft 404）。
4. **令牌残留**：`globals.css` 之外仍有 7 处硬编码颜色，其中鱼形 SVG 里的腮红用的是旧值 `#f472b6`
   （当前 `--primary` 已是 `#ef5f7a`）；`docs/design-plan.md` 的令牌表与实际值漂移
   （文档写 `--text-3 #6b7c94`、`--primary-deep #d4455f`、`--accent-deep #2b7fb8`，
   代码为 `#5c6b81`、`#b3304d`、`#26719f`，且未记录 `--primary-solid`/`--on-solid`）。
5. `/categories`、`/tags` 两个索引路由不存在（只有 `[category]`/`[tag]` 动态段），
   直接访问得到默认 404；导航里也没有入口（分类/标签聚合在首页与文章页出现）。

### D5 可用性与可访问性 79 → **93**

**已验证的强项（均为实测）**

- **焦点可见性零缺失**：用 CDP 原生 Tab 键在首页 / 文章列表 / 文章详情 / 登录 / 留言板各遍历 30 步，
  81 个可聚焦元素**全部**有可见焦点样式（`outline` 或 `box-shadow`），无一遗漏。
- **键盘顺序合理**：跳转链接 → 品牌 → 主导航 → 搜索/音乐/主题 → 注册/登录 → 菜单 →
  主内容 → 页脚，符合视觉顺序；文章页 Tab 可依次走完全部目录项、代码块复制按钮与可横向滚动的代码区。
- **axe-core 违规极少**：14 页 × 2 视口 × 2 主题（56 次运行）只报出两类规则——
  `aria-allowed-role`（minor，56 个节点）与 `heading-order`（moderate，12 次运行）；
  **无 landmark / label / name / lang / id 类违规**，无 serious / critical 违规。
- **`prefers-reduced-motion` 生效**：CSS 全局把 `animation-duration`/`transition-duration` 压到 0.01ms 且
  `animation-iteration-count: 1`，实测降速后无持续动画。
- **横向溢出为零**：7 组视口在首页与文章页实测 `scrollWidth == innerWidth`。
- **语义与命名**：`lang="zh-CN"`、跳转链接、`main#main-content`、图标按钮全部有 `aria-label`、
  表单控件全部有可访问名称（占位图链接显式 `tabindex="-1" aria-hidden="true"`，不产生重复停留点）。

**扣分点**

1. **首屏文本对比度不合格（本次最严重的体验缺陷，F1）**：用「去掉文字像素后采样背景」的像素级方法实测，
   浅色主题下 hero 与透明头部的实际对比度为——
   `header-brand` 中位 **1.64:1**、`hero-kicker` **1.82:1**、`hero-hint` **1.97:1**、
   `hero-desc` **2.37:1**，要求分别为 4.5:1；`hero-h1` 中位 8.24:1 但最差像素仅 2.75:1（大字号要求 3:1）。
   成因是 `--hero-scrim` 中段只有 `0.10` 不透明度，而文字用 `text-white/70…/85`。
   **axe-core 在这里把 140 个节点判为 `color-contrast` incomplete**——所以「axe 零违规」这句话虽然为真，
   却恰好不覆盖全站最显眼的那段文字。
   （该测量取自某一次壁纸轮换状态；换壁纸会改变背景，但结论方向不变：不透明的压力不足。）
2. **文章正文里的 `#` 会渲染成第二个 `<h1>`**（F2）：`MarkdownContent` 保留了 Markdown 的一级标题，
   文章页因此出现两个 `h1`（实测所有视口 `h1=2`）。一篇文章的正确层级应是页面标题 `h1` + 正文从 `h2` 起。
3. **列表模板标题层级跳级**（F4，12 次 axe 运行触发）：`h1` 之后直接是 `h3`（`ArticleCard` 用 `h3`）；
   同时页脚 `<h2>`（「浏览」「订阅与本站」）在源码顺序上位于主内容 `<h1>` **之前**，
   实际序列为 `h2 h2 h1 h3…`。
4. **通用容器上的 `aria-label` 被忽略**（F5，axe `aria-prohibited-attr` incomplete，40 个节点）：
   给无角色约束的 `div`/`pre` 加 `aria-label` 不会产生可访问名称，属于无效 ARIA，
   应改用 `role` + 可见文本或 `aria-labelledby`。
5. Cookie 提示使用 `<aside role="dialog" aria-modal="false">`，`role="dialog"` 在 `<aside>` 上不是允许的角色
   （F3，56/56 次运行）；非模态对话框的语义也与「横幅提示」不符，建议 `role="region"` + `aria-labelledby`。
6. 评论分隔符 `text-ink-4` 14px 在白底上 3.51:1（F6，元素本身 `aria-hidden`，可争议）。
7. 留言板首屏评论列表展开时页脚位置变化，桌面实测 **CLS = 0.273**（见 D6）。

### D6 性能与前端效率 79 → **89**

**已验证的强项（本地生产构建实测）**

- **服务端极快**：API 端点 p50 延迟 **0.3–1.5 ms**（18 个端点 × 30 次），
  32 并发混合读 **1510 rps**、p50 15.3 ms、p99 125.7 ms、0 错误。
  Web SSR 页面 p50 1.3–16.6 ms（首页 4.3 ms、文章详情 16.6 ms）。
- **LCP 健康**：移动（390px，4× CPU 降速）首页 380 ms、文章页 284 ms、列表页 188 ms；
  桌面（无降速）首页 236 ms、列表页 108 ms。
- **CLS 基本为零**：首页 / 文章列表 / 文章详情 / 归档在桌面与移动**全部 0.0000**。
- **字体策略最优**：0 个字体请求、0 第三方请求，使用系统字体栈（`PingFang SC` / `HarmonyOS Sans SC` /
  `Microsoft YaHei`），无 FOUT/FOIT 风险、无 CLS 贡献。
- **图片走 Next 图片优化**：hero 图按视口出 640w/1920w 变体（移动实测 21.6 KB/8.6 KB），
  壁纸源文件 91–499 KB 但不直接下发原图。
- **静态资源缓存正确**：`/_next/static/**` 为 `public, max-age=31536000, immutable` 且带 ETag；
  可静态化页面有 ISR（`s-maxage=60, stale-while-revalidate=1y`），实测 `x-nextjs-cache: HIT`。
- 压缩：Web HTML 协商 gzip（89,933 → 25,336 B，**压缩率 72%**）。

**扣分点**

1. **API 完全没有响应压缩**：`/api/public/rss-data` 43,211 B、`/api/articles?limit=50` 28,568 B，
   请求带 `Accept-Encoding: gzip, br` 仍原样返回（无 `Content-Encoding`）。API 是独立 Fastify 服务，
   Next 只做重写不做压缩，所以**生产环境这 43 KB 的 JSON 会原封不动进浏览器**。
2. **RSS / sitemap 链接被当作 RSC 路由预取**：页脚的 `<Link href="/rss.xml">`、`/sitemap.xml` 触发
   Next 预取，实测抓取 48.4 KB 的 `/rss.xml?_rsc=…` 与 15.9 KB 的 `/sitemap.xml?_rsc=…`——
   这两个资源在浏览器里本来没有实际用途，纯属浪费带宽（应 `prefetch={false}`）。
3. **留言板桌面端 CLS = 0.273**（唯一一处，稳定复现）：单次布局位移源为 `FOOTER.border-t`，
   `@121ms`，即客户端评论列表从「加载中」展开后把页脚推下；应预留骨架高度或固定首屏高度。
4. 首页首屏内联数据 15–48 KB（RSC flight 数据），列表页单页 HTML 约 90 KB（未压缩）；
   服务端渲染的公开数据接口合计约 68 KB/首页请求，属可接受但可收敛的量级。
5. 无 Brotli：Node/Next 只协商 gzip（生产由 Nginx 提供 br 时才能改善）。

### D7 SEO 与元数据 84 → **91**

**已验证的强项**

- 18 条路由实测：标题/描述/`og:*`/`twitter:card`/canonical 齐备且逐页正确；
  文章页有 `BlogPosting` + `BreadcrumbList`，全站有 `WebSite` JSON-LD（已转义 `<`）。
- `robots.txt` 允许全站、屏蔽 `/admin/` 与 `/api/` 并声明 Sitemap；`sitemap.xml` 实测 102 条 URL
  （73 篇文章 + 18 标签 + 6 分类 + 静态页），带 `changefreq`/`priority`。
- RSS 20 条，`/rss.xml` 在 API 不可用时返回 503 + `Retry-After`（而不是空 feed），语义正确。
- 分页控件是可抓取的 `<a href="/articles?page=N">` 链接（实测 page=2/3/4/8 均为真实链接）。
- 文章 slug 只在显式提供时变化，不会因编辑正文而破坏已发布 URL（有回归测试）。

**扣分点**

1. **软 404**：文章/分类/标签不存在时返回 200（配 `noindex`），状态码语义不正确。
2. **通用 404 页面没有品牌、没有站点导航**（Next 默认页），对用户与爬虫都不友好。
3. **首页没有 canonical**（`<link rel="canonical">` 缺失）；文章/分类/标签/关于/留言等页面有。
4. **首页 hero 两张壁纸图缺 `width`/`height`（`sizes` 也没有）**，实测 `imgNoDims=2`；当前靠容器定高没有产生 CLS，
   但缺少显式尺寸属于结构性风险。壁纸为纯装饰且 `alt=""`（合理）。
5. sitemap/RSS/archive 的条数上限（50000 / 20 / 5000）未写入契约，archive 的 `total` 是截断后的数量。

### D8 测试与质量保障 80 → **86**

**已验证的强项**

- 完整检查链实测通过：`npm run check` 退出 0（lint → 4 个 workspace 类型检查 → **107/107 测试** →
  文档校验 → OpenAPI 校验 → 浏览器冒烟 11 页）。
- 测试是**行为级**而非状态码级：登出后旧令牌立即 401、账号维度限流跨 IP 生效、
  评论身份由服务端覆盖、密码重置不暴露邮箱是否注册、并列时间戳分页不重不漏、SMTP 明文拒绝。
- 授权矩阵测试遍历每个管理端点断言 401/403；`origin-guard.test.ts` 遍历**每个**状态变更端点断言跨源 403。
- 无 mock、无 snapshot、无共享状态：每个测试文件用独立临时库，Node 测试运行器按文件分进程。
- 冒烟检查设计扎实：自建临时库 + 独立构建目录 + 交叉核对 API 自报的数据库路径，
  防止「跑在开发者库上却因为别的原因通过」。实测 11 页渲染、内部链接、音乐面板、主题切换、
  目录高亮、代码复制、移动目录抽屉、真实数据渲染全部通过。
- CI 分工清晰（14 步），依赖审计有显式白名单并记录「门禁曾经静默失效」的历史。

**扣分点**

1. **没有任何覆盖率工具或阈值**（无 c8/nyc/`--experimental-test-coverage`）。
2. **功能覆盖有真实空洞**：45 个端点中只有 19 个有功能性 HTTP 测试；10 个服务函数在任何层级都无测试，
   包括 `getRssFeedData`、`getSitemapData`、`getContentLayoutData`、`listCategories`、`deleteArticle`。
   **整个公开 SSR 数据面（layout / rss-data / sitemap-data / 归档索引 / 标签页 / 分类页）没有测试。**
3. **零并发测试**（全仓 `Promise.all` 无匹配），而代码里存在多处「先查后建/先查后改」。
4. 已实测的两类缺陷**没有测试覆盖**：无 body 的 500、框架默认 404 body。
5. 文件内存在顺序耦合（`api.test.ts` 依赖执行顺序与跨测试保留的限流桶），
   当前串行执行是绿的，一旦并发或调序会碎。
6. 一次实测到的非确定性缺陷：冒烟检查里「代码块复制按钮产生可见反馈」得到 `label=复制失败`——
   无头浏览器没有剪贴板权限时按钮反馈文案是失败态，说明该断言只校验「反馈存在」而不校验语义。
7. **质量门禁会被残留构建产物污染（本次已修复）**：冒烟检查与隔离实例把 `NEXT_DIST_DIR` 指向
   `apps/web/tmp/`（已被 `.gitignore` 覆盖），但两个门禁都没有忽略它——
   - `scripts/check-docs.mjs` 的忽略目录不含 `tmp`：残留一次构建后，`tmp/<dist>/server/middleware.js`
     会被当成源码扫描，把 Next 内部的 `NEXT_*`/`VERCEL_*` 变量报成「未写入 `.env.example`」，`check:docs` 失败；
   - `eslint.config.mjs` 的 `globalIgnores` 只覆盖 `**/.next/**`、`**/out/**`、`**/dist/**`，
     覆盖不到 `apps/web/tmp/**`：残留构建会让 `npm run lint` 报出 **2390 个 error / 15978 个 warning**
     的编译产物噪音。
   已分别把 `tmp` 加入两处忽略列表；`lint` + `typecheck` + `test`（107/107）重新全绿。

### D9 运维与可部署性 66 → **86**（修复前最低维度）

**已验证的强项**

- 备份/恢复是真实可执行的：`VACUUM INTO` 生成一致性快照、恢复前校验 `integrity_check`、
  恢复前自动另存当前库；本次演练「备份 → 校验 → 预览恢复」全链路通过（文章 78 / 用户 2 / 评论 344）。
- 更新脚本在 `migrate deploy` **之前**备份，并有并发锁、`--allow-dirty` 非破坏语义。
- PM2 双进程、回环绑定、内存上限、`kill_timeout`；Nginx 只暴露 Web。
- 生产 Web 启动显式 `--hostname 127.0.0.1`，并会在启动时探测 API 不可达并打印可照做的指引（实测输出友好）。
- 请求日志结构化（pino + 随机 `reqId`，回写 `X-Request-Id`），请求 ID 头注入被过滤。

**扣分点（全部实测复现）**

1. **`/health` 会说谎（最严重）**：数据库文件缺失但目录存在时，better-sqlite3 会静默创建一个 0 字节库，
   `SELECT 1` 成功，于是 `/health` 返回 **200 `{"status":"ok","checks":{"database":"ok"}}`**，
   而所有真实数据端点 500。监控、负载均衡与更新脚本的健康检查因此全部失去意义。
   （目录缺失时能正确返回 503 `degraded`，说明这是「空库/缺文件」这一分支的判据不足。）
2. **没有启动期配置校验**：`NODE_ENV=production` 且 `JWT_SECRET` 缺失时进程正常启动、`/health` 200，
   但所有需要签发或校验令牌的接口 500——故障不在启动时暴露。
3. **没有优雅关闭**：无 `SIGTERM`/`SIGINT` 处理、无 `prisma.$disconnect`、无
   `unhandledRejection`/`uncaughtException` 处理；PM2 `kill_timeout: 5000` 之后 SIGKILL，在途请求直接丢弃。
4. SQLite 跑在 `journal_mode=delete`（非 WAL），`busy_timeout=5000` 是驱动默认值而非显式决定，
   没有任何文档记录这是经过权衡的选择。
5. 日志一半结构化一半不结构化：请求走 pino，而同源校验、健康探针、验证码清理、限流清理用裸
   `console.warn/error`，出问题时无法按请求 ID 关联。
6. 媒体文件与数据库行不同事务：先落盘再插行（失败留孤儿文件）、先删文件再删行（失败留悬空行）。

### D10 文档与可维护性 84 → **92**

**已验证的强项**

- 文档新鲜度极高：14 个文档全部在最近数小时内更新，且结构分层清晰
  （根 README 作入口 → `docs/` 讲跨模块 → 应用 README 讲框架边界 → `.codex/project-memory.md` 记「为什么」）。
- 文档中出现的 29 个 `npm run` 命令**全部真实存在**（唯一「缺失」是我脚本切词产生的 `start:pm` 误报）。
- 明确的维护规则：环境变量变化要同时更新 `.env.example` 与 `environment.md`；
  接口变化要同时更新代码、Contracts、测试与 OpenAPI；`check:docs` 会校验「源码里出现的
  `process.env.NAME` 必须出现在 `.env.example`」，把约定变成可执行检查。
- 现状与目标严格区分：私有 Admin 分离被明确标注为「已批准未实现」，没有用完成态措辞。

**扣分点**

1. **`docs/openapi.yaml` 重复 `/health` 键**，严格工具无法加载（与 D2-1 同一问题，文档侧的直接后果）。
2. 描述与实现不符：`docs/architecture.md` 称分类/标签「后台可改」，但 API 与后台都没有写入口；
   `apps/api/README.md:43` 仍在描述上传校验，而图片上传早已移除（架构文档已说明改为外部图床）。
3. 项目记忆里「107 个测试」「37 条路由」等数字需要人工维护，缺少自动核对。

### D11 产品完整度与内容体验 81 → **86**

**已验证的强项**

- 写作 → 发布 → 阅读 → 互动闭环完整：后台 Markdown 编辑器 + 封面/摘要/分类/标签 + 草稿态；
  前台目录、代码高亮与复制、图片灯箱、上下篇、相关文章、分享；
  评论/留言带审核、二级回复、身份防伪与频率限制；RSS/sitemap；音乐播放器；主题切换；Cookie 提示。
- 空状态诚实：`/now` 等页面使用「还没有…」而不是编造内容；未提供的个人资料保持为空。
- 文章导入支持 Markdown/DOCX/HTML/文本，逐文件返回结果。

**扣分点**

1. **分类与标签只能读，不能增删改**（无 API、无后台 UI），文章只能通过 Markdown frontmatter 指定。
2. **没有图片上传**（设计上走外部图床），因此封面/正文配图完全依赖外部服务可用性。
3. 没有站点内搜索页（搜索以列表筛选形式实现）、没有草稿预览、没有访客分析（后者是隐私取舍，不计为缺陷）。
4. 「相册」能力已移除，历史导航文案里仍可能残留印象（文档已同步，属可接受）。

---

## 五、剩余工作清单

第一轮列出的 P0/P1 项与关键 P2 项**已全部完成**（逐项证据见第二节）。下表只保留仍然开放的事项，
按「风险下降 / 工作量」排序。

| 优先级 | 事项 | 位置 | 说明 |
|---|---|---|---|
| P2 | 软 404 改为真实 404 状态码 | `articles/[slug]`、`categories/[category]`、`tags/[tag]` | 目前 200 + `noindex`；内容已是品牌化 404，仅状态码语义不理想 |
| P2 | 为写端点补字段级 schema | `apps/api/src/routes/*` | `requestBody()` 已把「非对象体」挡在 400，字段级校验仍在服务层手工做 |
| P2 | 补齐公开 SSR 数据面测试与覆盖率阈值 | `apps/api/tests/`、`package.json` | `getRssFeedData` / `getSitemapData` / `getContentLayoutData` / `listCategories` / `deleteArticle` 仍无直接测试 |
| P2 | 为已完成的修复补充端到端断言 | `scripts/smoke-web.mjs` | 压缩、启动校验、优雅关闭属于进程级行为，冒烟脚本目前只覆盖页面渲染 |
| P3 | 头像/封面 URL 拒绝反斜杠与控制字符；音频上传校验 magic bytes；不存在的用户走 dummy bcrypt | `profile-service.ts`、`media-service.ts`、`auth-service.ts` | 安全评估的 Low 项 |
| P3 | 清理遗留硬编码色与文档令牌表漂移 | `SiteIcons.tsx`、`docs/design-plan.md` | 鱼形 SVG 里仍是旧的 `#f472b6` |
| P3 | 实现已批准的私有 Admin 分离 | 新增 `apps/admin` | 长期项；公开页脚目前仍有 `/admin` 入口 |
| P3 | 分类/标签写接口 | `apps/api/src/routes/taxonomy*` | 目前只能通过 Markdown frontmatter 指定 |

> 本轮实际改动的实现文件：`apps/api/src/app.ts`、`apps/api/src/http.ts`、`apps/api/src/index.ts`、`apps/api/src/server/health/health-service.ts`、`request-guard.ts`、`compression.ts`、
> `apps/api/src/routes/` 下的 articles / auth / comments / media / publishing、`apps/api/scripts/check-openapi.ts`、
> `apps/web/src/app/globals.css`、`apps/web/src/app/not-found.tsx` 与 `apps/web/src/app/(public)/`、
> `apps/web/src/components/public/**`、`prisma/schema.prisma` + 一个新迁移、
> `scripts/check-docs.mjs`、`eslint.config.mjs`、`docs/openapi.yaml`、`docs/environment.md`、`docs/README.md`。
> 复验：`npm run check` 退出码 0（lint、4 个 workspace 类型检查、114 个测试、文档、契约、浏览器冒烟 11 页）。

## 六、本次未能验证的部分（明确边界）

- **真实生产环境形态**：本机没有 Nginx/TLS，压缩、代理头覆盖、HSTS 等「部署后」行为只能按文档推演；
  报告中涉及这些的判断已标注为推断。
- **真实 SMTP/SMS 投递链路**（按设计离线）、DOCX 解压炸弹（仅静态判断）。
- **已批准但未实现的私有 Admin 分离**（`apps/admin` 不存在），因此其验收标准不在本次评分范围内；
  当前管理后台仍由 `apps/web` 提供，公开页脚仍有 `/admin` 入口。
- **负载上限与写并发**：性能数据来自单机 SQLite + 单进程、本机回环网络，绝对值不可外推；
  未做长稳（soak）测试与磁盘写锁压力测试。
- **多机型/多浏览器**：渲染与可访问性数据来自 Chromium（headless）单一引擎，未覆盖 Firefox/Safari
  与真实移动设备。
