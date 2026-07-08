import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  clearAuthCookie,
  createToken,
  getAuthUser,
  setAuthCookie,
  verifyPassword,
} from "@/lib/auth";
import { badRequest, unauthorized } from "@/server/errors";

export interface LoginInput {
  username?: unknown;
  password?: unknown;
}

function objectInput(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function requireAuthSession() {
  const user = await getAuthUser();
  if (!user) {
    throw unauthorized();
  }
  return user;
}

export async function loginAdmin(input: unknown) {
  const body = objectInput(input);
  const username = stringValue(body.username);
  const password = stringValue(body.password);

  if (!username || !password) {
    throw badRequest("请输入用户名和密码");
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !(await verifyPassword(password, user.password))) {
    throw unauthorized("用户名或密码错误");
  }

  const token = await createToken(user.id, user.username);
  await setAuthCookie(token);

  return { loggedIn: true };
}

export async function logoutAdmin() {
  await clearAuthCookie();
  return { loggedOut: true };
}

export async function getCurrentAdminSession() {
  const user = await requireAuthSession();
  return {
    authenticated: true,
    username: user.username,
  };
}

export async function getCurrentUserApiKey() {
  const session = await requireAuthSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { apiKey: true },
  });

  return { apiKey: user?.apiKey || null };
}

export async function regenerateCurrentUserApiKey() {
  const session = await requireAuthSession();
  const apiKey = `kp_${crypto.randomBytes(24).toString("hex")}`;

  await prisma.user.update({
    where: { id: session.userId },
    data: { apiKey },
  });

  return { apiKey };
}

export async function verifyPublishApiKey(apiKey: string) {
  if (!apiKey) {
    throw unauthorized("缺少 API Key");
  }

  const user = await prisma.user.findFirst({ where: { apiKey } });
  if (!user) {
    throw unauthorized("无效的 API Key");
  }

  return user;
}
