import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-sqlite-runtime-");

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("startup runtime config switches SQLite to WAL with NORMAL sync and a 10s busy timeout", async () => {
  const { configureDatabaseRuntime, prisma } = await import("../src/lib/prisma");

  const before = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
  assert.equal(
    before[0]?.journal_mode,
    "delete",
    "SQLite 默认不是 WAL——这正是必须在启动时显式配置的原因"
  );

  const runtime = await configureDatabaseRuntime();
  assert.equal(runtime.journalMode, "wal");
  assert.equal(runtime.synchronous, 1, "NORMAL 的数值是 1");
  assert.equal(runtime.busyTimeoutMs, 10_000);

  // 幂等：重复启动（或 PM2 重启）不应报错，也不应退回 delete。
  const again = await configureDatabaseRuntime();
  assert.deepEqual(again, runtime);

  // journal_mode 存在数据库文件里：备份脚本等其它连接看到的也必须是 wal，
  // 否则线上仍会是「一个连接 WAL、另一个连接 rollback journal」的错配。
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const other = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${database.databasePath}` }),
  });
  try {
    const rows = await other.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    assert.equal(rows[0]?.journal_mode, "wal");
  } finally {
    await other.$disconnect();
  }

  // WAL 是持久属性：重新打开同一文件（模拟 API 重启）仍然是 wal。
  const reopened = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${database.databasePath}` }),
  });
  try {
    const rows = await reopened.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    assert.equal(rows[0]?.journal_mode, "wal", "journal_mode 应持久化在数据库文件中");
  } finally {
    await reopened.$disconnect();
  }
});
