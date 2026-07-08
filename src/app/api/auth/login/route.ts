import { NextRequest } from "next/server";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { isServiceError } from "@/server/errors";
import { loginAdmin } from "@/server/auth/auth-service";

function handleAuthError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

export async function POST(request: NextRequest) {
  try {
    return apiSuccess(await loginAdmin(await request.json()));
  } catch (error) {
    return handleAuthError(error, "登录失败");
  }
}
