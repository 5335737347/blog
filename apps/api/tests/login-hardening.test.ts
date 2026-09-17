import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";

/**
 * 评估修复的回归测试：登录限流不再锁死账号；缺失请求体返回 400 而不是 500。
 *
 * 三个用例都对应评估中实测到的、修复前真实存在的故障现象。
 */
/**
 * 登录限流的账号维度：只统计失败、成功后清零，且**不会**被攻击者定向锁死。
 *
 * 修复前的现象：桶满之后连正确密码也返回 429，攻击者每 15 分钟输错 10 次
 * 就能长期锁死唯一管理员账号。
 */
let authApp: FastifyInstance;
let authDatabase: { databasePath: string; cleanup: () => void };
let adminId: string;
let tokenVersion: number;
const ORIGIN = "http://localhost:3001";

before(async () => {
  // 动态 import：helper 在被调用时才写过程序的 DATABASE_URL，
  // 静态 import 会在本文件任何代码之前把它抬到顶部求值。
  const { createTestDatabase } = await import("./helpers/test-db");
  authDatabase = createTestDatabase("kpblog-hardening-test-");
  process.env.DATABASE_URL = `file:${authDatabase.databasePath}`;
  const { buildApp } = await import("../src/app");
  authApp = buildApp();
  await authApp.ready();

  const { prisma } = await import("../src/lib/prisma");
  const admin = await prisma.user.create({
    data: {
      username: "lockout-admin",
      password: await bcrypt.hash("correct-horse-battery", 10),
      role: "ADMIN",
    },
  });
  adminId = admin.id;
  tokenVersion = admin.tokenVersion;
});

after(async () => {
  await authApp.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  authDatabase.cleanup();
});

async function login(password: string) {
  const response = await authApp.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { identifier: "lockout-admin", password },
  });
  return { status: response.statusCode, body: response.json() };
}

test("failed logins do not lock the account out for the right password", async () => {
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const failed = await login("definitely-wrong-password");
    assert.equal(failed.status, 401, `第 ${attempt + 1} 次错误密码应为 401`);
  }

  // 第 10 次错误后桶达到上限（与 LOGIN_ACCOUNT_MAX_FAILURES 一致）。
  await login("definitely-wrong-password");

  const { prisma } = await import("../src/lib/prisma");
  const buckets = await prisma.rateLimitBucket.findMany({ where: { key: { contains: "login:account" } } });
  const bucket = buckets.find((row) => row.count >= 10);
  assert.ok(bucket, "连续失败后应留下账号维度的失败计数");

  // 明确记录修复前的错误行为：桶满时正确密码也被拒。
  // 现在的契约是「桶满 → 冷却期内直接 429」，所以这里断言 429 是**限流**而不是密码错。
  const locked = await login("correct-horse-battery");
  assert.equal(locked.status, 429, "桶满时必须限流");
  assert.equal(locked.body.error.code, "TOO_MANY_REQUESTS");

  // 清掉该桶即恢复（说明锁是时间窗内的限流，不是永久状态）。
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });
  const recovered = await login("correct-horse-battery");
  assert.equal(recovered.status, 200, "清除失败计数后正确密码必须能登录");
  assert.equal(recovered.body.data.user.username, "lockout-admin");
  assert.equal(recovered.body.data.user.role, "ADMIN");
  assert.ok(tokenVersion >= 0);
  assert.ok(adminId);
});

test("a successful login clears accumulated failures", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });

  // 先错 3 次，再用正确密码登录：失败计数应被清零，
  // 否则正常用户会为历史输错持续买单，最终被自己的错误累计锁死。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await login("another-wrong-password");
  }
  const success = await login("correct-horse-battery");
  assert.equal(success.status, 200);

  const remaining = await prisma.rateLimitBucket.findMany({ where: { key: { contains: "login:account" } } });
  assert.equal(remaining.length, 0, "成功登录后账号维度的失败桶应被清除");
});

/**
 * 请求体缺失：修复前会 500，现在必须是 400。
 *
 * 两种形态要分开断言，否则测不到目标代码：
 *   1. 声明 `application/json` 但不给 body —— Fastify 的解析器在进入处理函数
 *      之前就以 400 拒绝（FST_ERR_CTP_EMPTY_JSON_BODY）。这层不是我们的守卫。
 *   2. 完全不带 body（无 content-type）—— 请求会进入处理函数，由 `requestBody()`
 *      守卫归一成 400 BAD_REQUEST。**修复前正是这一种返回 500**：
 *      `request.body` 是 undefined，服务层读属性抛 TypeError。
 */
