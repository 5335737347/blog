import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createToken,
  type AuthUser,
  getAuthUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  assertVerificationCode,
  normalizeVerificationTarget,
  sendVerificationCode,
} from "@/server/auth/verification-code-service";
import { badRequest, forbidden, unauthorized } from "@/server/errors";

export interface LoginInput {
  username?: unknown;
  email?: unknown;
  identifier?: unknown;
  password?: unknown;
}

export interface RegisterInput {
  username?: unknown;
  email?: unknown;
  verificationCode?: unknown;
  displayName?: unknown;
  password?: unknown;
}

interface AuthUserRow {
  id: string;
  username: string;
  password: string;
  displayName: string | null;
  role: string;
  tokenVersion: number;
}

/**
 * 账号不存在或标识符歧义时用于对比的哑哈希。
 *
 * 之前登录是 `if (!user || !(await verifyPassword(...)))`：用户不存在时短路，
 * 响应时间明显短于存在但密码错误的情况，外部可以据此枚举账号。这里先无条件
 * 做一次 bcrypt 比较，让两条路径的耗时接近。
 */
const DUMMY_PASSWORD_HASH = "$2b$10$oyenW.yB04yHsLBNkrkVt..DQo.Acpe/oInCrq7tJ.YsBcN.vOMDa";

function objectInput(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function nullableString(value: unknown): string | null {
  return stringValue(value) || null;
}

function publicSession(user: AuthUser) {
  return {
    authenticated: true,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function userSession(user: {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  tokenVersion: number;
}): AuthUser {
  return {
    userId: user.id,
    username: user.username,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    displayName: user.displayName,
    tokenVersion: user.tokenVersion,
  };
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

/**
 * 密码强度规则。注册、重置、改密三处共用同一份，
 * 避免某一条路径悄悄放松要求。
 */
function assertNewPassword(password: string) {
  if (password.length < 8) {
    throw badRequest("密码至少需要 8 个字符");
  }
  if (passwordByteLength(password) > 72) {
    throw badRequest("密码不能超过 72 个 UTF-8 字节");
  }
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function isStoredApiKeyHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function normalizeStoredApiKey(userId: string, apiKey: string | null | undefined) {
  if (!apiKey || isStoredApiKeyHash(apiKey)) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: hashApiKey(apiKey) },
  });
}

export async function requireAuthSession(token?: string) {
  const user = await getOptionalAuthSession(token);
  if (!user) {
    throw unauthorized();
  }
  return user;
}

export async function getOptionalAuthSession(token?: string) {
  const user = await getAuthUser(token);
  if (!user) return null;

  // 这次查询本来就要做（用于取账号当前的数据库角色），
  // tokenVersion 只是顺带多取一列，因此吊销校验不增加任何额外开销。
  const account = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      tokenVersion: true,
    },
  });
  if (!account) return null;

  // 代次不一致说明该令牌已被吊销（登出 / 改密 / 管理员踢下线）。
  if (account.tokenVersion !== user.tokenVersion) return null;

  return userSession(account);
}

export async function requireAdminSession(token?: string) {
  const user = await requireAuthSession(token);
  if (user.role !== "ADMIN") {
    throw forbidden("需要管理员权限");
  }
  return user;
}

