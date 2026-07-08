import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { apiCreated, apiError, apiSuccess, apiUnauthorized, errorMessage } from "@/lib/api-response";
import { isServiceError } from "@/server/errors";
import {
  createMusicFromFile,
  createMusicFromUrl,
  listMusicTracks,
} from "@/server/media/media-service";

function handleMediaError(error: unknown, fallback: string) {
  if (isServiceError(error)) {
    return apiError(error.message, error.status, error.code);
  }
  console.error(fallback, errorMessage(error));
  return apiError(fallback);
}

// GET /api/music — list all music
export async function GET() {
  try {
    return apiSuccess(await listMusicTracks());
  } catch (error) {
    return handleMediaError(error, "读取失败");
  }
}

// POST /api/music — upload file or add external URL
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return apiUnauthorized();
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      return apiCreated(
        await createMusicFromFile({
          file,
          title: formData.get("title"),
          artist: formData.get("artist"),
        })
      );
    }

    return apiCreated(await createMusicFromUrl(await request.json()));
  } catch (error) {
    return handleMediaError(error, "添加失败");
  }
}
