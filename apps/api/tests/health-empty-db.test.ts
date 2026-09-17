import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

/**
 * 空数据库必须被健康检查判为不健康。
 *
 * 单独一个文件、单独一个进程：Prisma 客户端在模块加载时读取 DATABASE_URL，
 * 同一进程里换不了库。这里的故障形态很具体——**目录存在、库文件是空的**：
 * 如果只是「文件不存在」，better-sqlite3 会静默创建空库，`SELECT 1` 照样成功，
 * 于是 /health 返回 200 {"status":"ok"}，而所有真实端点 500。
 * 修复后探针改查 `_prisma_migrations`，空库必然失败。
 */
const emptyDir = mkdtempSync(path.join(tmpdir(), "kpblog-empty-db-"));
const emptyDatabasePath = path.join(emptyDir, "empty.db");
writeFileSync(emptyDatabasePath, "");

let app: FastifyInstance;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${emptyDatabasePath}`;
  process.env.JWT_SECRET = "test-secret-for-health-tests-0000000";
  process.env.SITE_URL = "http://localhost:3001";
  process.env.TRUST_PROXY = "false";

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect().catch(() => {});
  rmSync(emptyDir, { recursive: true, force: true });
});

test("health reports 503 for an unmigrated (empty) database file", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(
    response.statusCode,
    503,
    "空库必须判为不健康，否则监控、负载均衡与更新脚本的健康检查全部失去意义"
  );
  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, "degraded");
  assert.equal(body.data.checks.database, "error");

  // 健康检查是公开端点：不回显库文件路径。
  assert.equal(JSON.stringify(body).includes(emptyDatabasePath), false);
});
