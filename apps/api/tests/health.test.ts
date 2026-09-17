import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

/**
 * 健康检查的降级路径。
 *
 * 单独一个测试文件、单独一个进程：Prisma 客户端在模块加载时就读 DATABASE_URL，
 * 同一进程里没法换库。这里把 DATABASE_URL 指向一个**不存在的目录**下的库文件，
 * 于是连接建立就会失败——这是真实故障，不是 mock 出来的。
 *
 * （`prisma.$queryRaw` 由 Proxy 合成，既不是自有属性也不在原型上，
 * `t.mock.method` 对它无效，所以不走打桩路线。）
 */
const brokenDatabase = path.join(
  import.meta.dirname,
  "no-such-directory-for-health-test",
  "missing.db"
);

let app: FastifyInstance;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${brokenDatabase}`;
  process.env.JWT_SECRET = "test-secret-for-health-tests-0000000";
  process.env.SITE_URL = "http://localhost:3001";
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect().catch(() => {});
});

test("health reports 503 and degraded when the database is unreachable", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(
    response.statusCode,
    503,
    "数据库不可用时必须返回 503，否则监控无法据此摘流量"
  );

  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, "degraded");
  assert.equal(body.data.checks.database, "error");
  assert.equal(body.data.version, "0.1.0");
  assert.ok(
    Number.isInteger(body.data.uptimeSeconds),
    "降级响应同样要带上运行时长"
  );

  // 健康检查是公开端点：只报告状态，不回显数据库路径或错误栈。
  const serialized = JSON.stringify(body);
  assert.equal(
    serialized.includes(brokenDatabase),
    false,
    "响应不得泄漏数据库文件路径"
  );
  assert.equal(serialized.includes("no-such-directory"), false);
});
