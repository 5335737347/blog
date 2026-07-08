import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  getCurrentUserApiKey,
  regenerateCurrentUserApiKey,
} from "@/server/auth/auth-service";
import { isServiceError } from "@/server/errors";

function handleAuthError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/auth/key — get current user's API key
export async function GET() {
  try {
    return apiSuccess(await getCurrentUserApiKey());
  } catch (error) {
    return handleAuthError(error, "读取 API Key 失败");
  }
}

// POST /api/auth/key — regenerate API key
export async function POST() {
  try {
    return apiSuccess(await regenerateCurrentUserApiKey());
  } catch (error) {
    return handleAuthError(error, "生成 API Key 失败");
  }
}
