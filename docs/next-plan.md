# 后续维护计划

Last checkpoint: 2026-07-21 Web/API Monorepo separation

## 当前状态

- 单 Git 仓库由 npm workspaces 管理。
- `apps/web` 是独立 Next.js 应用，不含 Route Handlers、Prisma 或 JWT 密钥。
- `apps/api` 是独立 Fastify 应用，负责全部数据和安全边界。
- `packages/contracts` 保存 Web/API 共享的可序列化契约。
- 浏览器通过 Web 同域 `/api/*` 代理访问 API；SSR 通过 `API_INTERNAL_URL` 直连。
- API 与 Web 可分别构建、启动，并由 PM2 作为两个进程管理。
- lint、类型检查、服务测试、Fastify 注入测试和生产构建均已通过。

## 下一优先级

1. 为登录、注册、文章 CRUD、评论审核、媒体上传和设置增加浏览器级端到端测试。
2. 在 CI 中固定运行 `npm ci`、`npm run check` 和 `npm run build`。
3. 部署前演练 `ecosystem.config.cjs` 与 Nginx 配置，并验证 Cookie、真实客户端 IP 和上传大小限制。
4. 在 Web/API 分主机或多副本前，将 `apps/web/public` 中的上传媒体迁移到对象存储。
5. 随接口演进逐步扩大 `packages/contracts` 覆盖面，并持续同步 `docs/openapi.yaml`。

## 每次变更检查

- 先读 `.codex/project-memory.md`；修改 Next.js 前读当前安装版本文档。
- 接口变化同时检查 API、Web 调用方、Contracts、测试和 OpenAPI。
- 数据库变化必须包含 migration。
- 不提交 `.env*`、数据库、备份、上传媒体、构建目录或真实密钥。
- 提交前检查 `git status`、`git diff --cached`、`git diff`，再运行 `npm run check && npm run build`。