export async function registerUser(input: unknown) {
  const body = objectInput(input);
  const username = stringValue(body.username);
  const password = stringValue(body.password);
  const email = nullableString(body.email)?.toLowerCase() ?? null;
  const displayName = nullableString(body.displayName);

  if (!username || !password) {
    throw badRequest("请输入用户名和密码");
  }
  if (!email) {
    throw badRequest("请输入注册邮箱");
  }
  if (username.length < 2 || username.length > 32) {
    throw badRequest("用户名长度需为 2-32 个字符");
  }
  if (validEmail(username)) {
    throw badRequest("用户名不能使用邮箱格式");
  }
  if (displayName && displayName.length > 32) {
    throw badRequest("昵称不能超过 32 个字符");
  }
  assertNewPassword(password);
  if (email.length > 254 || !validEmail(email)) {
    throw badRequest("邮箱格式不正确");
  }

  // 防枚举收敛：用户名占用是常规 UX 提示，可以在验证码之前告知（大小写
  // 不敏感，见下一个检查）；邮箱是否存在则在验证码校验之后才判定——
  // 想探测邮箱必须先消耗一个限流验证码，与重置流程的反枚举口径对齐。
  const usernameTaken = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE LOWER("username") = LOWER(${username}) LIMIT 1
  `;
  if (usernameTaken.length > 0) {
    throw badRequest("用户名已被使用");
  }
  await assertVerificationCode("register", email, body.verificationCode);

  // 跨字段同样要查：邮箱输入可能撞别人的用户名（反之亦然），插入层的
  // 唯一约束是兜底，这里的预检给出可读的错误信息。
  const emailTaken = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE LOWER("email") = LOWER(${email})
       OR LOWER("username") = LOWER(${username})
       OR LOWER("username") = LOWER(${email})
       OR "email" IS NOT NULL AND LOWER("email") = LOWER(${username})
    LIMIT 1
  `;
  if (emailTaken.length > 0) {
    throw badRequest("邮箱已被使用");
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: displayName || username,
    role: "USER",
    // 新账号从第 0 代开始（与数据库默认值一致）。
    tokenVersion: 0,
  };

  try {
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "username", "email", "phone", "displayName", "password", "role")
      VALUES (${user.id}, ${username}, ${email}, NULL, ${user.displayName}, ${await hashPassword(password)}, 'USER')
    `;
  } catch (error) {
    // 只把真正的唯一约束冲突翻译成 400；磁盘/数据库故障必须继续冒泡成 500，
    // 否则运维看到的是“用户名已被使用”，真实故障被永久掩盖。
    const code = (error as { code?: unknown }).code;
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || /UNIQUE constraint failed/i.test(message)) {
      throw badRequest("用户名或邮箱已被使用");
    }
    console.error("[auth] 创建用户失败:", message || error);
    throw error;
  }

  const session = userSession(user);
  const token = await createToken(session);
  return { data: { loggedIn: true, user: publicSession(session) }, token };
}

export async function loginUser(input: unknown) {
  const body = objectInput(input);
  const username = stringValue(body.username);
  const email = stringValue(body.email);
  const rawIdentifier = stringValue(body.identifier) || username || email;
  const identifier = rawIdentifier?.includes("@")
    ? rawIdentifier.toLowerCase()
    : rawIdentifier;
  const password = stringValue(body.password);

  if (!identifier || !password) {
    throw badRequest("请输入用户名或邮箱和密码");
  }
  if (identifier.length > 254 || passwordByteLength(password) > 72) {
    throw unauthorized("用户名或密码错误");
  }

  const users = await prisma.$queryRaw<AuthUserRow[]>`
    SELECT "id", "username", "password", "displayName", "role", "tokenVersion"
    FROM "User"
    WHERE "username" = ${identifier} COLLATE NOCASE
       OR "email" = ${identifier}
    LIMIT 2
  `;
  const user = users.length === 1 ? users[0] : null;

  // 无论账号是否存在/是否歧义都执行 bcrypt，降低用户名枚举的时间侧信道。
  const passwordMatches = await verifyPassword(password, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    throw unauthorized("用户名或密码错误");
  }

  const session = userSession(user);
  const token = await createToken(session);
  return { data: { loggedIn: true, user: publicSession(session) }, token };
}

/**
 * 登出。除了由路由清除 Cookie 之外，这里会自增账号的会话代次，
 * 使该用户**已经签发的全部令牌立即失效**。
 *
 * 之前这个函数是空实现（只返回 `{ loggedOut: true }`），因此登出后
 * 被盗的令牌仍能继续使用到 7 天有效期结束。
 *
 * 代价是登出会让该账号在所有设备上下线；对单人博客而言这正是期望的语义。
 * 令牌无效或缺失时不报错，登出永远返回成功。
 */
export async function logoutCurrentUser(token?: string) {
  const user = await getOptionalAuthSession(token);
  if (user) {
    // 自增代次：该用户已签发的全部令牌立即失效，包括被盗的那一份。
    await prisma.user.update({
      where: { id: user.userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }
  return { loggedOut: true };
}

export const logoutAdmin = logoutCurrentUser;

export async function getCurrentSession(token?: string) {
  const user = await requireAuthSession(token);
  return publicSession(user);
}

export async function getCurrentAdminSession(token?: string) {
  return publicSession(await requireAdminSession(token));
}

export async function getCurrentUserApiKey(token?: string) {
  const session = await requireAdminSession(token);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { apiKey: true },
  });

  await normalizeStoredApiKey(session.userId, user?.apiKey);
  return { hasApiKey: Boolean(user?.apiKey), apiKey: null };
}

export async function regenerateCurrentUserApiKey(token?: string) {
  const session = await requireAdminSession(token);
  const apiKey = `kp_${crypto.randomBytes(24).toString("hex")}`;

  await prisma.user.update({
    where: { id: session.userId },
    data: { apiKey: hashApiKey(apiKey) },
  });

  return { apiKey, hasApiKey: true };
}

export async function verifyPublishApiKey(apiKey: string) {
  if (!apiKey) {
    throw unauthorized("缺少 API Key");
  }

  const apiKeyHash = hashApiKey(apiKey);
  const user = await prisma.user.findFirst({
    where: { apiKey: apiKeyHash, role: "ADMIN" },
  });
  if (!user) {
    const legacyUser = await prisma.user.findFirst({
      where: { apiKey, role: "ADMIN" },
    });
    if (!legacyUser) {
      throw unauthorized("无效的 API Key");
    }
    await prisma.user.update({
      where: { id: legacyUser.id },
      data: { apiKey: apiKeyHash },
    });
    return legacyUser;
  }

  return user;
}

/**
 * 写入新密码并吊销该账号的全部会话。
 *
 * 自增 tokenVersion 会让所有已签发的令牌立即失效——改密码必须能把
 * 可能已经泄漏的会话一并踢下线。
 */
async function applyNewPassword(userId: string, newPassword: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: await hashPassword(newPassword),
      tokenVersion: { increment: 1 },
    },
  });
}

/**
 * 发送重置密码验证码。
 *
 * **无论该邮箱是否已注册，响应与流程完全一致。** 否则这个端点会变成
 * 账号枚举工具：攻击者可以批量试探哪些邮箱在本站有账号。
 * 滥用由「按 IP + 按目标」的发送限流约束（与注册验证码同一套）。
 */
export async function requestPasswordReset(input: unknown) {
  const body = objectInput(input);
  const target = normalizeVerificationTarget(body.email);
  const result = await sendVerificationCode("reset", target);

  return {
    requested: true,
    expiresAt: result.expiresAt,
    // 仅在开发环境且未配置 SMTP 时回显，生产环境恒为 undefined
    debugCode: result.debugCode,
  };
}

/**
 * 凭邮箱验证码重置密码（忘记密码流程，无需登录）。
 *
 * 验证码校验先于账号查找，两条路径对外表现一致：
 * 邮箱不存在与验证码错误返回同一个结果。
 */
export async function resetPasswordWithCode(input: unknown) {
  const body = objectInput(input);
  const email = nullableString(body.email)?.toLowerCase() ?? null;
  const newPassword = stringValue(body.newPassword);

  if (!email || !newPassword) {
    throw badRequest("请输入邮箱和新密码");
  }
  assertNewPassword(newPassword);

  // 先校验验证码：邮箱不存在时同样会在这里失败，不产生可区分的响应。
  await assertVerificationCode("reset", email, body.verificationCode);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    throw badRequest("邮箱验证码错误");
  }

  await applyNewPassword(user.id, newPassword);
  return { reset: true };
}

/**
 * 已登录用户修改自己的密码。需要提供当前密码。
 *
 * 改密同样会吊销全部旧令牌，但这里为当前设备补发一张新令牌，
 * 否则用户会在改完密码的瞬间被自己踢下线。
 */
export async function changeOwnPassword(token: string | undefined, input: unknown) {
  const session = await requireAuthSession(token);
  const body = objectInput(input);
  const currentPassword = stringValue(body.currentPassword);
  const newPassword = stringValue(body.newPassword);

  if (!currentPassword || !newPassword) {
    throw badRequest("请输入当前密码和新密码");
  }
  assertNewPassword(newPassword);

  const account = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { password: true },
  });
  if (!account) {
    throw unauthorized();
  }
  if (!(await verifyPassword(currentPassword, account.password))) {
    throw badRequest("当前密码不正确");
  }

  await applyNewPassword(session.userId, newPassword);

  const refreshed = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, displayName: true, role: true, tokenVersion: true },
  });
  if (!refreshed) {
    throw unauthorized();
  }

  return { changed: true, token: await createToken(userSession(refreshed)) };
}
