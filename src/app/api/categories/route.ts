import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { listCategories } from "@/server/taxonomy/taxonomy-service";

function handleTaxonomyError(error: unknown, fallback: string) {
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/categories — list all categories
export async function GET() {
  try {
    return apiSuccess(await listCategories());
  } catch (error) {
    return handleTaxonomyError(error, "读取失败");
  }
}
