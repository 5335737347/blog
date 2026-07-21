import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getJwtSecret } from "@/lib/env";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const EXPIRES_IN = "7d";

export type UserRole = "ADMIN" | "USER";

export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
  displayName: string | null;
}

let jwtSecret: Uint8Array | null = null;

function getJwtSecretKey(): Uint8Array {
  jwtSecret ??= new TextEncoder().encode(getJwtSecret());
  return jwtSecret;
}

function roleValue(value: unknown): UserRole {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

function tokenPayload(payload: Record<string, unknown>): AuthUser | null {
  if (
    typeof payload.userId !== "string" ||
    typeof payload.username !== "string" ||
    (payload.role !== "ADMIN" && payload.role !== "USER")
  ) {
    return null;
  }

  return {
    userId: payload.userId,
    username: payload.username,
    role: roleValue(payload.role),
    displayName: typeof payload.displayName === "string" ? payload.displayName : null,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: AuthUser): Promise<string> {
  const payload: Record<string, unknown> = { ...user };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getJwtSecretKey());
}

export async function verifyToken(token: string) {
  const secretKey = getJwtSecretKey();
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return tokenPayload(payload);
  } catch {
    return null;
  }
}

export async function getAuthUser(token?: string) {
  if (!token) return null;
  return verifyToken(token);
}
