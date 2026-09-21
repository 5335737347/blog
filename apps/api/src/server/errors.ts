export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR"
  | string;

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode,
    /** 仅限流类错误使用：距离解锁还有多少秒，供客户端显示倒计时。 */
    public readonly retryAfterSeconds?: number
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

export function forbidden(message = "无权访问") {
  return new ServiceError(message, 403, "FORBIDDEN");
}

export function notFound(message: string) {
  return new ServiceError(message, 404, "NOT_FOUND");
}

export function tooManyRequests(message = "请求过于频繁，请稍后再试", retryAfterSeconds?: number) {
  return new ServiceError(message, 429, "TOO_MANY_REQUESTS", retryAfterSeconds);
}

export function serviceUnavailable(message = "服务暂时不可用，请稍后再试") {
  return new ServiceError(message, 503, "SERVICE_UNAVAILABLE");
}
