import { buildApp } from "@/app";
import { databaseFilePath } from "../../../scripts/load-env.mjs";

const app = buildApp();
const port = Number.parseInt(process.env.API_PORT || "3002", 10);
const host = process.env.API_HOST || "127.0.0.1";

// 启动时把实际使用的数据库文件打出来：脚本（冒烟、测试）需要能核对
// 「我以为连的库」和「实际连的库」是同一个。此前它只在出错时才暴露差异。
//
// 用 stderr 而不是 app.log：pino 写 stdout 时是带缓冲的，父进程通过管道捕获日志时
// 拿不到及时输出，冒烟脚本的自检会误判为「日志里没有 database 字段」。
process.stderr.write(
  `[api] database=${databaseFilePath()} port=${port} host=${host}\n`
);
app.log.info({ database: databaseFilePath(), port, host }, "API 启动中");

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
