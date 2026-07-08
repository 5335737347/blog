import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { logoutAdmin } from "@/server/auth/auth-service";

function handleAuthError(error: unknown, fallback: string) {
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

export async function POST() {
  try {
    return apiSuccess(await logoutAdmin());
  } catch (error) {
    return handleAuthError(error, "退出失败");
  }
}
