import { prisma } from "@/lib/prisma";
import { forbidden, tooManyRequests } from "@/server/errors";

export interface GuardRequest {
  headers: Headers;
  origin: string;
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore invalid optional deployment hints.
    }
  }
  return origins;
}

function sameAllowedOrigin(actual: string, request: GuardRequest): boolean {
  const allowedOrigins = configuredOrigins();
  allowedOrigins.add(request.origin);
  return allowedOrigins.has(actual);
}

export function assertSameOrigin(request: GuardRequest) {
  const origin = request.headers.get("origin");
  if (origin && !sameAllowedOrigin(origin, request)) {
    throw forbidden("非法请求来源");
  }

  const referer = request.headers.get("referer");
  if (!origin && referer) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw forbidden("非法请求来源");
    }
    if (!sameAllowedOrigin(refererOrigin, request)) {
      throw forbidden("非法请求来源");
    }
  }
}

export function requestIp(request: Pick<GuardRequest, "headers">): string {
  if (process.env.TRUST_PROXY !== "true") {
    return "untrusted-proxy";
  }

  const header = process.env.TRUST_PROXY_HEADER?.trim().toLowerCase() || "x-real-ip";
  switch (header) {
    case "cf-connecting-ip":
      return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
    case "x-forwarded-for":
      return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    case "x-real-ip":
      return request.headers.get("x-real-ip")?.trim() || "unknown";
    default:
      return "invalid-proxy-header";
  }
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const count = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!existing || existing.resetAt.getTime() <= now) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        update: { count: 1, resetAt },
        create: { key, count: 1, resetAt },
      });
      return 1;
    }

    const bucket = await tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { count: true },
    });
    return bucket.count;
  });
  if (count > limit) {
    throw tooManyRequests();
  }

  if (Math.random() < 0.01) {
    void prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now) } } });
  }
}
