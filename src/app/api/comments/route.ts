import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  apiCreated,
  apiError,
  apiSuccess,
  apiUnauthorized,
  errorMessage,
} from "@/lib/api-response";
import {
  createComment,
  listAdminComments,
  listPublicComments,
} from "@/server/comments/comment-service";
import { isServiceError } from "@/server/errors";

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function handleCommentError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/comments?postId=xxx — get approved comments for a post
export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get("postId");
  const user = await getAuthUser(request);

  try {
    if (postId) {
      return apiSuccess(await listPublicComments(postId));
    }
    if (!user) {
      return apiUnauthorized();
    }
    return apiSuccess(
      await listAdminComments({
        approved: request.nextUrl.searchParams.get("approved"),
        page: positiveInt(request.nextUrl.searchParams.get("page"), 1),
        pageSize: Math.min(50, positiveInt(request.nextUrl.searchParams.get("limit"), 50)),
      })
    );
  } catch (error) {
    return handleCommentError(error, "获取评论失败");
  }
}

// POST /api/comments — submit a new comment
export async function POST(request: NextRequest) {
  try {
    return apiCreated(await createComment(await request.json()));
  } catch (error) {
    return handleCommentError(error, "提交失败");
  }
}
