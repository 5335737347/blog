# 开发规范

相关入口：[总体架构](architecture.md) · [Web 框架](../apps/web/README.md) · [API 框架](../apps/api/README.md) · [共享契约](../packages/contracts/README.md)

## 仓库边界

这是单 Git 仓库、npm workspaces 管理的 Monorepo：

```text
apps/web/                 Next.js 页面、管理界面和同域 API 代理
apps/api/                 Fastify HTTP API、业务服务、认证和数据库访问
packages/contracts/       跨进程共享的 TypeScript DTO 与 API envelope
prisma/                   schema、migrations、seed
docs/                     面向开发者和用户的正式文档
scripts/                  仓库级开发、发布和部署自动化
```

物理分离意味着两个应用可以独立构建和启动。它不意味着拆成两个 Git 仓库：原子提交、共享契约、迁移和部署脚本仍应处在同一提交中。

## 依赖方向

```text
Browser ──同域 /api──> Next.js rewrite ──HTTP──> Fastify ──> Prisma
                           │                       │
Web SSR ──API_INTERNAL_URL─┘                       └──> 媒体存储

apps/web ──类型依赖──> packages/contracts <──类型依赖── apps/api
```

- `apps/web` 不得导入 Prisma、API 服务实现、JWT 密钥或后端认证函数。
- `apps/api` 不得导入 React、Next 页面或 Web 组件。
- `packages/contracts` 只包含可序列化的共享类型，不依赖任一应用实现。
- 浏览器使用 `/api/*`，避免跨域 Cookie；SSR 使用私有 `API_INTERNAL_URL`。
- 权限检查必须由 API 在每个受保护端点执行。Web 的管理路由代理只是体验层，不是安全边界。

## Web 目录职责

```text
apps/web/src/
├── app/                    # App Router 页面与布局；不包含后端 Route Handlers
├── components/
│   ├── admin/              # 后台领域组件
│   ├── public/             # articles/auth/comments/home/layout/music/preferences
│   └── ui/                 # 无业务含义的基础组件
├── config/                 # 可提交的产品配置，不放密钥
├── lib/api/                # SSR API 客户端和浏览器请求基础设施
└── proxy.ts                # 管理页面会话预检
```

默认使用 Server Component。仅在需要状态、事件、Effect、`window` 或 `localStorage` 的最小边界添加 `"use client"`。渲染阶段不调用 `Date.now()`、`Math.random()` 或读取浏览器状态；SSR 与客户端首帧必须稳定一致。

修改 Next.js 路由、组件边界、Proxy 或配置前，必须阅读当前安装版本 `node_modules/next/dist/docs/` 的对应章节。

## API 目录职责

```text
apps/api/src/
├── routes/                 # HTTP 输入、状态码、认证入口和响应 envelope
├── server/                 # 按领域组织的业务服务与 DTO
├── lib/                    # Prisma、认证和通用基础设施
├── app.ts                  # Fastify 插件与路由装配
└── index.ts                # 独立进程入口
```

- Route 文件保持轻量，数据库查询和业务规则放在 `server/<domain>`。
- 写操作必须检查来源；受保护操作必须在 API 内验证用户或管理员身份。
- DTO 不直接泄露 Prisma 记录，密码、验证码、JWT、API Key 摘要和内部字段禁止返回。
- 所有 JSON 响应继续使用共享的 success/error envelope。
- 新路由同时更新 Fastify 注入测试、`packages/contracts`（如跨边界使用）和 `docs/openapi.yaml`。

## 数据与媒体

- `prisma/schema.prisma` 是模型来源，所有生产数据库变更必须配套 migration。
- `DATABASE_URL=file:./prisma/dev.db` 相对仓库根解析。
- 当前 `MEDIA_ROOT` 默认指向 `apps/web/public`，只适用于 Web/API 共用磁盘的单机部署。
- 上传图片、音乐、数据库、备份和真实环境文件不进入 Git；主页主题资源属于版本化静态资产，可以提交。
- 多主机部署前将上传媒体迁移至对象存储，并让 API 返回稳定公共 URL。

## 命名与导入

- 同一领域使用相对导入；应用内部跨领域使用各自的 `@/` 别名。
- 应用之间禁止相对路径穿越，只能通过 HTTP 和 workspace 契约交互。
- React 组件使用 `PascalCase`；服务、配置和工具文件使用 `kebab-case`；变量与函数使用 `camelCase`。
- 避免跨 Server/Client 边界的大型 barrel export。

## 修改流程

1. 阅读 `.codex/project-memory.md` 和任务相关框架文档。
2. 确认改动属于 Web、API、Contracts、Prisma 或仓库自动化中的哪一层。
3. 接口变化先明确请求/响应契约，再修改 API 与 Web 调用方。
4. 架构、安全、部署或产品决定完成后更新项目记忆；正式说明写入 `docs/`。
5. 运行 `npm run check`，涉及运行时、路由或构建配置时再运行 `npm run build`。
6. 涉及界面时用真实浏览器检查桌面和移动端，并确认控制台没有 hydration 错误。

## 提交卫生

- 一个提交只承载一个清晰目的；架构迁移可按“基础 workspace → API 迁移 → Web 接入 → 部署文档”拆分。
- 提交前检查 `git status`、`git diff --cached` 和 `git diff`，不要混入数据库、媒体、`.env*`、构建目录或无关个人文档。
- 使用 `package-lock.json` 固定整个 workspace 依赖，不在子目录维护第二份 lockfile。
- 不保留已经失效的兼容层、重复服务或 Next Route Handler；历史由 Git 负责保存。
- 不用 `git reset --hard` 或覆盖未确认的本地改动。

## 文档同步矩阵

| 变更 | 必须同步 |
|---|---|
| Web 框架、路由或渲染边界 | `apps/web/README.md`、相关 Next.js 文档依据 |
| API 路由或响应 | Contracts、测试、`docs/openapi.yaml`、`apps/api/README.md`（边界变化时） |
| 环境变量 | `.env.example`、`docs/environment.md` |
| 部署进程或端口 | `ecosystem.config.cjs`、`docs/deployment.md`、根 README |
| 数据模型 | Prisma migration、相关 API 契约和测试 |
| 重大架构/安全决策 | `docs/architecture.md`、`.codex/project-memory.md` |
