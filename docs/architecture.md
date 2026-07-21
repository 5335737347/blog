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
| `scripts` | 仓库级开发、发布、更新自动化 | 业务规则和密钥 |

依赖方向必须保持单向：应用可以依赖 Contracts，但 Web 和 API 不得直接导入彼此的源码。

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

## 认证边界

- 密码只以 bcrypt 哈希保存。
- API 独占 `JWT_SECRET`，Web 不签发或离线验证 JWT。
- Web 通过 API 查询会话状态。
- 浏览器会话使用 HTTP-only Cookie。
- 邮箱和手机验证码、限流计数均由 API 持久化并验证。

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