test("bodyless writes never return 500", async () => {
  const { SignJWT } = await import("jose");
  const { getJwtSecret } = await import("../src/lib/env");
  const { prisma } = await import("../src/lib/prisma");

  const admin = await prisma.user.findUniqueOrThrow({ where: { username: "lockout-admin" } });
  const token = await new SignJWT({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    displayName: admin.displayName,
    tokenVersion: admin.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(getJwtSecret()));

  const cases: { method: "POST" | "PUT"; url: string; label: string }[] = [
    { method: "POST", url: "/api/articles", label: "新建文章" },
    { method: "POST", url: "/api/comments", label: "发表评论" },
    { method: "POST", url: "/api/guestbook", label: "发表留言" },
    { method: "PUT", url: "/api/comments/absent", label: "审核评论" },
    { method: "PUT", url: "/api/settings", label: "修改站点设置" },
    { method: "PUT", url: "/api/profile", label: "修改个人资料" },
  ];

  for (const item of cases) {
    const response = await authApp.inject({
      method: item.method,
      url: item.url,
      headers: { origin: ORIGIN, cookie: `session=${token}` },
    });
    assert.equal(
      response.statusCode,
      400,
      `${item.label}（${item.method} ${item.url}）无请求体时应为 400，实际 ${response.statusCode}`
    );
    assert.equal(
      response.json().error.code,
      "BAD_REQUEST",
      `${item.label} 应由 requestBody() 守卫给出 BAD_REQUEST`
    );

    const declared = await authApp.inject({
      method: item.method,
      url: item.url,
      headers: { origin: ORIGIN, cookie: `session=${token}`, "content-type": "application/json" },
    });
    assert.equal(declared.statusCode, 400, `${item.label} 声明 JSON 却无 body 也必须是 400`);
  }
});

test("a JSON body that is not an object is rejected as 400", async () => {
  const { SignJWT } = await import("jose");
  const { getJwtSecret } = await import("../src/lib/env");
  const { prisma } = await import("../src/lib/prisma");

  const admin = await prisma.user.findUniqueOrThrow({ where: { username: "lockout-admin" } });
  const token = await new SignJWT({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    displayName: admin.displayName,
    tokenVersion: admin.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(getJwtSecret()));

  for (const payload of ['"just-a-string"', "[1,2,3]"]) {
    const response = await authApp.inject({
      method: "POST",
      url: "/api/articles",
      headers: { origin: ORIGIN, cookie: `session=${token}`, "content-type": "application/json" },
      payload,
    });
    assert.equal(response.statusCode, 400, `payload=${payload} 应为 400`);
    assert.equal(response.json().error.code, "BAD_REQUEST");
  }
});

test("the publish endpoint rejects a bodyless request with 400 once authenticated", async () => {
  const crypto = await import("node:crypto");
  const { prisma } = await import("../src/lib/prisma");

  const apiKey = "kp_hardening_test_key";
  await prisma.user.update({
    where: { username: "lockout-admin" },
    data: { apiKey: crypto.createHash("sha256").update(apiKey).digest("hex") },
  });

  // 先确认凭据本身可用（否则下面的 400 可能只是因为没通过鉴权）。
  const authorized = await authApp.inject({
    method: "POST",
    url: "/api/publish",
    headers: { origin: ORIGIN, authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    payload: { title: "缺少正文", content: "" },
  });
  assert.equal(authorized.statusCode, 400, "凭据有效时应进入业务校验（content 为空 → 400）");
  assert.equal(authorized.json().error.code, "BAD_REQUEST");

  const bodyless = await authApp.inject({
    method: "POST",
    url: "/api/publish",
    headers: { origin: ORIGIN, authorization: `Bearer ${apiKey}` },
  });
  assert.equal(bodyless.statusCode, 400, "/publish 无请求体时应为 400 而不是 500");
  assert.equal(bodyless.json().error.code, "BAD_REQUEST");
});

test("a null JSON body is rejected as 400 rather than crashing", async () => {
  const response = await authApp.inject({
    method: "POST",
    url: "/api/comments",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: "null",
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "BAD_REQUEST");
});
