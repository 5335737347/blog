import type { ApiResponse } from "@kpblog/contracts";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function legacyErrorMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return null;
}

function isApiSuccess<T>(payload: unknown): payload is { success: true; data: T } {
  return (
    !!payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === true &&
    "data" in payload
  );
}

function isApiFailure(payload: unknown): payload is {
  success: false;
  error: { code: string; message: string };
} {
  return (
    !!payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === false &&
    "error" in payload
  );
}

export async function readApiData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | null
    | unknown;

  if (isApiSuccess<T>(payload)) {
    return payload.data;
  }

  if (isApiFailure(payload)) {
    const error = payload.error;
    throw new ApiClientError(error.message, response.status, error.code);
  }

  const fallback = legacyErrorMessage(payload) || `请求失败: ${response.status}`;
  throw new ApiClientError(fallback, response.status, "INVALID_RESPONSE");
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return apiErrorMessage(payload, fallback);
}

/**
 * 从**已经解析过**的失败响应体里取错误信息。
 *
 * 存在的理由：Response 的 body 只能消费一次。调用方若为了拿
 * `error.retryAfterSeconds` 而先 `await res.json()`，再调 `readApiError(res)` 就会抛
 * `TypeError: Body has already been consumed`——而那个异常会被登录页的 catch
 * 误报成「网络错误」，把真实的 401/429 文案盖掉（管理员登录页真的这样错过一次）。
 * 所以：**先读一次 body，再用这个函数解析**，不要 clone、不要读第二次。
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (isApiFailure(payload)) {
    return payload.error.message;
  }
  return legacyErrorMessage(payload) || fallback;
}
