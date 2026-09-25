import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiFailure, ApiSuccess } from "@kpblog/contracts";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { isServiceError, badRequest } from "@/server/errors";
import { assertSameOrigin, type GuardRequest } from "@/server/request-guard";

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function apiFailure(message: string, code = "INTERNAL_ERROR"): ApiFailure {
  return { success: false, error: { code, message } };
}

export function requestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

export function guardRequest(request: FastifyRequest): GuardRequest {
  return {
    headers: requestHeaders(request),
    origin: `${request.protocol}://${request.host}`,
    directIp: request.socket.remoteAddress || request.ip,
  };
}

export function assertRequestOrigin(request: FastifyRequest) {
  assertSameOrigin(guardRequest(request));
}

export function sessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE_NAME];
}

/** 分页页码上限。超过时钳制，而不是把巨大 offset 交给 SQLite 触发 500。 */
export const MAX_PAGE = 10_000;

export function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 分页页码。解析失败回退 1，超大页码钳到 MAX_PAGE。
 *
 * 之前直接 `(page - 1) * pageSize`：攻击者传 `page=10^24` 时 offset 超出
 * SQLite 可表示的整数范围，Prisma 直接抛错，公开列表端点返回 500。
 */
export function pageNumber(value: unknown): number {
  return Math.min(positiveInt(value, 1), MAX_PAGE);
}

/**
 * 取请求体，并把「没有 body」归一成 400。
 *
 * 之前各路由直接 `request.body as Record<string, unknown>`：客户端不带 body
 * （或显式发 `null`）时得到的是 `undefined`，服务层读属性即抛 TypeError，
 * 最终以 500「服务器内部错误」返回——把客户端错误报成服务端错误。
 * 服务层的输入守卫不一致（`settings`/`profile` 有，`article`/`comment` 没有），
 * 所以这里在 HTTP 边界统一兜住，让 16 个写端点行为一致。
 *
 * `T` 是服务层的「未校验输入」类型：它要求所有字段都是 `unknown`，
 * 由服务层负责逐字段校验，这里不假装做过结构校验。
 */
export function requestBody<T>(request: FastifyRequest): T {
  const body = request.body;
  if (body === undefined || body === null) {
    throw badRequest("请求体不能为空");
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("请求体必须是 JSON 对象");
  }
  return body as T;
}

export function registerErrorHandler(reply: FastifyReply, error: unknown) {
  if (isServiceError(error)) {
    // 限流响应额外带上剩余秒数：管理员登录页据此给出「请 N 分钟后再试」，
    // 而不是让用户对着同一句「请求过于频繁」反复试。
    const payload = error.retryAfterSeconds
      ? {
          success: false as const,
          error: {
            code: error.code,
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
        }
      : apiFailure(error.message, error.code);
    return reply.status(error.status).send(payload);
  }

  // Fastify 自身的错误（请求体 JSON 解析失败、超限等）带有 4xx 的 statusCode。
  // 之前这里一律压成 500，把客户端错误报成服务端错误，还会以 ERROR 级别刷日志——
  // 任何客户端发一个畸形 JSON 就能制造一条"服务器内部错误"。
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    const code = (error as { code?: unknown }).code;
    // 413 需要比「请求格式不正确」更可执行的提示：正文超限时前端/CLI 才知道
    // 应该缩短内容，而不是误以为 JSON 坏了。
    const message =
      statusCode === 413
        ? "请求体过大，请减少正文或附件大小"
        : "请求格式不正确";
    reply.log.warn({ err: error }, "客户端请求无效");
    return reply
      .status(statusCode)
      .send(apiFailure(message, typeof code === "string" ? code : "BAD_REQUEST"));
  }

  reply.log.error(error);
  return reply.status(500).send(apiFailure("服务器内部错误"));
}

/**
 * 单次 multipart 解析的资源上限。
 *
 * 全局默认（app.ts：20 个文件 × 20 MiB）是为了兼容批量导入场景，但绝大多数
 * 上传端点只用第一个文件（`files[0]`）。不收紧时，一个请求就能让服务端把
 * 20 × 20 MiB 全部读进内存——这类请求在 Nginx 有 25m body 限制时到不了，
 * 但 API 不应该把自身的内存安全寄托在反向代理配置上。
 *
 * 传 `undefined` 时沿用全局限制。
 */
export interface MultipartLimits {
  files?: number;
  fileSize?: number;
  fields?: number;
  parts?: number;
}

export async function multipartFiles(request: FastifyRequest, limits?: MultipartLimits) {
  const files: File[] = [];
  const fields: Record<string, string> = {};
  for await (const part of request.parts(limits ? { limits } : undefined)) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      const bytes = new Uint8Array(buffer.length);
      bytes.set(buffer);
      files.push(new File([bytes.buffer], part.filename, { type: part.mimetype }));
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }
  return { files, fields };
}
