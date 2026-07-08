import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  errorMessage,
} from "@/lib/api-response";
import {
  deleteArticle,
  getArticleById,
  updateArticle,
} from "@/server/articles/article-service";
import { isServiceError } from "@/server/errors";

function handleArticleError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/articles/[id] — get single article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(request);

  try {
    return apiSuccess(await getArticleById(id, { isAdmin: Boolean(user) }));
  } catch (error) {
    return handleArticleError(error, "获取文章失败");
  }
}

// PUT /api/articles/[id] — update article (admin only)
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
    return apiSuccess(await updateArticle(id, await request.json()));
  } catch (error) {
    return handleArticleError(error, "更新失败: " + errorMessage(error));
  }
}

// DELETE /api/articles/[id] — delete article (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    const { id } = await params;
    return apiSuccess(await deleteArticle(id));
  } catch (error) {
    return handleArticleError(error, "删除失败: " + errorMessage(error));
  }
}
