import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { listTags } from "@/server/taxonomy/taxonomy-service";

function handleTaxonomyError(error: unknown, fallback: string) {
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/tags — list all tags with post counts
export async function GET() {
  try {
    return apiSuccess(await listTags());
  } catch (error) {
    return handleTaxonomyError(error, "读取失败");
  }
}
