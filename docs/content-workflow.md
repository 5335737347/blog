# Obsidian 到 kpblog.cc 内容工作流

目标：把学习计划中的笔记、项目日志、题解和复盘稳定沉淀到博客。

## 路径约定

| 内容 | 路径 |
|---|---|
| Obsidian vault | `/home/mx/Documents/note` |
| 博客源码 | `/home/mx/Project/blog` |
| 本地公开草稿 | `content/drafts` |
| 后台导入页面 | `/admin/import` |
| API 发布接口 | `/api/publish` |

## Markdown frontmatter

博客导入和 API 发布都支持这些字段：

```markdown
---
title: 文章标题
slug: article-slug
tags: [学习路线, 全栈, AI]
excerpt: 一句话摘要
category: 技术
coverImage: /images/example.webp
published: false
date: 2026-07-07
---
```

字段说明：

| 字段 | 说明 |
|---|---|
| `title` | 文章标题。没有时会读取一级标题。 |
| `slug` | URL 片段。没有时会从标题生成。 |
| `tags` | 标签数组，也会自动识别正文中的 `#tag`。 |
| `excerpt` | 摘要。没有时会自动从正文生成。 |
| `category` | 分类。不存在时会自动创建。 |
| `coverImage` | 封面图 URL。 |
| `published` | 是否发布。导入默认草稿，API 默认发布。 |
| `date` | 发布时间。无效或为空时使用当前时间。 |

## 后台导入

适合批量导入 Obsidian 整理后的 `.md` 文件。

1. 启动项目：`npm run dev`
2. 打开 `/admin/import`
3. 上传 `.md`、`.docx`、`.html` 或 `.txt`
4. 导入结果中点击“编辑”检查内容
5. 确认无误后发布

## 命令行发布

先设置 API Key：

```bash
export KPBLOG_API_KEY="你的 API Key"
```

本地导入为草稿：

```bash
npm run publish:draft -- content/drafts/example.md
```

发布到线上：

```bash
KPBLOG_API_URL=https://kpblog.cc/api/publish npm run publish:post -- content/drafts/example.md
```

不要把 `KPBLOG_API_KEY` 写入脚本、README、博客文章或 Git 仓库。

## 每周内容闭环

```text
周一：算法题解短笔记
周二：课程笔记
周三：博客项目开发日志
周四：把基础知识应用到博客项目
周五：整理公开草稿
周日：发布或更新 1 篇博客，做周复盘
```

## 公开前检查

```text
[ ] 没有 API Key、账号密码、私人路径或隐私内容
[ ] 标题和 slug 清晰
[ ] tags 不超过 5 个
[ ] 摘要能说明文章解决什么问题
[ ] 代码块能正常渲染
[ ] 文章里有自己的实际项目经验
```
