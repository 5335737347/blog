# 鲲鹏の博客 v2.1.0

一个面向长期维护的个人博客 Monorepo。前台使用明亮白色、天蓝和桃花红视觉体系，主页以完整二次元壁纸、动态搜索和五分钟轮换为核心。

线上地址：https://kpblog.cc

## 架构

项目仍是一个 Git 仓库，但包含两个可独立构建、启动和部署的应用：

```text
blog/
├── apps/
│   ├── web/                # Next.js 16 前台与管理界面，端口 3001
│   └── api/                # Fastify 后端 API，端口 3002
├── packages/
│   └── contracts/          # Web/API 共用的 TypeScript 数据契约
├── prisma/                 # 数据模型、迁移与种子数据
├── docs/                   # 开发、内容工作流和 API 文档
└── scripts/                # 开发、发布和更新脚本
```

浏览器始终请求同域 `/api/*`，由 Next.js rewrite 转发到 Fastify。Web 服务端渲染通过 `API_INTERNAL_URL` 访问 API。Web 不直接连接 Prisma，也不持有 `JWT_SECRET`；数据库、认证、授权、限流和上传全部属于 API。

当前上传媒体仍写入 `apps/web/public`，适合单机部署。多主机或容器部署前应迁移到对象存储。

## 技术栈

| 层 | 技术 |
|---|---|
| Web | Next.js 16 App Router、React 19、Tailwind CSS 4 |
| API | Fastify 5、TypeScript |
| 数据 | SQLite、Prisma 7、better-sqlite3 适配器 |
| 认证 | JWT HTTP-only Cookie、bcryptjs、邮箱/手机验证码 |
| 契约 | npm workspace `@kpblog/contracts` |
| 内容 | react-markdown、GFM、KaTeX、代码高亮 |
| 部署 | PM2 双进程、Nginx、Let's Encrypt |

## 文档

- [文档索引](docs/README.md)
- [总体架构](docs/architecture.md)
- [开发规范](docs/development.md)
- [环境变量](docs/environment.md)
- [部署手册](docs/deployment.md)
- [Web 框架说明](apps/web/README.md)
- [API 框架说明](apps/api/README.md)
- [共享契约说明](packages/contracts/README.md)
- [OpenAPI 契约](docs/openapi.yaml)

## 本地开发

```bash
cp .env.example .env.local
npm install
npm run db:generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

默认地址：

- Web：http://localhost:3001
- API 健康检查：http://127.0.0.1:3002/health
- 管理员登录：http://localhost:3001/admin/login

`npm run dev` 会同时启动两个应用。也可以分别运行 `npm run dev:web` 和 `npm run dev:api`。

开发环境没有配置 SMTP 或短信网关时，验证码接口会返回调试验证码；生产环境只开放已配置的注册方式。种子数据在未设置 `ADMIN_PASSWORD` 时会输出一次临时密码，生产环境必须显式设置强密码。

## 环境变量

以 [`.env.example`](.env.example) 为唯一可提交模板。真实值放入 `.env.local`、`.env` 或部署平台，禁止提交密钥。

核心变量：

```env
DATABASE_URL="file:./prisma/dev.db"
API_PORT="3002"
API_HOST="127.0.0.1"
API_INTERNAL_URL="http://127.0.0.1:3002"
JWT_SECRET="至少 32 字符的随机值"
SITE_URL="https://你的域名"
NEXT_PUBLIC_SITE_URL="https://你的域名"
```

邮件、短信、可信代理、CLI 发布等可选配置见[环境变量文档](docs/environment.md)。`MEDIA_ROOT` 留空时使用 `apps/web/public`。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动 Web 与 API 开发服务 |
| `npm run dev:web` / `npm run dev:api` | 单独启动一个应用 |
| `npm run build` | 依次构建 API 与 Web |
| `npm run start:web` / `npm run start:api` | 单独启动生产应用 |
| `npm run update` | 安全拉取、检查、备份、迁移、构建并重载生产服务 |
| `npm run check` | lint、类型检查和全部测试 |
| `npm run lint` | 检查所有 workspace 与脚本 |
| `npm run typecheck` | 检查根项目及所有 workspace |
| `npm test` | 服务测试与 Fastify API 测试 |
| `npm run db:migrate` | 创建/应用开发迁移 |
| `npm run db:seed` | 写入种子数据 |
| `npm run db:studio` | 打开 Prisma Studio |
| `npm run publish:draft -- <file>` | 通过 HTTP API 导入 Markdown 草稿 |
| `npm run publish:post -- <file>` | 通过 HTTP API 发布 Markdown |

不要在生产环境随意运行 `npm run db:reset`，该命令会重置数据库。

## 内容发布

后台支持文章、评论、图片、音乐、设置和 API Key 管理。命令行发布使用 `/api/publish`：

```bash
KPBLOG_API_URL=https://kpblog.cc/api/publish \
KPBLOG_API_KEY=你的密钥 \
npm run publish:post -- content/drafts/example.md
```

API Key 只放在本地环境变量中。详细流程见 [`docs/content-workflow.md`](docs/content-workflow.md)，接口契约见 [`docs/openapi.yaml`](docs/openapi.yaml)。

## 生产部署

Nginx 只公开代理 Web `127.0.0.1:3001`，API 默认仅监听 `127.0.0.1:3002`。PM2 通过 [`ecosystem.config.cjs`](ecosystem.config.cjs) 分别管理 `blog-web` 和 `blog-api`。

初次部署、Nginx 配置、备份范围、更新参数和发布后检查统一维护在[部署手册](docs/deployment.md)，避免根 README 与生产流程出现两个版本。

## 维护规则

- Web 和 API 只通过 HTTP 与 `@kpblog/contracts` 共享契约通信，不跨应用导入实现文件。
- Prisma 和安全逻辑只存在于 `apps/api`；React 页面只负责展示和交互。
- 新数据库变更必须提交 migration，新接口变更应同步契约、测试和 OpenAPI。
- 修改 Next.js API 前先阅读当前版本 `node_modules/next/dist/docs/`。
- 提交前运行 `npm run check && npm run build`。

更完整的边界和修改流程见[总体架构](docs/architecture.md)与[开发规范](docs/development.md)。
