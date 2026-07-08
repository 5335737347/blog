import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiCreated, apiError, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { importFiles } from "@/server/publishing/publishing-service";
import { isServiceError } from "@/server/errors";

function handlePublishingError(error: unknown, fallback: string) {
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
    const files = formData.getAll("files") as File[];
    return apiCreated(await importFiles(files));
  } catch (error) {
    return handlePublishingError(error, "导入失败");
  }
}
