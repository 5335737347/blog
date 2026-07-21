# 内容发布工作流

文章可以通过管理后台批量导入，也可以使用仓库脚本调用发布 API。真实 API Key 只保存在本地环境变量中。

## Frontmatter

```markdown
---
title: 文章标题
slug: article-slug
tags: [学习路线, 全栈]
excerpt: 一句话摘要
category: 技术
coverImage: /images/example.webp
published: false
date: 2026-07-21
---
```

| 字段 | 说明 |
|---|---|
| `title` | 必填语义；省略时尝试读取一级标题 |
| `slug` | URL 片段；省略时由标题生成 |
| `tags` | 标签数组 |
| `excerpt` | 摘要；省略时从正文生成 |
| `category` | 分类；不存在时由服务创建 |
| `coverImage` | 站内或绝对封面 URL |
| `published` | 导入默认草稿，API 模式可由参数覆盖 |
| `date` | 发布时间；无效值会被拒绝或使用服务默认值 |

## 后台导入

1. 运行 `npm run dev`。
2. 登录 `/admin/import`。
3. 上传支持的 Markdown、DOCX、HTML 或文本文件。
4. 查看导入结果并进入编辑页校对。
5. 确认标题、slug、摘要、分类和标签后发布。

## 命令行发布

在 `.env.local` 中设置：

```env
KPBLOG_API_URL="http://localhost:3001/api/publish"
KPBLOG_API_KEY="后台生成的密钥"
```

导入草稿：

```bash
npm run publish:draft -- content/drafts/example.md
```

直接发布：

```bash
npm run publish:post -- content/drafts/example.md
```

## 发布前检查

```text
[ ] 不含密码、Token、API Key、私人路径或个人隐私
[ ] 标题和 slug 清晰且稳定
[ ] 摘要准确说明文章内容
[ ] 分类和标签数量合理
[ ] 图片 URL 可以公开访问
[ ] 代码块、公式、表格和标题层级渲染正常
[ ] 草稿/发布状态符合预期
```
