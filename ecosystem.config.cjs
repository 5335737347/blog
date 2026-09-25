const path = require("node:path");

const repositoryRoot = __dirname;

/**
 * 部署约束：`blog-api` 必须保持单实例（PM2 默认即单实例，不要改成 cluster
 * 或把 instances 调大）。
 *
 * 原因：数据层是 SQLite，API 通过 better-sqlite3 同步驱动访问它。应用启动时会把
 * 数据库切到 WAL 模式（见 apps/api/src/lib/prisma.ts 的 configureDatabaseRuntime），
 * 单写者模型下这是安全的；但多进程同时写同一个 SQLite 文件既没有收益，也会把
 * 「应用内互斥」变成跨进程锁竞争。需要横向扩展时应先迁移到真正的多用户数据库，
 * 而不是给这个进程加副本。
 */
module.exports = {
  apps: [
    {
      name: "blog-api",
      cwd: repositoryRoot,
      script: path.join(repositoryRoot, "apps/api/dist/index.js"),
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "blog-web",
      cwd: path.join(repositoryRoot, "apps/web"),
      script: path.join(repositoryRoot, "node_modules/next/dist/bin/next"),
      args: "start --hostname 127.0.0.1 --port 3001",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "768M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
