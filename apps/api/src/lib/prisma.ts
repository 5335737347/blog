import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function databaseUrl(): string {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  if (url.startsWith("file:./") && !url.startsWith("file:./prisma/")) {
    return `file:./prisma/${url.slice("file:./".length)}`;
  }
  return url;
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export interface SqliteRuntimeConfig {
  // 期望 "wal"；其它值表示并发读写仍会互斥（见 configureDatabaseRuntime）。
  journalMode: string;
  // 2 = FULL（SQLite 默认），1 = NORMAL。
  synchronous: number;
  busyTimeoutMs: number;
}

// SQLite 连接级运行模式，进程启动时执行一次。
//
// 为什么必须显式设置：
// 1. journal_mode 默认是 delete（本项目实测值）。rollback journal 下写事务提交
//    需要 EXCLUSIVE 锁，读者与写者互斥；而本服务的高频路径（登录 / 评论 /
//    验证码）每个请求都要写一次限流桶，`npm run update` 又会在 API 在线时做全库
//    VACUUM INTO 备份——两者叠加就可能让请求等锁甚至 SQLITE_BUSY。
//    WAL 模式下读不阻塞写、写不阻塞读，是当前单机部署唯一合适的模式。
// 2. synchronous=NORMAL 是 WAL 的推荐搭配：崩溃不会损坏数据库，最坏丢最近
//    若干已提交事务；换来的是提交不再每次 fsync。
// 3. busy_timeout 提到 10s，给备份 / 迁移这类外部连接留等待窗口
//    （better-sqlite3 默认 5s）。
//
// journal_mode 是持久化在数据库文件里的属性，一次设置长期有效；
// synchronous 与 busy_timeout 是连接级属性，必须每次启动重新设置。
export async function configureDatabaseRuntime(
  options: { busyTimeoutMs?: number } = {}
): Promise<SqliteRuntimeConfig> {
  const requested = options.busyTimeoutMs ?? 10_000;
  const busyTimeoutMs =
    Number.isFinite(requested) && requested >= 0 ? Math.floor(requested) : 10_000;

  const journal = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>(
    "PRAGMA journal_mode = WAL"
  );
  await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
  await prisma.$executeRawUnsafe(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  const [synchronous, busy] = await Promise.all([
    prisma.$queryRawUnsafe<{ synchronous: number | bigint }[]>("PRAGMA synchronous"),
    prisma.$queryRawUnsafe<{ timeout: number | bigint }[]>("PRAGMA busy_timeout"),
  ]);

  return {
    journalMode: journal[0]?.journal_mode ?? "unknown",
    synchronous: Number(synchronous[0]?.synchronous ?? -1),
    busyTimeoutMs: Number(busy[0]?.timeout ?? -1),
  };
}
