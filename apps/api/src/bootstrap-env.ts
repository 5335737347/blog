import {
  databaseUrl,
  loadProjectEnv,
  mediaRootPath,
  repositoryRoot,
} from "../../../scripts/load-env.mjs";

/**
 * API 进程的环境初始化，必须在任何读取配置的模块之前导入。
 *
 * 环境加载与路径解析统一交给 scripts/load-env.mjs（API、Next、Prisma CLI、
 * 仓库脚本共用同一份实现）。这里此前各自实现了一遍归一化，而且与
 * prisma.config.ts 的语义**不同**：
 *
 *   DATABASE_URL="file:./dev.db"   （.env.example 的默认写法）
 *     本文件旧逻辑 → <root>/dev.db
 *     迁移 CLI     → <root>/prisma/dev.db
 *
 * 同样的配置，迁移改一个库、应用读另一个库。现在由 databaseUrl() 统一返回
 * 绝对路径，不存在「相对谁解析」的歧义。
 */
loadProjectEnv();

// 未配置时保持原样，让 @/lib/prisma 走它自己的默认值。
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl();
}

process.env.MEDIA_ROOT ||= mediaRootPath();

export { repositoryRoot };
