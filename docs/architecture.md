# 总体架构

## 当前架构

项目采用单 Git 仓库 Monorepo，在保持原子提交和统一依赖锁的同时，让 Web 与 API 在运行时物理分离。

```text
Browser
   │  HTTPS，同域页面与 /api/*
   ▼
Nginx
   │
   ▼
Next.js Web :3001
   ├── 页面、静态资源、SSR、管理界面
   ├── /api/* rewrite ───────────────┐
   └── API_INTERNAL_URL（SSR）───────┤
                                      ▼
                                Fastify API :3002
                                  ├── 认证与授权
                                  ├── 领域服务与限流
                                  ├── Prisma ──> SQLite
                                  └── 媒体 ──> apps/web/public（暂时）

apps/web ───────> packages/contracts <────── apps/api
                   仅共享序列化类型
```

## 模块职责

| 模块 | 拥有内容 | 禁止内容 |
|---|---|---|
| `apps/web` | Next.js 路由、React 组件、SSR API 客户端、同域代理 | Prisma、JWT 密钥、数据库查询、后端服务实现 |
| `apps/api` | Fastify 路由、认证授权、业务服务、数据库和上传 | React、Next 页面、浏览器状态 |
| `packages/contracts` | API envelope、跨进程 DTO、分页类型 | 数据库客户端、运行时副作用、应用实现 |
| `prisma` | schema、migration、seed | UI 和 HTTP 处理 |
| `scripts` | 仓库级开发、发布、更新与备份自动化；`load-env.mjs` 是**全项目唯一**的环境变量加载入口 | 业务规则和密钥 |

依赖方向必须保持单向：应用可以依赖 Contracts，但 Web 和 API 不得直接导入彼此的源码。

### 工具函数的归属

`apps/api/src/lib/utils.ts` 与 `apps/web/src/lib/utils.ts` 各自只保留**本应用真正使用**的函数：

- API 侧：`slugify`、`autoExcerpt`、`extractHashTags`、`generateUniqueFilename`、图片类型与大小常量
- Web 侧：`slugify`、`formatDate`、`readingTime`、`wordCount`、`extractHeadings`、`hashTagColor`

两个文件曾经近乎逐行相同，但其中大部分函数只有一边在用。**不要把单侧函数搬到另一边**——
那只会让另一边背上用不到的依赖（例如 `pinyin-pro`、`github-slugger`）。

唯一真正的共享函数是 `slugify`：API 用它生成权威 slug，Web 用它做后台实时预览。
它按上面的规则各留一份实现，行为一致性由 `apps/api/tests/slug-parity.test.ts` 强制。
**修改任一端的 slug 规则时该测试会立即失败**，必须同步两边。

## 请求流程

### 浏览器 API 请求

1. 浏览器请求当前站点的 `/api/*`。
2. Next.js rewrite 将请求转发至 `API_INTERNAL_URL`。
3. Fastify 验证来源、Cookie、权限和输入。
4. API 返回统一 JSON envelope。

这样可以保持 Cookie 同域，并避免在浏览器暴露内部 API 地址。

### 服务端渲染

1. Next.js Server Component 调用 `apps/web/src/lib/api/public-api.ts`。
2. 客户端通过私有 `API_INTERNAL_URL` 请求公开 SSR 数据端点。
3. API 不可用时，只有明确设计了降级值的页面信息才回退；业务数据错误不应静默伪造。

### 管理后台

Web Proxy 调用 `/api/auth/me` 提前处理页面跳转，但这只是体验层。Fastify 仍须在每个管理端点重新验证管理员身份，不能依赖 Web Proxy 提供安全保证。

当前管理页面仍属于 `apps/web`，并通过公开 Web 入口访问。该状态会保留到私有 Admin 迁移完成，不能在迁移中途删除现有管理能力。

## 数据与媒体

- SQLite 相对路径以仓库根目录解析。
- Prisma Client 仅由 API 使用。
- schema 修改必须同时提交 migration。
- 当前媒体目录默认是 `apps/web/public`，要求 Web 与 API 共用磁盘。
- 分主机、多副本或容器化之前，媒体必须迁移到对象存储或独立文件服务。

### 内容存储在哪里

