# API 应用框架

`@kpblog/api` 是独立 Fastify 5 服务，拥有项目全部数据访问、认证授权、限流、媒体和发布逻辑。

## 运行

从仓库根目录执行：

```bash
npm run dev:api
npm run build:api
npm run start:api
```

默认监听 `127.0.0.1:3002`，健康检查为 `/health`。生产环境通常不直接暴露此端口。

## 框架文件

| 文件/目录 | 职责 |
|---|---|
| `src/index.ts` | 读取 host/port 并启动独立进程 |
| `src/app.ts` | 创建 Fastify、注册 Cookie/CORS/multipart、装配路由和错误处理 |
| `src/bootstrap-env.ts` | 从仓库根加载环境变量并统一路径 |
| `src/routes` | HTTP 输入、身份入口、状态码和 envelope |
| `src/server` | 领域服务、业务规则和 DTO 转换 |
| `src/lib` | Prisma、JWT、环境变量和通用基础设施 |
| `tests` | Fastify injection 接口测试 |
| `tsconfig.json` | 独立构建输出和 `@/*` 路径别名 |

## 路由约定

- `/health` 不使用 `/api` 前缀，用于进程探活。
- 业务端点统一位于 `/api/*`。
- JSON 成功和错误均使用 `@kpblog/contracts` 定义的 envelope。
- Route 只处理 HTTP 关注点，数据库和规则进入 `server/<domain>`。
- 受保护操作必须在每个 API 端点验证身份；写操作还需执行来源检查。

## 安全边界

- API 独占 Prisma、`JWT_SECRET`、密码哈希和验证码数据。
- 不向 DTO 暴露密码、验证码、Token、API Key 哈希或内部限流记录。
- `TRUST_PROXY` 默认关闭，启用前必须确认代理会覆盖选定请求头。
- 上传同时受 Nginx、Fastify multipart 和媒体服务校验约束。
- 新数据库字段必须配套 Prisma migration。

## 计划中的 Admin API 边界

私有 Admin 拆分尚未实施。目标是将管理操作统一到 `/api/admin/*`，把管理员登录、
Cookie/会话和普通用户登录明确分离；公开登录端点不得为 `ADMIN` 角色签发会话，公开
Web 也不得转发管理命名空间。

SSH 隧道只限制 Admin UI 的网络入口，不能替代 API 授权。每个管理端点仍须验证独立
管理员会话和角色，并补充“公网无法取得管理员会话、普通用户无法升级权限”的注入
测试。详细迁移顺序见 [`docs/next-plan.md`](../../docs/next-plan.md)。

## 新增功能顺序

1. 明确请求与响应 DTO。
2. 在 `server/<domain>` 实现并测试业务规则。
3. 在 `routes` 暴露 HTTP 接口并补充 injection 测试。
4. 跨应用类型加入 `packages/contracts`。
5. 更新 `docs/openapi.yaml` 和调用方。

## 验证

```bash
npm run typecheck --workspace @kpblog/api
npm test --workspace @kpblog/api
npm run build:api
```
