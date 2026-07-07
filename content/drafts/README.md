# Drafts

这个目录用于存放准备导入或发布到 `kpblog.cc` 的 Markdown 草稿。

推荐流程：

1. 先在 Obsidian 写私人笔记。
2. 挑选适合公开的内容，整理到 `content/drafts/*.md`。
3. 本地导入后台检查，或通过 API 发布。
4. 发布后继续在后台微调摘要、标签、封面和分类。

推荐 frontmatter：

```markdown
---
title: 文章标题
slug: article-slug
tags: [学习路线, 全栈, AI]
excerpt: 一句话摘要
category: 技术
coverImage:
published: false
date: 2026-07-07
---
```

默认 `published: false` 更适合学习复盘，避免草稿误公开。
