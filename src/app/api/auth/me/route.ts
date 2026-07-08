import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { getCurrentAdminSession } from "@/server/auth/auth-service";
import { isServiceError } from "@/server/errors";

function handleAuthError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

export async function GET() {
  try {
    return apiSuccess(await getCurrentAdminSession());
  } catch (error) {
    return handleAuthError(error, "读取登录状态失败");
  }
}
