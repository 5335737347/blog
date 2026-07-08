import type { ApiErrorCode } from "@/lib/api-response";

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

export function badRequest(message: string) {
  return new ServiceError(message, 400, "BAD_REQUEST");
}

export function unauthorized(message = "未登录") {
  return new ServiceError(message, 401, "UNAUTHORIZED");
}

export function notFound(message: string) {
  return new ServiceError(message, 404, "NOT_FOUND");
}
