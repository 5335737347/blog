# 环境变量

根目录 `.env.example` 是唯一可提交模板。开发环境通常复制为 `.env.local`，生产环境可使用 `.env` 或部署平台的密钥管理功能。

```bash
cp .env.example .env.local
```

不要提交 `.env`、`.env.local` 或任何真实凭据。

运行时已存在的进程环境变量优先级最高；项目随后按 `.env.local`、`.env` 的顺序补充尚未
设置的值。生产环境不要同时在多个位置维护同一密钥，避免轮换时只更新其中一份。

**这条优先级有一个具体陷阱**：进程里已有的值会**挡住** `.env` 里的同名项，所以一个
残留的旧变量会让 `.env` 里正确的值完全不生效——改了配置却没有任何效果。
2026-09-17 真实踩到过：Web 的 `API_INTERNAL_URL` 被外部注入成旧端口，结果所有
`/api/*` 报 `ECONNREFUSED`，页面能打开但内容全空，而 `.env` 里明明是对的。

排查方向：

```bash
pm2 env <blog-web 的 id>    # 再在输出里找 API_INTERNAL_URL，看进程实际拿到什么
```

Web 启动时会探测一次 API 并给出结论；若配置指向别处、而默认地址
`127.0.0.1:3002` 上的 API 是健康的，日志会直接点明这是变量残留，而不是 API 没启动。
注意 PM2 的环境会跨 `startOrReload` 保留，改完 `.env` 后要确认进程环境已同步。

## 新增变量时的约定

`npm run check:docs` 会用正则扫描源码，要求每个用到的变量都出现在 `.env.example` 里。
该检查依赖变量名在源码中是**字面量**：

```js
process.env.BACKUP_KEEP          // ✅ 会被扫到
process.env["BACKUP_KEEP"]       // ✅ 同上，字面量方括号也支持
process.env[name]                // ❌ 扫不到
```

第三写法是「把 `.env` 文件读进 `process.env`」的解析器必须用的，属于合理例外；
但**不要**为了少写几个分支把硬编码的变量名藏进这种调用（例如
`parseKeep("BACKUP_KEEP")` 内部再 `process.env[name]`）——变量会从检查里消失。
这类动态读取会在检查结尾汇总列出，方便人工确认。

## 唯一的加载入口

**`scripts/load-env.mjs` 是项目里唯一读取 `.env` 文件的地方。** 其它模块一律调用它：

```js
import { loadProjectEnv, databaseUrl, mediaRootPath } from "./load-env.mjs";
loadProjectEnv();
```

API（`apps/api/src/bootstrap-env.ts`）、Next（`apps/web/next.config.ts`）、Prisma CLI
（`prisma.config.ts`）、seed 与全部仓库脚本都走这一份实现。
`npm run check:docs` 会拦截任何绕过它直接 `import "dotenv"` 的代码。

### 为什么必须只有一份

这段逻辑曾经散在 8 个文件里，而且是**两套互不兼容的实现**——dotenv 和一份手写正则
解析器。它们的差异全是静默的：

| 写法 | dotenv | 手写解析器 |
|---|---|---|
| `KEY=值 # 注释` | 剥掉注释 | 把「# 注释」当成值的一部分 |
| `export KEY=值` | 支持 | 整行匹配失败，直接忽略 |
| `KEY="a\nb"` | 展开转义 | 原样保留 |
| 文件查找 | 按传入路径 | `existsSync(".env.local")` 相对 **cwd** |

结果是「同一个 KEY，跑 seed 时和跑 API 时可能读到不同的值」。

更严重的是 `DATABASE_URL` **归一化也有三套不同实现**：

| 位置 | `file:./dev.db` 被解析成 |
|---|---|
| 旧 `bootstrap-env.ts` | `<root>/dev.db` |
| 旧 `prisma.config.ts` | `<root>/prisma/dev.db` |
| 旧 `next.config.ts` | `<root>/dev.db`（且 web 侧根本不用数据库） |

