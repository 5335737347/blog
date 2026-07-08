import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiCreated, apiError, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { isServiceError } from "@/server/errors";
import { uploadImage } from "@/server/media/media-service";

function handleMediaError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    return apiCreated(await uploadImage(file));
  } catch (error) {
    return handleMediaError(error, "上传失败");
  }
}
