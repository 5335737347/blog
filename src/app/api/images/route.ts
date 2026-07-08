import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiSuccess, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { isServiceError } from "@/server/errors";
import { deleteImage, listImages } from "@/server/media/media-service";

function handleMediaError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/images — list all uploaded images
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    return apiSuccess(await listImages());
  } catch (error) {
    return handleMediaError(error, "读取失败");
  }
}

// DELETE /api/images?file=filename
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    const file = request.nextUrl.searchParams.get("file");
    return apiSuccess(await deleteImage(file));
  } catch (error) {
    return handleMediaError(error, "删除失败");
  }
}
