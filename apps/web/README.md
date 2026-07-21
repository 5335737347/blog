# Web 应用框架

`@kpblog/web` 是独立 Next.js 16 App Router 应用，负责公开页面、管理界面、服务端渲染和浏览器同域 API 入口。

## 运行

从仓库根目录执行：

```bash
npm run dev:web
npm run build:web
npm run start:web
```

默认端口为 `3001`。完整本地开发通常使用根命令 `npm run dev` 同时启动 API。

## 框架文件

| 文件/目录 | 职责 |
|---|---|
| `next.config.ts` | Monorepo root、Contracts 转译、`/api/*` rewrite、安全响应头 |
| `postcss.config.mjs` | Tailwind CSS 4 PostCSS 配置 |
| `tsconfig.json` | Web TypeScript、Next 插件和 `@/*` 路径别名 |
| `src/app` | App Router 页面、布局、metadata、RSS 与 sitemap |
| `src/proxy.ts` | 管理页面会话预检和登录跳转 |
| `src/components` | public、admin 和通用 UI 组件 |
| `src/lib/api` | SSR 调用独立 API 的服务器客户端 |
| `public` | 版本化静态资源和当前单机上传目录 |

## 边界

- 不创建 Next.js `/api` Route Handler；JSON API 属于 Fastify。
- 不安装或导入 Prisma、bcrypt、jose、Fastify及 API 服务源码。
- 不读取 `JWT_SECRET`；会话状态通过 `/api/auth/me` 获取。
- 浏览器请求使用相对 `/api/*`，SSR 请求使用 `API_INTERNAL_URL`。
- Proxy 只改善导航体验，API 授权才是安全边界。

## 计划中的 Admin 迁移

当前管理路由和组件仍在 Web 中，必须保持可用直到私有 Admin 切换完成。已批准的目标
是在同一 Monorepo 新建 `apps/admin`，将全部管理页面、组件和会话预检迁出；完成后
Web 不再包含 `/admin` 路由，也不代理 `/api/admin/*`。

迁移期间不要继续扩大 Web 内的管理功能，也不要建立跨应用源码导入。共用类型进入
`@kpblog/contracts`，复用 UI 应通过明确的共享包设计处理，不能把 Admin 实现重新
耦合回公开 Web。阶段与验收标准见 [`docs/next-plan.md`](../../docs/next-plan.md)。

## Server/Client Component

- 页面默认保持 Server Component。
- 状态、事件和浏览器 API 放在最小 Client Component 中。
- 服务端与客户端首帧不得依赖 `Date.now()`、`Math.random()` 或未同步的浏览器状态。
- 浏览器偏好使用稳定服务器快照或挂载后同步，避免 hydration mismatch。

修改框架配置或约定前，先阅读仓库安装版本 `node_modules/next/dist/docs/` 的相关文档。

## 验证

```bash
npm run typecheck --workspace @kpblog/web
npm run build:web
```

涉及界面时还需检查桌面、移动端、明暗主题和浏览器控制台。
