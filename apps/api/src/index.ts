import { buildApp } from "@/app";
import { getJwtSecret, getSiteUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { databaseFilePath } from "../../../scripts/load-env.mjs";

const app = buildApp();
const port = Number.parseInt(process.env.API_PORT || "3002", 10);
const host = process.env.API_HOST || "127.0.0.1";

/**
 * 启动期配置校验：配置不可用时**立即退出**，而不是等第一个请求才炸。
 *
 * 之前的故障模式：`JWT_SECRET` 缺失或过弱时进程照常启动，`/health` 返回 200，
 * `registration-options` 也正常，但每个需要签发或校验令牌的请求都 500
 * （包括 `/api/auth/me` 返回 500 而不是 401）。部署脚本与监控都以为服务是好的。
 *
 * 这里在 `listen()` 之前碰一次真正的校验函数：
 * - `getJwtSecret()` 在缺失/占位符/低熵时抛错 → 直接退出，并写明怎么修；
 * - `SITE_URL` 配了但格式非法 → 退出（同源校验与 sitemap 都依赖它）；
 * - 生产环境未配置 `SITE_URL`、或未开启代理信任 → 打印明确警告。
 *   这两种情况都能跑，但会分别退化为「仅比对 Host」和「全站共用一个限流桶」，
 *   属于必须让运维看到的隐患。
 */
function assertRuntimeConfig(): string[] {
  const warnings: string[] = [];

  // 抛错即终止：这是本次修复的核心，不要把它挪进 try。
  getJwtSecret();

  const siteUrlRaw = (process.env.SITE_URL ?? "").trim();
  if (siteUrlRaw && !getSiteUrl()) {
    throw new Error(
      "SITE_URL 不是合法的 URL：请填写形如 https://example.com 的站点来源。"
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && !siteUrlRaw) {
    warnings.push(
      "未配置 SITE_URL：同源校验退化为仅比对 Host 头，sitemap/canonical 也会缺少绝对地址。"
    );
  }
  if (isProduction && process.env.TRUST_PROXY !== "true") {
    warnings.push(
      "TRUST_PROXY 未开启：API 只能看到反向代理的地址，所有访客会共用一个限流桶" +
        "（单个来源即可让全站登录/注册被限流）。请在确认代理会覆盖所选头之后设置 " +
        'TRUST_PROXY="true" 与 TRUST_PROXY_HEADER="x-real-ip"。'
    );
  }

  return warnings;
}

let warnings: string[];
try {
  warnings = assertRuntimeConfig();
} catch (error) {
  process.stderr.write(
    `[api] 启动失败：${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}

// 启动时把实际使用的数据库文件打出来：脚本（冒烟、测试）需要能核对
// 「我以为连的库」和「实际连的库」是同一个。此前它只在出错时才暴露差异。
//
// 用 stderr 而不是 app.log：pino 写 stdout 时是带缓冲的，父进程通过管道捕获日志时
// 拿不到及时输出，冒烟脚本的自检会误判为「日志里没有 database 字段」。
process.stderr.write(
  `[api] database=${databaseFilePath()} port=${port} host=${host}\n`
);
for (const warning of warnings) {
  process.stderr.write(`[api] 警告：${warning}\n`);
}
app.log.info({ database: databaseFilePath(), port, host, warnings }, "API 启动中");

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

/**
 * 优雅关闭。
 *
 * PM2 的 `kill_timeout` 是 5 秒，超时后直接 SIGKILL：没有这段处理时在途请求会被
 * 硬切断，Prisma/SQLite 连接也不会正常关闭。`app.close()` 会先停止接收新连接、
 * 等在途请求结束后再执行 onClose 钩子。
 *
 * 进程级异常按「先记录、再退出」处理：不捕获 `unhandledRejection` 时 Node 默认
 * 也会终止进程，但不会有可检索的结构化日志；而吞掉它会让进程带着未知状态继续
 * 服务，那比退出更危险。
 */
let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "开始优雅关闭");
  try {
    await app.close();
    await prisma.$disconnect();
    app.log.info("已关闭 HTTP 服务与数据库连接");
  } catch (error) {
    app.log.error({ err: error }, "关闭过程中出错");
    exitCode = 1;
  }
  process.exit(exitCode);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "未处理的 Promise 拒绝，进程退出");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  app.log.error({ err: error }, "未捕获异常，进程退出");
  void shutdown("uncaughtException", 1);
});