也就是说，按 `.env.example` 的默认写法配置时，**`prisma migrate` 改的是一个库、
API 读的是另一个库**。现在 `databaseFilePath()` / `databaseUrl()` 统一返回绝对路径，
不存在「相对谁解析」的歧义。

`mediaRootPath()` 同理，统一了备份脚本与 API 对媒体目录的定位。

## 运行与站点

| 变量 | 使用方 | 必需性 | 说明 |
|---|---|---|---|
| `API_PORT` | API | 可选 | Fastify 端口，默认 `3002` |
| `API_HOST` | API | 可选 | 默认 `127.0.0.1`，避免直接暴露 API |
| `API_INTERNAL_URL` | Web | 可选 | Web 访问 API 的私有地址，默认 `http://127.0.0.1:3002` |
| `SITE_URL` | Web/API | 生产必需 | 对外站点 origin，例如 `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | Web/API | 生产建议 | 浏览器可见站点 origin，通常与 `SITE_URL` 相同 |
| `OG_IMAGE_URL` | Web | 可选 | 默认社交分享图的绝对或站内 URL |

`API_INTERNAL_URL` 只供服务器使用，不要添加 `NEXT_PUBLIC_` 前缀。

## 数据与媒体

| 变量 | 使用方 | 说明 |
|---|---|---|
| `DATABASE_URL` | API/Prisma 工具 | SQLite 默认值为 `file:./prisma/dev.db`，相对仓库根解析 |
| `MEDIA_ROOT` | API | 上传目录；留空时使用 `apps/web/public` |

## 认证与初始化

| 变量 | 必需性 | 说明 |
|---|---|---|
| `JWT_SECRET` | 生产必需 | 用 `openssl rand -hex 32` 生成，API 独占 |
| `ADMIN_LOGIN_LOCKOUT_MINUTES` | 可选 | 管理员账号登录锁定的冷却时长，默认 `15`，上限 `1440`（24 小时） |
| `ADMIN_USERNAME` | 可选 | seed 管理员用户名 |
| `ADMIN_DISPLAY_NAME` | 可选 | seed 管理员显示名称 |
| `ADMIN_PASSWORD` | 生产初始化必需 | 留空时仅在开发终端生成临时密码 |
| `ALLOW_PRODUCTION_SEED` | 危险开关 | 仅在明确执行生产 seed 时临时设为 `true` |

```bash
openssl rand -hex 32
```

`getJwtSecret()` 会拒绝三类无效值，API 因此在配置错误时**直接启动失败**，而不是
悄悄地用一个弱密钥签发会话：

1. 未设置或少于 32 字符；
2. 含占位符特征（`change-me`、`replace`、`placeholder`、`your-secret`、`example` 等）；
3. 字符种类少于 10（例如 `"a".repeat(32)` 长度够但毫无随机性）。

第 2 条是回归修复：原先只精确比对 `replace-with-a-random-secret` 一个字符串，
而仓库里实际使用的占位符是 `change-me-to-a-random-string-in-production`——42 字符、
不在名单里，于是被放行。**不要用「改一个词的占位符」来通过检查，用上面那条命令生成。**

### 启动期校验（2026-09-17 补强）

API 在 `listen()` 之前会主动跑一次配置校验，**不合法就退出**，不再等第一个请求才报错：

| 情况 | 行为 |
|---|---|
| `JWT_SECRET` 缺失 / 过短 / 是占位符 / 熵不足 | 立即退出，stderr 写明原因与修复命令 |
| `SITE_URL` 非空但无法解析成 URL | 立即退出 |
| 生产环境未配置 `SITE_URL` | 启动成功并打印警告（同源校验退化为仅比对 Host，sitemap 缺绝对地址） |
| 生产环境 `TRUST_PROXY` 不是 `true` | 启动成功并打印警告（所有访客共用一个限流桶） |

这条补强的背景是一个真实故障模式：`JWT_SECRET` 无效时进程照常启动、`/health` 返回 200，
但每个需要签发或校验令牌的请求都 500（`/api/auth/me` 返回 500 而不是 401）——
部署脚本与监控都会以为服务是健康的。

### 管理员登录锁定

`/api/auth/login` 对 **ADMIN 账号**使用严格阈值：**恰好 3 次密码尝试**，第 1~3 次
输错返回 401，第 4 次起进入冷却；冷却期内即使密码正确也返回 429，
且拒绝发生在 bcrypt 之前（不消耗 CPU，爆破脚本刷不出算力优势）。
锁定键只跟账号绑定、不跟 IP 绑定，因此攻击者轮换 IP 也解不开；普通账号沿用
「15 分钟 10 次」的宽松规则。成功登录会清零计数。

429 响应带 `error.retryAfterSeconds`，管理端登录页据此显示剩余时间。

这是刻意的可用性取舍：知道管理员用户名的人可以故意输错 3 次，把管理员挡在门外
最多 `ADMIN_LOGIN_LOCKOUT_MINUTES` 分钟。对个人博客而言，这比「密码可被无限次
穷举」更可接受；若确实需要更短或更长，改这个变量即可（无需改代码）。

优雅关闭同样在启动期注册：`SIGTERM` / `SIGINT` 会先停止接收新连接、等在途请求结束，
再关闭数据库连接；`unhandledRejection` / `uncaughtException` 会记录结构化日志后退出，
而不是带着未知状态继续服务。

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

## 邮件注册

注册只支持邮箱验证码通道。邮箱注册使用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_STARTTLS`、`SMTP_USER`、`SMTP_PASSWORD` 和 `SMTP_FROM`。