| 内容 | 存储 | 后台可改 |
|---|---|---|
| 文章、分类、标签、评论 | SQLite | ✅ |
| 留言板留言 | SQLite `Comment`（`postId` 为 `null`） | ✅ `/admin/comments` |
| 博客标题与描述 | SQLite `Setting` | ✅ `/admin/settings` |
| 个人资料、近况、社交链接 | SQLite `Profile`（单行表） | ✅ `/admin/settings` |
| 背景音乐 | 磁盘 + SQLite `Music` 索引 | ✅ `/admin/resources` |
| 图片资源库 | SQLite `MediaImage` 登记 + 本地文件或外部 URL | ✅ `/admin/resources` |
| 首页壁纸 | SQLite `HomeWallpaper` + 本地文件 | ✅ `/admin/resources` |

**图片同时支持本地文件与外部图床 URL。** 文章封面、正文配图与头像仍可直接写 URL；
`/api/images` 提供登记（`MediaImage`）、上传、外链收编与引用检查，后台在
`/admin/resources` 统一管理。图库列表是管理端数据，读取需要管理员会话。

**原则：作者会经常修改的内容一律进数据库并配后台入口。**

个人资料、音乐、图片登记和首页壁纸都已从代码/纯文件系统迁入数据库；首页壁纸管理系统
首次访问时会播种仓库自带的默认壁纸，之后由后台增删启停。`apps/web/src/config/home.ts`
只保留“API 不可达时首页回退到仓库默认壁纸”的前端兜底列表。

`Profile` 的 `socialLinks` 存 JSON 字符串而不是拆表：它总是整体读写、条目数量小
（个位数），拆表只会带来额外的 join 与端点。写入时的结构校验（长度、数量、URL 协议）
由 `apps/api/src/server/profile/profile-service.ts` 负责，不接受 `javascript:`、
`data:`、`file:` 等协议。

### 外部图床的性能注意

`apps/web/src/lib/images.ts` 只对**本站域名**的图片启用 Next 图片优化，
其它主机一律 `unoptimized`：外部图床的图片会按原图输出，不做 WebP/AVIF 转换、
不生成 srcset。因此**上传到图床之前应先压缩到合理尺寸**。文章封面是首屏 LCP 元素，
原图会直接拖慢首屏。

### 留言板：复用 `Comment` 表而不是新建表

留言板条目就是 `postId` 为 `null` 的评论。独立建表会把这些逻辑各抄一遍：先审后发状态机、
一级回复、登录身份防伪（昵称与邮箱由服务端覆盖）、IP 频率限制、管理端审核列表。
复用一张表后留言板免费得到全部这些，代价只是 `Comment.postId` 可空。

边界规则：

- **归属由端点决定**：`POST /api/guestbook` 忽略请求体里的 `postId`，客户端无法把留言挂到文章上。
- **回复不跨域**：查父评论时 `postId` 参与匹配条件，留言板回复不了文章评论，反之亦然。
- **级联删除互不影响**：删除文章会带走它的评论，但 `postId` 为 `null` 的留言不受影响
  （`ON DELETE CASCADE` 只在有外键值时触发）。已有测试覆盖。
- **限流分开计数**：`comments:create:*` 与 `guestbook:create:*` 各自计数，
  刷留言板不会用光文章评论的额度。

管理端 DTO 额外返回 `scope: "post" | "guestbook"`，避免前端靠 `post === null` 猜；
`GET /api/comments?scope=` 让审核时能只看其中一边。

### 评论分页

公开评论列表（文章评论区与留言板）返回 `PaginatedResult<CommentWithReplies>`，
与文章列表同一形状，顶层评论分页（默认 20，上限 50），每条评论自带它**全部**已审核回复
（回复不分页）。

此前这里返回裸数组、用 500 条硬上限静默截断，响应里连 `total` 都没有，前端无从知道
还有没有更早的评论。排序为 `createdAt DESC, id DESC`：单靠 `createdAt` 不是全序，
分页遍历在时间戳打平时可能重复或漏项。答复排序同理补了 `id ASC` 作为第二键。

### 搜索：为什么不用 SQLite FTS5

`GET /api/articles?q=` 用的是 `LIKE '%q%'` 全表扫描。看起来该换成 FTS5，但**实测结论相反**：

| 查询 | `LIKE %q%` | FTS5 `unicode61` | FTS5 `trigram` |
|---|---|---|---|
| 哈希 / 索引 / 缓存 / 寻址（2 字） | ✅ 全部命中 | ❌ 0 | ❌ **0** |
| 哈希表 / 开放寻址（3 字以上） | ✅ | ❌ 0 | ✅ |

`unicode61` 把连续 CJK 当作单个 token，中文查询全部落空；`trigram` 只索引长度 ≥3 的片段，
而**中文最常见的搜索词恰恰是 2 个字**。迁移到 FTS5 会让这些查询从「有结果」变成「无结果」，
是功能倒退而不是优化。

