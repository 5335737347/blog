# 项目文档

本文档目录只存放长期有效的正式说明。临时进度记录放在 `next-plan.md`，两者不替代正式文档。

根 `README.md` 只提供项目入口，`docs/` 解释跨模块行为，应用 README 解释各自框架边界。
当前实现与已批准目标必须分开描述；没有完成代码、部署和验收的能力不得使用“已上线”或
“已启用”等完成态措辞。

## 文档导航

| 文档 | 适用场景 |
|---|---|
| [总体架构](architecture.md) | 理解当前 Web/API 边界及已批准的私有 Admin 目标架构 |
| [开发规范](development.md) | 修改代码、增加接口、执行验证和准备提交 |
| [环境变量](environment.md) | 创建本地或生产环境配置 |
| [部署手册](deployment.md) | 使用 PM2、Nginx 和更新脚本部署单机实例 |
| [注册验证与投递](registration-delivery.md) | 配置验证码渠道、消息投递、防刷与上线验收 |
| [内容工作流](content-workflow.md) | 从 Markdown/Obsidian 导入或发布文章 |
| [前端设计方案](design-plan.md) | 查看视觉体系、设计令牌、页面结构与前端改版顺序 |
| [OpenAPI](openapi.yaml) | 查询 HTTP 接口、请求和响应契约 |
| [后续计划](next-plan.md) | 查看私有 Admin 迁移阶段、验收标准和其他技术债 |

## 应用文档

| 模块 | 文档 |
|---|---|
| Next.js Web | [`apps/web/README.md`](../apps/web/README.md) |
| Fastify API | [`apps/api/README.md`](../apps/api/README.md) |
| 共享契约 | [`packages/contracts/README.md`](../packages/contracts/README.md) |

## 文档维护规则

- 架构边界变化：更新 `architecture.md`、相关应用 README 和项目记忆。
- 环境变量变化：先更新根 `.env.example`，再更新 `environment.md`。
- 注册投递、防刷或服务商变化：更新 `registration-delivery.md`、环境变量、测试和项目记忆。
- HTTP 接口变化：更新代码、Contracts、测试和 `openapi.yaml`。
- 部署方式变化：更新 `deployment.md`、`ecosystem.config.cjs` 和根 README 的入口说明。
- 不在文档中写入真实域名凭据、密码、Token、验证码、私有 IP 或本地绝对路径。
- 命令默认从仓库根目录执行；需要切换目录时必须明确标注。
- 外部服务控制台准备完成不等于代码已经接入；使用“已准备、已实现、已部署、已验收”区分状态。
- 版本、测试数量、远端 CI 和部署状态必须有当前仓库或运行记录作为依据，不能沿用过期结论。
- 运行 `npm run check:docs` 检查内部链接、文档索引、引用的 npm 脚本和环境变量模板。