当前 API 实现 SMTP 投递。Resend 与 Turnstile 的准备状态、接入边界与上线要求见
[注册验证、消息投递与防刷](registration-delivery.md)。不要把 Resend HTTP API Key
填入 `SMTP_PASSWORD`；新增提供商变量时必须同步更新 `.env.example` 和本文档。

生产环境可以把未启用的变量全部留空；`/api/auth/registration-options` 只应声明真实
可用的注册方式。不要为了让前端显示选项而填写占位凭据。

配置完成后用 `npm run smtp:check` 验证，它会按「配置 → 连接 → 能力 → 传输安全 → 认证 →
发件人」逐级探测并翻译失败原因（例如区分「Key 无效」和「发件域名未验证」），
`-- --send you@example.com` 会真发一封测试邮件。

⚠️ **`/api/auth/registration-options` 不能用来验证 SMTP**：只要
`ALLOW_DEBUG_VERIFICATION_CODE=true`，无论 SMTP 是否配好它都会报告邮箱通道可用。
本地默认就是开启状态，所以本地的 `true` 不构成任何证据。

## 可信代理

`TRUST_PROXY` 默认为 `false`。只有当 API 确定通过会覆盖客户端 IP 请求头的可信基础设施接收请求时才能启用，并使用 `TRUST_PROXY_HEADER` 选择请求头。

关闭代理信任时，API 使用 Fastify socket 的直接对端地址区分限流桶，不读取客户端提供的
转发头。错误启用可信代理会让攻击者伪造 IP，绕过按 IP 限流。

`TRUST_PROXY_HEADER` 只接受代理会**覆盖**的单值头：`x-real-ip`（默认，Nginx 用
`proxy_set_header X-Real-IP $remote_addr`）或 `cf-connecting-ip`。
**刻意不支持 `x-forwarded-for`**：它是可追加的列表头，Nginx 常用的
`$proxy_add_x_forwarded_for` 会把客户端自带的值留在最左端，等于让客户端自选限流身份；
配置成该值时 API 会记录一条警告并把身份归为 `unsupported-proxy-header`，不会静默退化。

未开启 `TRUST_PROXY` 时所有访客共用同一个限流桶（API 只看到代理地址），
单个来源即可触发全站登录/注册限流；生产环境启动时会针对这一点打印警告。

## CLI 发布

| 变量 | 说明 |
|---|---|
| `KPBLOG_API_URL` | `/api/publish` 完整地址 |
| `KPBLOG_API_KEY` | 后台生成的发布密钥，只保存于本地 |
| `KPBLOG_PUBLISH_MODE` | 可选：`draft` 或 `publish` |

完整变量、默认值和网关注释以 [`.env.example`](../.env.example) 为准。
