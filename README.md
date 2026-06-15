# 鲲鹏の博客

一个基于 Next.js 16 的全栈个人博客，二次元风格主题。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 数据库 | SQLite + Prisma 5 |
| 样式 | Tailwind CSS v4 |
| 认证 | JWT (jose) + bcryptjs |
| 编辑器 | @uiw/react-md-editor |
| 渲染 | react-markdown + remark-gfm |
| RSS | feed |

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
- 📡 RSS 2.0 + sitemap
- ⬆️ 回到顶部按钮

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

## 部署

### 初次部署

```bash
git clone https://github.com/5335737347/blog.git
cd blog
npm install
npx prisma generate
npx prisma db push
echo 'DATABASE_URL="file:./dev.db"' > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "SITE_URL=https://你的域名" >> .env
npm run build
pm2 start npm --name blog -- start
pm2 save
```

### 更新部署

本地 `git push` 后，服务器执行：

```bash
npm run update
```

等价于 `git pull && npm install && npx prisma generate && npm run build && pm2 restart blog`

### 注意事项

- 数据库: `prisma/dev.db`（单文件，备份即复制）
- 上传文件: `public/images/`、`public/music/`
- 切换到 PostgreSQL: 修改 `prisma/schema.prisma` 的 `provider` + `DATABASE_URL`
- API 发布: 用 `/admin/settings` 生成的 API Key，POST 到 `/api/publish`
