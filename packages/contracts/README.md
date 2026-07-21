# 共享契约包

`@kpblog/contracts` 是 Web 与 API 之间唯一允许共享的代码包，只包含可序列化 TypeScript 类型。

## 可以包含

- API success/error envelope。
- 请求与响应 DTO。
- 分页、文章、评论和公开设置等跨进程类型。
- 不带副作用的类型辅助定义。

## 不可以包含

- Prisma 类型或数据库记录。
- React 组件、Fastify 实例或框架运行时代码。
- 环境变量读取、文件系统、网络请求和其他副作用。
- 只被单个应用内部使用的实现细节。

新增或修改契约后，必须同时检查 API 返回值、Web 调用方、测试和 `docs/openapi.yaml`。

```bash
npm run typecheck --workspace @kpblog/contracts
```
