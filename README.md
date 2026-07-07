# 鲲鹏の博客 v2.1.0

基于 Next.js 16 的全栈个人博客，二次元主题。6 篇 0 基础教程带你从零搭建。

线上地址：https://kpblog.cc

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 数据库 | SQLite + Prisma 5 + prisma migrate |
| 样式 | Tailwind CSS v4 |
| 认证 | JWT (jose) + bcryptjs + HTTP-only cookie |
| 编辑器 | @uiw/react-md-editor |
| 渲染 | react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight + rehype-slug |
| RSS | feed |
| 部署 | PM2 + Nginx + Let's Encrypt

## 快速开始

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

访问 http://localhost:3000

## 管理员

- 地址: `/admin/login`
- 账号: `admin` / `fengzhitanxi04..`

> ⚠️ 生产环境务必修改密码

## 功能

### 公开前台
- 📝 文章列表（分页 + 封面图）+ 文章详情 + Markdown 渲染
- 🏷️ 标签云 + 分类筛选 + 侧边栏（博主卡片/标签云/最近文章）
- 💬 评论系统（嵌套回复 + 后台审核）
- 🌓 主题切换器（明亮 / 黑暗 / 跟随系统，无闪烁）
- 🎵 全局音乐播放器（上一首 / 下一首 / 音量，切换页面不中断）
- 🌸 访客特效选择器（樱花 / 星星 / 雪花 / 关闭）
- 📋 代码块复制 + 语言标签 + 语法高亮
- 🔗 标题锚点跳转（目录点击直达）
- 📡 RSS 2.0 + sitemap
- ⬆️ 回到顶部按钮 + 阅读进度条

### 管理后台
- 📝 文章管理（新建/编辑/草稿/发布/删除，Markdown 编辑器实时预览）
- 🖼️ 图片管理（上传/预览/复制 URL/删除）
- 🎵 音乐管理（上传本地 mp3/添加外链/删除）
- ⚙️ 博客设置（标题/描述，实时生效）

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              # 根布局（ThemeProvider + MusicProvider + 特效）
│   ├── page.tsx                # 首页（Hero + 分页文章列表 + 侧边栏）
│   ├── not-found.tsx           # 404（萌系动画）
│   ├── articles/[slug]/page.tsx
│   ├── tags/[tag]/page.tsx
│   ├── rss.xml/route.ts
│   ├── sitemap.ts
│   ├── admin/
│   │   ├── page.tsx            # 文章管理面板
│   │   ├── login/page.tsx      # 登录
│   │   ├── articles/new + [id] # 新建/编辑文章
│   │   ├── images/page.tsx     # 图片管理
│   │   ├── music/page.tsx      # 音乐管理
│   │   └── settings/page.tsx   # 博客设置
│   └── api/                    # REST API（articles/comments/tags/upload/music/images/settings/auth）
├── components/
│   ├── public/  # Header, Footer, Hero, Sidebar, MusicPlayer, Effects, BackToTop...
│   ├── admin/   # AdminSidebar, AdminHeader, ArticleEditor, ArticleForm
│   └── ui/      # Button, Input, Textarea, Card
├── lib/         # prisma, auth, theme, utils
└── types/       # TypeScript 类型定义
prisma/
├── schema.prisma  # User, Post, Category, Tag, Comment, Music, Setting
└── seed.ts        # 示例数据
```

## 环境变量

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="生成一个随机字符串"
SITE_URL="http://localhost:3000"
```

可复制 `.env.example` 作为本地配置起点。不要提交 `.env` 或 `.env.local`。

## Obsidian 内容工作流

这个博客现在支持围绕 Obsidian 的学习输出流程：

- 本地公开草稿目录：`content/drafts/`
- 内容工作流文档：`docs/content-workflow.md`
- 支持 frontmatter：`title`、`slug`、`tags`、`excerpt`、`category`、`coverImage`、`published`、`date`
- 后台导入：`/admin/import`
- API 发布：`/api/publish`

命令行导入草稿：

```bash
npm run publish:draft -- content/drafts/example.md
```

发布到线上：

```bash
KPBLOG_API_URL=https://kpblog.cc/api/publish npm run publish:post -- content/drafts/example.md
```

API Key 放在 `.env.local` 或 shell 环境变量 `KPBLOG_API_KEY` 中，不要写进脚本、README 或文章。

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务 |
| `npm run db:studio` | Prisma Studio 数据管理 |
| `npm run db:migrate` | 数据库迁移 |
| `npm run db:seed` | 种子数据 |
| `npm run db:reset` | 重置数据库 |
| `npm run publish:draft -- <file>` | 将 Markdown 提交为草稿 |
| `npm run publish:post -- <file>` | 将 Markdown 发布为文章 |

## 自备图片资源（可选）

放到 `public/images/` 下：

| 文件 | 尺寸 | 用途 | 无图时行为 |
|------|------|------|-----------|
| `favicon.png` | 32×32 | 标签页图标 | 无图标 |
| `avatar-default.png` | 200×200 | 评论默认头像 | Gravatar retro + 首字母渐变 |
| `logo.png` | 80×80 | Header Logo | 🌸 emoji |
| `hero-bg.webp` | 1200×400 | 首页横幅背景 | CSS 渐变（已很好看） |
| `og-image.png` | 1200×630 | 社交分享卡片 | 无图 |
| `not-found.png` | 400×300 | 404 插画 | 🌸 emoji + 动画 |
| `back-to-top.gif` | 48×48 | 回到顶部按钮 | 渐变 SVG 箭头 |

## v2.0.0 重大变更

- 废弃 unified 预渲染 → 改用 react-markdown 服务端直出
- Markdown 渲染完全由 react-markdown + rehype-highlight + rehype-katex 处理
- 删除 contentHtml 字段，文章存储纯 Markdown
- 删除 renderMarkdown / regen-html

## 部署

### 初次部署

```bash
git clone https://github.com/5335737347/blog.git
cd blog
npm install
npx prisma generate
npx prisma migrate deploy
echo 'DATABASE_URL="file:./dev.db"' > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "SITE_URL=https://你的域名" >> .env
npm run build
pm2 start npm --name blog -- start
pm2 save
```

### 更新部署

```bash
npm run update
```

更新脚本会执行：

1. 检查 tracked 文件是否有本地改动，有改动则中止，避免静默丢文件。
2. `git pull --ff-only` 拉取最新代码。
3. `npm ci --include=dev` 安装锁定依赖。
4. `npx prisma generate` 生成 Prisma Client。
5. 备份 SQLite 数据库到 `backups/`。
6. `npx prisma migrate deploy` 执行迁移。
7. `npm run build` 构建生产包。
8. `pm2 restart blog --update-env` 重启服务并刷新环境变量。

可选参数：

```bash
npm run update -- --skip-backup
npm run update -- --skip-build
npm run update -- --skip-restart
npm run update -- --allow-dirty
```

如果 PM2 进程名不是 `blog`：

```bash
PM2_APP_NAME=your-app-name npm run update
```

### 注意事项

- 数据库: `prisma/dev.db`（单文件，备份即复制）
- 上传文件: `public/images/`、`public/music/`
- 切换到 PostgreSQL: 修改 `prisma/schema.prisma` 的 `provider` + `DATABASE_URL`
- API 发布: `/admin/settings` 生成 API Key → POST `/api/publish`
- 教程: https://kpblog.cc 有 6 篇 0 基础入门教程
