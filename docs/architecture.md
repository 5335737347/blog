# 总体架构

## 架构目标

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