结论：保留 `LIKE`。代价是每次搜索扫描全部已发布文章的正文列；个人博客量级（数百篇、几 MB）
下是毫秒级。真正需要重新评估的触发条件是文章数达到数千篇——届时应引入外部分词
（如 jieba）再配 FTS5，而不是直接用内置分词器。`q` 已在路由层截断到 100 字符。

### 草稿预览

草稿只对管理员可见：`GET /api/articles/:id` 在 `isAdmin` 时返回未发布文章，否则 404；
公开路由 `GET /api/public/articles/:slug` 始终带 `published: true` 过滤。

刻意**不提供**「带签名的公开预览链接」：那需要在公开路由上开一个绕过 `published` 的口子，
签名校验或过期逻辑一旦写错就是草稿泄漏。预览保持在登录态内完成——编辑器里已有实时预览，
需要看整页效果时以管理员身份读取上述端点即可。

## 认证边界

- 密码只以 bcrypt 哈希保存。
- API 独占 `JWT_SECRET`，Web 不签发或离线验证 JWT。
- Web 通过 API 查询会话状态。
- 浏览器会话使用 HTTP-only Cookie。
- 邮箱验证码与限流计数均由 API 持久化并验证（手机号通道已移除）。

### 会话吊销

JWT 本身无法撤销，因此令牌中额外携带账号的 `User.tokenVersion`，
校验时与数据库比对：不一致即视为无效会话。

- 登出会自增代次，**该账号已签发的全部令牌立即失效**（含被盗令牌），
  而不是像以前那样只清 Cookie、让令牌继续有效到 7 天过期。
  代价是登出会让该账号在所有设备下线，这是有意选择的语义。
- 改密（`PUT /api/auth/password`）与邮箱重置（`POST /api/auth/password/reset`）
  同样通过自增该字段吊销全部旧令牌。改密时服务端会为当前设备补发一张新令牌，
  避免用户被自己踢下线。
- 缺少代次字段的历史令牌一律拒绝，与既有的「不声明角色即拒绝」策略一致。
- 这次比对复用 `getOptionalAuthSession` 本来就要做的用户查询（用于取当前角色），
  **不增加任何额外数据库往返**。

验证码模板、生命周期、限流和传输适配器均属于 API。Web 不得直接持有邮件或人机
验证服务的服务端密钥。当前渠道状态和目标接入边界见
[注册验证、消息投递与防刷](registration-delivery.md)。

## 部署拓扑

当前正式支持单机双进程：Nginx 只暴露 Web，API 默认监听 `127.0.0.1:3002`。PM2 分别管理 `blog-web` 与 `blog-api`。详细步骤见 [部署手册](deployment.md)。

## 已批准的目标架构（尚未实施）

下一阶段将在同一 Monorepo 和同一单机部署中增加独立 Admin 应用：

```text
Public Browser ──HTTPS──> Nginx ──> Web 127.0.0.1:3001

Trusted Device
  └── Ed25519 SSH local forward ──> Admin 127.0.0.1:3003

Web ───────┐
           ├──HTTP/contracts──> API 127.0.0.1:3002 ──> SQLite/media
Admin ─────┘
```

目标边界：

| 模块 | 目标职责 | 网络可见性 |
|---|---|---|
| `apps/web` | 公开页面、普通用户交互、公开/用户 API 入口 | 仅由 Nginx 公开 |
| `apps/admin` | 管理页面、管理员会话和管理 API 客户端 | 仅回环端口与 SSH 隧道 |
| `apps/api` | 公开、用户与管理员领域服务及最终授权 | 仅回环端口 |
| `packages/contracts` | 三个应用共享的可序列化契约 | 无运行时监听 |

公开 Web 在切换完成后不得包含管理路由，也不得代理 `/api/admin/*`。管理员登录必须与普通用户登录分离，普通登录入口不得为 `ADMIN` 角色签发会话。隐藏路径、非标准端口和伪装 404 都不属于安全边界；真正的入口控制来自回环监听、受限 SSH 本地转发和 API 服务端授权。

SSH 使用标准 Ed25519 挑战签名与会话加密。服务器只登记公钥；私钥使用强口令并保存在加密可移动介质中，不允许上传到服务器、网页、环境文件或 Git。专用 SSH 身份只能转发到 Admin 端口，不能获得 Shell 或访问其他内部服务。

完整迁移阶段和验收标准见[后续维护计划](next-plan.md)。在该计划完成前，以本章“当前架构”和现行部署手册为准。
