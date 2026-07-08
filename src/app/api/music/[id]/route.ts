import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiSuccess, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { isServiceError } from "@/server/errors";
import { deleteMusicTrack } from "@/server/media/media-service";

function handleMediaError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// DELETE /api/music/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  const { id } = await params;
  try {
    return apiSuccess(await deleteMusicTrack(id));
  } catch (error) {
    return handleMediaError(error, "删除失败");
  }
}
