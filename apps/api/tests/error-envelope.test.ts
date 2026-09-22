import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";

/**
 * 失败响应的信封契约。
 *
 * 背景：管理员登录页曾经把 401/429 显示成「网络错误」。原因不在服务端，
 * 而是前端把同一个 Response 读了两次（`res.json()` 之后又 `res.clone()`），
 * 那次 TypeError 被 catch 成「网络错误」。这里把服务端这一侧钉住：
 * 只要服务端持续给出**可解析的** JSON 信封（并且 429 带 retryAfterSeconds），
 * 前端哪怕读法再保守也能拿到真实文案。
 */
let app: FastifyInstance;
const ORIGIN = "http://localhost:3001";

before(async () => {
  const { createTestDatabase } = await import("./helpers/test-db");
  const database = createTestDatabase("kpblog-envelope-test-");
  process.env.DATABASE_URL = `file:${database.databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-envelope-tests-000";
  process.env.SITE_URL = ORIGIN;
  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();

  const { prisma } = await import("../src/lib/prisma");
  await prisma.user.create({
    data: {
      username: "envelope-admin",
      password: await bcrypt.hash("correct-password-value", 10),
      role: "ADMIN",
    },
  });
  await prisma.rateLimitBucket.deleteMany({});
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
});

const login = (password: string) =>
  app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { username: "envelope-admin", password },
  });

test("every failure response is JSON with a parseable envelope", async () => {
  const wrong = await login("not-the-password");
  assert.equal(wrong.statusCode, 401);
  assert.match(String(wrong.headers["content-type"]), /application\/json/);
  const body = wrong.json();
  assert.equal(body.success, false);
  assert.equal(typeof body.error?.code, "string");
  assert.equal(typeof body.error?.message, "string");
  // 401 不应带剩余秒数（那是限流专用的字段）。
  assert.equal(body.error.retryAfterSeconds, undefined);
});

test("unknown routes use the same JSON failure envelope", async () => {
  const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });
  assert.equal(response.statusCode, 404);
  assert.match(String(response.headers["content-type"]), /application\/json/);
  const body = response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.message, "接口不存在");
});

test("the lockout response carries retryAfterSeconds inside the envelope", async () => {
  // 上一条用例已经消耗了 1 次机会，再错 2 次即用满 3 次。
  await login("not-the-password");
  await login("not-the-password");

  const locked = await login("correct-password-value");
  assert.equal(locked.statusCode, 429, "第 4 次尝试应被锁定");
  assert.match(String(locked.headers["content-type"]), /application\/json/);
  const body = locked.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "TOO_MANY_REQUESTS");
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
  assert.equal(typeof body.error.retryAfterSeconds, "number");
  assert.ok(
    body.error.retryAfterSeconds > 0 && body.error.retryAfterSeconds <= 15 * 60,
    `剩余秒数应在 (0, 900] 内，实际 ${body.error.retryAfterSeconds}`
  );
});
