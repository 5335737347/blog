import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  createToken,
  type AuthUser,
  getAuthUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { assertRegisterVerificationCode } from "@/server/auth/verification-code-service";
import { badRequest, forbidden, unauthorized } from "@/server/errors";

export interface LoginInput {
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  identifier?: unknown;
  password?: unknown;
}

export interface RegisterInput {
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  verificationCode?: unknown;
  verificationChannel?: unknown;
  displayName?: unknown;
  password?: unknown;
}

interface AuthUserRow {
  id: string;
  username: string;
  password: string;
  displayName: string | null;
  role: string;
}

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
}): AuthUser {
  return {
    userId: user.id,
    username: user.username,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    displayName: user.displayName,
  };
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
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
  const user = await getAuthUser(token);
  if (!user) {
    throw unauthorized();
  }

  const account = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, username: true, displayName: true, role: true },
  });
  if (!account) {
    throw unauthorized("登录状态已失效");
  }

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
  const rawPhone = nullableString(body.phone);
  const phone = normalizePhoneNumber(body.phone);
  const displayName = nullableString(body.displayName);
  const verificationChannel = body.verificationChannel === "phone" ? "phone" : "email";

  if (!username || !password) {
    throw badRequest("请输入用户名和密码");
  }
  if (!email && !phone) {
    throw badRequest("请至少填写邮箱或手机号");
  }
  if (username.length < 2 || username.length > 32) {
    throw badRequest("用户名长度需为 2-32 个字符");
  }
  if (validEmail(username) || normalizePhoneNumber(username)) {
    throw badRequest("用户名不能使用邮箱或手机号格式");
  }
  if (displayName && displayName.length > 32) {
    throw badRequest("昵称不能超过 32 个字符");
  }
  if (password.length < 8) {
    throw badRequest("密码至少需要 8 个字符");
  }
  if (passwordByteLength(password) > 72) {
    throw badRequest("密码不能超过 72 个 UTF-8 字节");
  }
  if (email && !validEmail(email)) {
    throw badRequest("邮箱格式不正确");
  }
  if (rawPhone && !phone) {
    throw badRequest("手机号格式不正确，请检查国家区号和号码");
  }
  if (verificationChannel === "email" && !email) {
    throw badRequest("请输入用于验证的邮箱");
  }
  if (verificationChannel === "phone" && !phone) {
    throw badRequest("请输入用于验证的手机号");
  }

  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "username" = ${username} OR "email" = ${username} OR "phone" = ${username}
       OR "username" = ${email} OR "email" = ${email} OR "phone" = ${email}
       OR "username" = ${phone} OR "email" = ${phone} OR "phone" = ${phone}
    LIMIT 1
  `;
  if (existing.length > 0) {
    throw badRequest("用户名、邮箱或手机号已被使用");
  }
  await assertRegisterVerificationCode(
    verificationChannel,
    verificationChannel === "email" ? email : phone,
    body.verificationCode
  );

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: displayName || username,
    role: "USER",
  };

  try {
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "username", "email", "phone", "displayName", "password", "role")
      VALUES (${user.id}, ${username}, ${email}, ${phone}, ${user.displayName}, ${await hashPassword(password)}, 'USER')
    `;
  } catch {
    throw badRequest("用户名、邮箱或手机号已被使用");
  }

  const session = userSession(user);
  const token = await createToken(session);
  return { data: { loggedIn: true, user: publicSession(session) }, token };
}

export async function loginUser(input: unknown) {
  const body = objectInput(input);
  const username = stringValue(body.username);
  const email = stringValue(body.email);
  const phone = stringValue(body.phone);
  const rawIdentifier = stringValue(body.identifier) || username || email || phone;
  const identifier = rawIdentifier?.includes("@")
    ? rawIdentifier.toLowerCase()
    : rawIdentifier;
  const phoneIdentifier = normalizePhoneNumber(identifier);
  const password = stringValue(body.password);

  if (!identifier || !password) {
    throw badRequest("请输入用户名、邮箱或手机号和密码");
  }
  if (identifier.length > 254 || passwordByteLength(password) > 72) {
    throw unauthorized("用户名或密码错误");
  }

  const users = await prisma.$queryRaw<AuthUserRow[]>`
    SELECT "id", "username", "password", "displayName", "role"
    FROM "User"
    WHERE "username" = ${identifier} OR "email" = ${identifier} OR "phone" = ${phoneIdentifier}
    LIMIT 2
  `;
  const user = users.length === 1 ? users[0] : null;

  if (!user || !(await verifyPassword(password, user.password))) {
    throw unauthorized("用户名或密码错误");
  }

  const session = userSession(user);
  const token = await createToken(session);
  return { data: { loggedIn: true, user: publicSession(session) }, token };
}

export async function logoutCurrentUser() {
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
  const user = await prisma.user.findFirst({ where: { apiKey: apiKeyHash } });
  if (!user) {
    const legacyUser = await prisma.user.findFirst({ where: { apiKey } });
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
