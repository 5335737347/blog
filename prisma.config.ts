import { defineConfig } from "prisma/config";
import { databaseUrl, loadProjectEnv } from "./scripts/load-env.mjs";

/**
 * 环境加载统一走 scripts/load-env.mjs，与 API、Next、脚本完全同一套实现。
 *
 * 这里踩过两次坑，都记下来：
 *  1. 原先写的是 `import "dotenv/config"`，它只读 `.env`。于是 `prisma migrate`
 *     与 API 可能连到**不同的数据库**——在 .env.local 里覆盖 DATABASE_URL（本地
 *     覆盖最自然的落点）之后，迁移会打到 .env 指向的库，而应用连的是另一个。
 *  2. 随后这里又各自实现了一遍 URL 归一化（补 `prisma/` 前缀），与
 *     bootstrap-env 的绝对路径写法语义不同，同样会分叉。
 *
 * 现在两者都由 load-env.mjs 统一提供：`databaseUrl()` 返回绝对 `file:` URL，
 * 不存在「相对谁解析」的歧义。
 */
loadProjectEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl(),
  },
});
