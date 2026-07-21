# 环境变量

根目录 `.env.example` 是唯一可提交模板。开发环境通常复制为 `.env.local`，生产环境可使用 `.env` 或部署平台的密钥管理功能。

```bash
cp .env.example .env.local
```

不要提交 `.env`、`.env.local` 或任何真实凭据。

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
| `JWT_SECRET` | 生产必需 | 至少 32 字符的随机值，API 独占 |
| `ADMIN_USERNAME` | 可选 | seed 管理员用户名 |
| `ADMIN_DISPLAY_NAME` | 可选 | seed 管理员显示名称 |
| `ADMIN_PASSWORD` | 生产初始化必需 | 留空时仅在开发终端生成临时密码 |
| `ALLOW_PRODUCTION_SEED` | 危险开关 | 仅在明确执行生产 seed 时临时设为 `true` |

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

## 邮件与短信

邮箱注册使用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_STARTTLS`、`SMTP_USER`、`SMTP_PASSWORD` 和 `SMTP_FROM`。

手机注册使用 `SMS_API_URL`、`SMS_API_TOKEN` 和 `SMS_SENDER`。短信网关必须是 HTTPS，并接受项目约定的 JSON 请求。生产环境不会开放未配置完成的注册方式。

## 可信代理

`TRUST_PROXY` 默认为 `false`。只有当 API 确定通过会覆盖客户端 IP 请求头的可信基础设施接收请求时才能启用，并使用 `TRUST_PROXY_HEADER` 选择请求头。

错误启用可信代理会让攻击者伪造 IP，绕过按 IP 限流。

## CLI 发布

| 变量 | 说明 |
|---|---|
| `KPBLOG_API_URL` | `/api/publish` 完整地址 |
| `KPBLOG_API_KEY` | 后台生成的发布密钥，只保存于本地 |
| `KPBLOG_PUBLISH_MODE` | 可选：`draft` 或 `publish` |

完整变量、默认值和网关注释以 [`.env.example`](../.env.example) 为准。
