import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiSuccess, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { deleteComment, moderateComment } from "@/server/comments/comment-service";
import { isServiceError } from "@/server/errors";

function handleCommentError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// PUT /api/comments/[id] — approve/reject comment (admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  const { id } = await params;

  try {
    return apiSuccess(await moderateComment(id, await request.json()));
  } catch (error) {
    return handleCommentError(error, "操作失败");
  }
}

// DELETE /api/comments/[id] — delete comment (admin)
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
    return apiSuccess(await deleteComment(id));
  } catch (error) {
    return handleCommentError(error, "删除失败");
  }
}
