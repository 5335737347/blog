import { NextRequest } from "next/server";
import {
  apiCreated,
  apiError,
  errorMessage,
} from "@/lib/api-response";
import { verifyPublishApiKey } from "@/server/auth/auth-service";
import { publishMarkdown } from "@/server/publishing/publishing-service";
import { isServiceError } from "@/server/errors";

function handlePublishingError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// POST /api/publish — publish article via API key
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const apiKey = auth.replace(/^Bearer\s+/i, "");

  try {
    await verifyPublishApiKey(apiKey);
    return apiCreated(await publishMarkdown(await request.json()));
  } catch (error) {
    return handlePublishingError(error, "发布失败");
  }
}
