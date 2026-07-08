import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import {
  apiCreated,
  apiError,
  apiSuccess,
  apiUnauthorized,
  errorMessage,
} from "@/lib/api-response";
import { createArticle, listArticles } from "@/server/articles/article-service";
import { isServiceError } from "@/server/errors";

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function handleArticleError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/articles — list published articles (public)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const user = await getAuthUser(request);

  try {
    const data = await listArticles({
      page: positiveInt(searchParams.get("page"), 1),
      pageSize: Math.min(50, positiveInt(searchParams.get("limit"), 10)),
      tag: searchParams.get("tag"),
      category: searchParams.get("category"),
      published: searchParams.get("published"),
      isAdmin: Boolean(user),
    });
    return apiSuccess(data);
  } catch (error) {
    return handleArticleError(error, "获取文章列表失败");
  }
}

// POST /api/articles — create article (admin only)
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    const post = await createArticle(await request.json());
    return apiCreated(post);
  } catch (error) {
    return handleArticleError(error, "创建失败");
  }
}
