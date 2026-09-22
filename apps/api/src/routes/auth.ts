import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/server/errors";
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
import { isServiceError, serviceUnavailable } from "@/server/errors";
import {
  assertRateLimit,
  assertRateLimitNotExceeded,
  clearRateLimit,
  consumeFailureAllowance,
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
 * SMTP 的原始失败(认证被拒、连接未加密、超时)不能原样冒泡——
 * 未捕获时会变成 500「服务器内部错误」,注册页只剩这句,用户与站长都
 * 看不出是发信渠道的问题。这里统一翻译成 503;细节留在服务端日志。
 * ServiceError(400 无效邮箱/未配置 SMTP、429 限流)保持原语义向上抛。
 */
async function sendVerificationCodeOrUnavailable(
  purpose: "register" | "reset",
  target: unknown
) {
  try {
    return await sendVerificationCode(purpose, target);
  } catch (error) {
    if (isServiceError(error)) throw error;
    console.error("[auth] 验证码邮件发送失败:", error instanceof Error ? error.message : error);
    throw serviceUnavailable("验证码发送失败，邮件服务暂时不可用，请稍后再试");
  }
}

/**
 * 管理员账号的登录锁定（比普通账号严格得多）。
 *
 * 与手机锁屏密码同构：**连续输错 3 次就进入冷却**——第 1~3 次正常返回 401，
 * 从第 4 次起冷却，冷却期内即使密码正确也拒绝，且拒绝发生在 bcrypt 之前
 *（不消耗 CPU，爆破脚本刷不出任何算力优势）。
 *
 * 为什么管理员要单独一套：
 * - 管理后台是整个站点唯一的写入口，普通账号被爆破的代价只是多一条垃圾评论；
 * - 本站在线只有一个管理员账号，3 次试探的成本对真人可以忽略，对爆破脚本是致命的；
 * - 阈值与普通账号的「15 分钟 10 次」共用同一张限流表，因此换 IP 无效：
 *   锁定键只跟账号绑定，攻击者轮换 IP 也解不开。
 *
 * 代价（明确记录，不藏）：知道管理员用户名的人可以故意输错 3 次，
 * 把管理员锁在门外最多 15 分钟。对个人博客这是可接受的取舍——攻击者拿不到账号，
 * 而站长等待窗口结束即可登入；反过来「永不锁定」则意味着密码可被无限次穷举。
 * 冷却时长用 ADMIN_LOGIN_LOCKOUT_MINUTES 可调（见 .env.example）。
 */
const DEFAULT_ADMIN_LOCKOUT_MINUTES = 15;
/** 允许的连续密码错误次数；第 N 次仍返回 401，从第 N+1 次起拒绝。 */
const ADMIN_LOGIN_MAX_ATTEMPTS = 3;

function adminLockoutWindowMs(): number {
  const raw = Number.parseInt(process.env.ADMIN_LOGIN_LOCKOUT_MINUTES ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_ADMIN_LOCKOUT_MINUTES * 60 * 1000;
  // 上限 24 小时：配置写错（例如误填 100000）时不至于把管理员永久锁死。
  return Math.min(raw, 24 * 60) * 60 * 1000;
}

/**
 * 登录的账号维度限流键。
 *
 * 用 SHA-256 而不是明文：限流表里不应留下用户名或邮箱。
 * 标识符可能是用户名、邮箱或手机号，统一 trim + 小写后哈希。
 */
function loginIdentifier(body: unknown): string | null {
  const raw = body as { identifier?: unknown; username?: unknown; email?: unknown } | null;
  const value = raw?.identifier ?? raw?.username ?? raw?.email;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * 把登录尝试解析到目标账户：桶键用解析出的 userId，而不是提交的标识符。
 *
 * 之前按标识符哈希做键：同一账号的用户名和邮箱各有一个桶，攻击者换着
 * 提交就把管理员 3 次的爆破预算翻成 6 次。现在唯一命中的账户共享同一份
 * 失败预算（含邮箱大小写变体）；未注册或歧义标识符退回标识符桶，
 * 防止未知账户被无限制探测。查询与 targetsAdmin 时代的语义一致：
 * 参数化、只读，登录流程随后必然要查这个用户。
 */
async function resolveLoginTarget(
  body: unknown
): Promise<{ key: string | null; isAdmin: boolean; resolved: boolean }> {
  const identifier = loginIdentifier(body);
  if (!identifier) return { key: null, isAdmin: false, resolved: false };
  const emailIdentifier = identifier.includes("@") ? identifier.toLowerCase() : null;
  const rows = await prisma.$queryRaw<{ id: string; role: string }[]>`
    SELECT "id", "role" FROM "User"
    WHERE "username" = ${identifier} COLLATE NOCASE
       OR "email" = ${identifier}
       OR ("email" IS NOT NULL AND ${emailIdentifier} IS NOT NULL AND "email" = ${emailIdentifier})
    LIMIT 2
  `;
  if (rows.length === 1) {
    return {
      key: `auth:login:account:${rows[0].id}`,
      isAdmin: rows[0].role === "ADMIN",
      resolved: true,
    };
  }
  const hash = crypto.createHash("sha256").update(`login:${identifier}`).digest("hex");
  return { key: `auth:login:account:${hash}`, isAdmin: false, resolved: false };
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
    return apiSuccess(await sendVerificationCodeOrUnavailable("register", target));
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

    // 账号维度限流：仅有 IP 维度时，攻击者换 IP 就能绕过。
    //
    // 策略分两档：
    // - ADMIN：连续 3 次失败冷却 15 分钟，冷却期内正确密码也拒绝。这是
    //   为保护唯一管理入口而明确接受的可用性取舍；
    // - USER：失败计数仍会记录（供审计和后续风控使用），但**不作为验密前的
    //   硬门禁**。否则任何人故意输错 10 次就能把普通用户锁在门外 15 分钟，
    //   与 docs/registration-delivery.md 的承诺冲突。
    const body = requestBody<unknown>(request);
    const { key: accountKey, isAdmin: adminTarget, resolved } = await resolveLoginTarget(body);

    // ADMIN 与“未解析到真实账号的标识符”保留硬门禁；已存在的普通账号不硬锁。
    // 未注册标识符也要限，否则攻击者可以换着拼写无限探测账号是否存在。
    if (accountKey && (adminTarget || !resolved)) {
      const hardLimit = adminTarget ? ADMIN_LOGIN_MAX_ATTEMPTS : LOGIN_ACCOUNT_MAX_FAILURES;
      await assertRateLimitNotExceeded(accountKey, hardLimit, {
        message: adminTarget ? "该管理员账号已被临时锁定，请稍后再试" : undefined,
      });
    }

    let result: Awaited<ReturnType<typeof loginUser>>;
    try {
      result = await loginUser(body);
    } catch (error) {
      if (accountKey) {
        // 只有密码错误（401）才记录失败；其它错误（400/500）不占用尝试次数，
        // 否则每次畸形请求都能把管理员推向锁定。
        if (error instanceof ServiceError && error.status === 401) {
          await consumeFailureAllowance(
            accountKey,
            adminTarget ? adminLockoutWindowMs() : LOGIN_ACCOUNT_WINDOW_MS,
            adminTarget ? ADMIN_LOGIN_MAX_ATTEMPTS : LOGIN_ACCOUNT_MAX_FAILURES
          );
        }
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

    try {
      return apiSuccess(await requestPasswordReset(body));
    } catch (error) {
      if (isServiceError(error)) throw error;
      // 与注册验证码同一处理:SMTP 原始失败翻译为 503,避免 500。
      console.error("[auth] 重置码邮件发送失败:", error instanceof Error ? error.message : error);
      throw serviceUnavailable("验证码发送失败，邮件服务暂时不可用，请稍后再试");
    }
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
    // 改密要用旧密码做 bcrypt 验证：没有限流时，被盗会话可以无限次暴力
    // 猜测旧密码。按 IP 限到 10 次/小时（正常人不该频繁改密）。
    await assertRateLimit(`auth:password-change:${requestIp(guardRequest(request))}`, 10, 60 * 60 * 1000);
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
