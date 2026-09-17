# 内容发布工作流

文章可以通过管理后台批量导入，也可以使用仓库脚本调用发布 API。真实 API Key 只保存在本地环境变量中。API Key 仅在所属账号仍为管理员时有效；账号被降级或删除后，原有密钥会立即失效。

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
| `date` | 发布日期；仅发布状态使用，有效值按该时间发布，无效或缺失时使用当前时间 |

Frontmatter 解析支持简单标量、`true`/`false`、行内数组和 `- item` 列表，不是完整 YAML
实现。复杂嵌套对象、锚点或多行 YAML 语法不会被解释。

## 后台导入

1. 运行 `npm run dev`。
2. 登录 `/admin/import`。
3. 上传支持的 Markdown、DOCX、HTML 或文本文件。
4. 查看导入结果并进入编辑页校对。
5. 确认标题、slug、摘要、分类和标签后发布。

后台接受 `.md`、`.docx`、`.html`、`.htm` 和 `.txt`，单文件上限为 10MB。DOCX 会转换为
Markdown；其他格式按文本读取并规范化换行。后台导入默认保存为草稿，但 frontmatter 中
明确的 `published: true` 会直接发布。slug 冲突时该文件导入失败，不会覆盖已有文章。

## 命令行发布

在 `.env.local` 中设置：

```env
KPBLOG_API_URL="https://kpblog.cc/api/publish"
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

`publish:draft` 强制保存草稿，`publish:post` 强制发布，二者会覆盖 frontmatter 的
`published`。发布 API 默认创建新文章，不更新同 slug 的现有文章；冲突会返回错误。

## 本地直写发布（仅限本机）

`npm run publish:local` 直接调用 API 的 `publishMarkdown` 并写入数据库，
不需要启动服务，也不需要 API Key：

```bash
npm run publish:local -- content/drafts/example.md
```

**它绕过服务端全部保护**，只应在自己机器上使用：

| 被绕过的东西 | 说明 |
|---|---|
| API Key 鉴权 | 不需要任何凭据 |
| 同源校验 | 不经过 HTTP 层 |
| 按 IP 限流 | 不经过 HTTP 层 |
| `DATABASE_URL` 指向 | **写的是本机数据库**，不是线上 |

因此它适合「本机自测发布流程」或「服务没起来时救急」。
要发布到线上请始终使用上面的 `publish:post`（走 HTTP + API Key）。

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
