# 项目文档

本文档目录只存放长期有效的正式说明。临时进度记录放在 `next-plan.md`，面向 Codex 的项目决策记录放在 `.codex/project-memory.md`，两者不替代正式文档。

## 文档导航

| 文档 | 适用场景 |
|---|---|
| [总体架构](architecture.md) | 理解 Web、API、Contracts、数据库和媒体之间的关系 |
| [开发规范](development.md) | 修改代码、增加接口、执行验证和准备提交 |
| [环境变量](environment.md) | 创建本地或生产环境配置 |
| [部署手册](deployment.md) | 使用 PM2、Nginx 和更新脚本部署单机实例 |
| [内容工作流](content-workflow.md) | 从 Markdown/Obsidian 导入或发布文章 |
| [OpenAPI](openapi.yaml) | 查询 HTTP 接口、请求和响应契约 |
| [后续计划](next-plan.md) | 查看当前技术债和下一阶段工作 |

## 应用文档

| 模块 | 文档 |
|---|---|
| Next.js Web | [`apps/web/README.md`](../apps/web/README.md) |
| Fastify API | [`apps/api/README.md`](../apps/api/README.md) |
| 共享契约 | [`packages/contracts/README.md`](../packages/contracts/README.md) |

## 文档维护规则

- 架构边界变化：更新 `architecture.md`、相关应用 README 和项目记忆。
- 环境变量变化：先更新根 `.env.example`，再更新 `environment.md`。
- HTTP 接口变化：更新代码、Contracts、测试和 `openapi.yaml`。
- 部署方式变化：更新 `deployment.md`、`ecosystem.config.cjs` 和根 README 的入口说明。
- 不在文档中写入真实域名凭据、密码、Token、验证码、私有 IP 或本地绝对路径。
- 命令默认从仓库根目录执行；需要切换目录时必须明确标注。
