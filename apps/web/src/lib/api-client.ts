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
  if (isApiFailure(payload)) {
    return payload.error.message;
  }
  return legacyErrorMessage(payload) || fallback;
}
