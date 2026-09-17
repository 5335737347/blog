import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import {
  changeOwnPassword,
  getCurrentSession,
  getCurrentUserApiKey,
  loginUser,
  logoutCurrentUser,
  regenerateCurrentUserApiKey,
  registerUser,
  requestPasswordReset,
  resetPasswordWithCode,
} from "@/server/auth/auth-service";
import {
  getRegistrationCapabilities,
  normalizeVerificationTarget,
  sendVerificationCode,
} from "@/server/auth/verification-code-service";
import {
  assertRateLimit,
  assertRateLimitNotExceeded,
  clearRateLimit,
  recordRateLimitFailure,
  requestIp,
} from "@/server/request-guard";
import {
  apiSuccess,
  assertRequestOrigin,
  guardRequest,
  requestBody,
  sessionToken,
} from "@/http";

const LOGIN_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ACCOUNT_MAX_FAILURES = 10;

/**
 * 登录的账号维度限流键。
 *
 * 用 SHA-256 而不是明文：限流表里不应留下用户名或邮箱。
 * 标识符可能是用户名、邮箱或手机号，统一 trim + 小写后哈希。
 */
function loginAccountKey(body: unknown): string | null {
  const identifier = (body as { identifier?: unknown } | null)?.identifier;
  if (typeof identifier !== "string") return null;
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return null;
  const hash = crypto.createHash("sha256").update(`login:${normalized}`).digest("hex");
  return `auth:login:account:${hash}`;
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/registration-options", async () => apiSuccess(getRegistrationCapabilities()));

  app.post("/auth/verification-code", async (request) => {
    assertRequestOrigin(request);
    const body = requestBody<{ target?: unknown }>(request);
    const target = normalizeVerificationTarget(body.target);
    const targetHash = crypto.createHash("sha256").update(`email:${target}`).digest("hex");
    const guard = guardRequest(request);
    await assertRateLimit(`auth:verification-code:ip:${requestIp(guard)}`, 5, 60 * 60 * 1000);
    await assertRateLimit(`auth:verification-code:target:${targetHash}`, 5, 60 * 60 * 1000);
    return apiSuccess(await sendVerificationCode("register", target));
  });

  app.post("/auth/register", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`auth:register:${requestIp(guardRequest(request))}`, 5, 60 * 60 * 1000);
    const result = await registerUser(requestBody<unknown>(request));
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return reply.status(201).send(apiSuccess(result.data));
  });

  app.post("/auth/login", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`auth:login:${requestIp(guardRequest(request))}`, 20, 15 * 60 * 1000);

    // 按账号维度补充一道限流：仅有 IP 维度时，攻击者换 IP 就能绕过。
    //
    // 只统计失败次数，且在验密之前只做「只读」判断：
    // 这里曾经在验密前就把桶当成硬门槛，于是攻击者每 15 分钟故意输错 10 次
    // 就能定向锁死账号——连正确密码也返回 429，与注释里
    // 「不会被攻击者用故意输错的方式定向锁死账号」的承诺相反。
    // 现在：桶已满 → 直接拒绝（不验密）；桶未满 → 照常验密，成功即清桶。
    const body = requestBody<unknown>(request);
    const accountKey = loginAccountKey(body);
    if (accountKey) {
      await assertRateLimitNotExceeded(accountKey, LOGIN_ACCOUNT_MAX_FAILURES);
    }

    let result: Awaited<ReturnType<typeof loginUser>>;
    try {
      result = await loginUser(body);
    } catch (error) {
      if (accountKey) {
        await recordRateLimitFailure(accountKey, LOGIN_ACCOUNT_WINDOW_MS);
      }
      throw error;
    }
    if (accountKey) await clearRateLimit(accountKey);
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return apiSuccess(result.data);
  });

  // ===== 密码 =====

  app.post("/auth/password/reset-code", async (request) => {
    assertRequestOrigin(request);
    const body = requestBody<{ email?: unknown }>(request);
    const target = normalizeVerificationTarget(body.email);
    const targetHash = crypto.createHash("sha256").update(`reset:${target}`).digest("hex");
    const guard = guardRequest(request);

    // 与注册验证码同一套限流：按 IP 与按目标各 5 次/小时。
    await assertRateLimit(`auth:reset-code:ip:${requestIp(guard)}`, 5, 60 * 60 * 1000);
    await assertRateLimit(`auth:reset-code:target:${targetHash}`, 5, 60 * 60 * 1000);

    return apiSuccess(await requestPasswordReset(body));
  });

  app.post("/auth/password/reset", async (request) => {
    assertRequestOrigin(request);
    const guard = guardRequest(request);
    // 限制尝试次数，避免验证码被暴力枚举。
    await assertRateLimit(`auth:password-reset:ip:${requestIp(guard)}`, 10, 60 * 60 * 1000);
    return apiSuccess(await resetPasswordWithCode(requestBody<unknown>(request)));
  });

  app.put("/auth/password", async (request, reply) => {
    assertRequestOrigin(request);
    const result = await changeOwnPassword(sessionToken(request), requestBody<unknown>(request));

    // 改密会吊销全部旧令牌；这里把新令牌写回当前设备，避免用户被自己踢下线。
    reply.setCookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return apiSuccess({ changed: true });
  });

  app.post("/auth/logout", async (request, reply) => {
    assertRequestOrigin(request);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    // 传入令牌，让服务端把这个账号已签发的全部令牌一并作废。
    return apiSuccess(await logoutCurrentUser(sessionToken(request)));
  });

  app.get("/auth/me", async (request) => apiSuccess(await getCurrentSession(sessionToken(request))));

  app.get("/auth/key", async (request) => apiSuccess(await getCurrentUserApiKey(sessionToken(request))));

  app.post("/auth/key", async (request) => {
    assertRequestOrigin(request);
    return apiSuccess(await regenerateCurrentUserApiKey(sessionToken(request)));
  });

};

export default authRoutes;
