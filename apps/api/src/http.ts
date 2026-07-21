import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiFailure, ApiSuccess } from "@kpblog/contracts";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { isServiceError } from "@/server/errors";
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
  };
}

export function assertRequestOrigin(request: FastifyRequest) {
  assertSameOrigin(guardRequest(request));
}

export function sessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE_NAME];
}

export function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function registerErrorHandler(reply: FastifyReply, error: unknown) {
  if (isServiceError(error)) {
    return reply.status(error.status).send(apiFailure(error.message, error.code));
  }
  reply.log.error(error);
  return reply.status(500).send(apiFailure("服务器内部错误"));
}

export async function multipartFiles(request: FastifyRequest) {
  const files: File[] = [];
  const fields: Record<string, string> = {};
  for await (const part of request.parts()) {
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
