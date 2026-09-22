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
  return loginAs("lockout-admin", password);
}

async function loginAs(identifier: string, password: string) {
  const response = await authApp.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { identifier, password },
  });
  return { status: response.statusCode, body: response.json() };
}

test("the admin lockout is a cooldown, not a permanent state", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });

  // 管理员恰好有 3 次机会（见 routes/auth.ts 常量区的说明）：
  // 第 1~3 次返回 401，第 4 次起进入冷却。
  // 这里同时验证「锁是时间窗内的冷却」：桶生效 → 拒绝；桶清空 → 立即可登录。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assert.equal((await login("definitely-wrong-password")).status, 401, `第 ${attempt} 次应为 401`);
  }

  const buckets = await prisma.rateLimitBucket.findMany({ where: { key: { contains: "login:account" } } });
  assert.ok(buckets.some((row) => row.count >= 3), "连续失败后应留下账号维度的失败计数");

  const locked = await login("correct-horse-battery");
  assert.equal(locked.status, 429, "冷却期内正确密码也必须被拒");
  assert.equal(locked.body.error.code, "TOO_MANY_REQUESTS");

  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });
  const recovered = await login("correct-horse-battery");
  assert.equal(recovered.status, 200, "冷却结束后正确密码必须能登录");
  assert.equal(recovered.body.data.user.username, "lockout-admin");
  assert.equal(recovered.body.data.user.role, "ADMIN");
  assert.ok(tokenVersion >= 0);
  assert.ok(adminId);
});

test("a successful login clears accumulated failures", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });

  // 管理员阈值 3 次：错 2 次仍应能正常登录（第 3 次才触发冷却）。
  for (let attempt = 0; attempt < 2; attempt += 1) {
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

/**
 * 管理员账号的登录锁定：连续 3 次密码错误即进入冷却。
 *
 * 与手机锁屏密码同构——冷却期内**即使密码正确也拒绝**，且拒绝发生在 bcrypt 之前。
 * 这里逐条钉住四个要点：阈值、冷却期内拒绝正确密码、换 IP 无效、普通账号不受影响。
 */
test("an admin account locks after three wrong passwords, even for the right one", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });

  // 恰好 3 次机会：第 1~3 次都是 401，不多不少。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const failed = await login("wrong-password-attempt");
    assert.equal(failed.status, 401, `第 ${attempt} 次错误密码应为 401（共允许 3 次）`);
  }

  // 第 4 次：锁定生效（且在 bcrypt 之前），并带剩余秒数供前端显示倒计时。
  const locked = await login("correct-horse-battery");
  assert.equal(locked.status, 429, "第 3 次失败后应进入冷却");
  assert.equal(locked.body.error.code, "TOO_MANY_REQUESTS");
  assert.ok(
    typeof locked.body.error.retryAfterSeconds === "number" && locked.body.error.retryAfterSeconds > 0,
    `响应应带 retryAfterSeconds，实际 ${JSON.stringify(locked.body.error)}`
  );
  assert.ok(
    locked.body.error.retryAfterSeconds <= 15 * 60,
    "剩余时间不应超过配置的冷却窗口"
  );

  // 冷却期内持续尝试也不能把窗口续命到超过配置上限。
  const again = await login("correct-horse-battery");
  assert.equal(again.status, 429);
  assert.ok(again.body.error.retryAfterSeconds <= 15 * 60);

  // 清掉桶即可恢复登录（冷却不是永久状态）。
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:account" } } });
  const recovered = await login("correct-horse-battery");
  assert.equal(recovered.status, 200);
});

test("the admin lock is keyed by account, so rotating IPs does not clear it", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:" } } });

  const previousTrustProxy = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";
  try {
    // 用伪造的 x-forwarded-for 模拟「换 IP」的爆破者：每次请求都换一个来源，
    // 连错 3 次把账号锁定。
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await authApp.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${attempt}`,
        },
        payload: { identifier: "lockout-admin", password: "wrong-password-attempt" },
      });
    }
    // 再换一个全新的 IP，仍然必须被账号锁定拦住。
    const fromNewIp = await authApp.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.77",
      },
      payload: { identifier: "lockout-admin", password: "correct-horse-battery" },
    });
    assert.equal(fromNewIp.statusCode, 429, "换 IP 不应绕过管理员账号锁定");
  } finally {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: "login:" } } });
  }
});

test("regular accounts keep the looser failure limit", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma } = await import("../src/lib/prisma");

  await prisma.user.create({
    data: {
      username: "plain-user",
      password: await bcrypt.hash("plain-user-password", 10),
      role: "USER",
    },
  });

  const attempt = (password: string) =>
    authApp.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      payload: { identifier: "plain-user", password },
    });

  // 3 次失败后普通账号**不应**被锁（只有管理员是 3 次；普通账号 10 次）。
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await attempt("nope")).statusCode, 401);
  }
  assert.equal((await attempt("plain-user-password")).statusCode, 200, "普通账号 3 次失败后仍可登录");
});

test("username and email of one admin share a single failure budget", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.user.create({
    data: {
      username: "dual-admin",
      email: "dual-admin@example.com",
      password: await bcrypt.hash("correct-horse-battery", 10),
      role: "ADMIN",
    },
  });

  // 用用户名把 3 次失败预算耗尽。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await loginAs("dual-admin", "wrong-password");
    assert.equal(res.status, 401, `第 ${attempt} 次应为 401`);
  }

  // 换用邮箱（另一个标识符、同一个账户）必须直接进冷却——
  // 修复前两个标识符各有一份预算，管理员实际可被猜 6 次。
  const viaEmail = await loginAs("DUAL-Admin@Example.com", "wrong-password");
  assert.equal(viaEmail.status, 429, "同一账户的邮箱变体不得获得新的失败预算");
  assert.equal(viaEmail.body.error?.code, "TOO_MANY_REQUESTS");
});

test("password change is rate limited per IP", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { SignJWT } = await import("jose");
  const { getJwtSecret } = await import("../src/lib/env");

  const user = await prisma.user.create({
    data: {
      username: "pw-change-user",
      password: await bcrypt.hash("original-pw-123456", 10),
      role: "USER",
    },
  });

  // 直接签发令牌：同文件前面的用例已耗尽共享 IP 的登录配额（20 次/15 分钟），
  // 这里被测对象是改密限流，不该依赖登录路由的剩余额度。
  let cookie = `session=${await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(getJwtSecret()))}`;

  const change = (sessionCookie: string, currentPassword: string, newPassword: string) =>
    authApp.inject({
      method: "PUT",
      url: "/api/auth/password",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      payload: { currentPassword, newPassword },
    });

  // 每次改密都会吊销旧令牌并下发新 cookie，旧密码也随之失效：
  // 会话与密码都必须链式使用最新值，保证每次尝试的凭据本身是正确的。
  let currentPassword = "original-pw-123456";
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const nextPassword = `new-pw-${attempt}-${Date.now()}`;
    const res = await change(cookie, currentPassword, nextPassword);
    assert.equal(res.statusCode, 200, `第 ${attempt} 次改密应为 200`);
    const next = res.headers["set-cookie"];
    cookie = Array.isArray(next) ? next[0] : (next ?? cookie);
    currentPassword = nextPassword;
  }
  const limited = await change(cookie, currentPassword, "one-more-password-123");
  assert.equal(limited.statusCode, 429, "超过限额后即使凭据正确也应 429");
});

