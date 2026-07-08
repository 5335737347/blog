import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiSuccess, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { getSettingsMap, updateSettings } from "@/server/settings/settings-service";

function handleSettingsError(error: unknown, fallback: string) {
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/settings — get all settings (public, for site config)
export async function GET() {
  try {
    return apiSuccess(await getSettingsMap());
  } catch (error) {
    return handleSettingsError(error, "读取失败");
  }
}

// PUT /api/settings — update settings (admin only)
export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    return apiSuccess(await updateSettings(await request.json()));
  } catch (error) {
    return handleSettingsError(error, "保存失败");
  }
}
