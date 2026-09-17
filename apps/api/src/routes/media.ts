import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession } from "@/server/auth/auth-service";
import {
  createMusicFromFile,
  createMusicFromUrl,
  deleteMusicTrack,
  listMusicTracks,
} from "@/server/media/media-service";
import { apiSuccess, assertRequestOrigin, multipartFiles, sessionToken } from "@/http";

type IdParams = { id: string };

/**
 * 媒体路由。目前只剩音乐：站点的图片走外部图床（GitHub），
 * 本地上传/列举/删除图片的端点与后台页面已移除。
 */
const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/music", async () => apiSuccess(await listMusicTracks()));

  app.post("/music", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const track = request.isMultipart()
      ? await (async () => {
          const { files, fields } = await multipartFiles(request);
          return createMusicFromFile({ file: files[0] || null, title: fields.title, artist: fields.artist });
        })()
      : await createMusicFromUrl((request.body || {}) as Record<string, unknown>);
    return reply.status(201).send(apiSuccess(track));
  });

  app.delete<{ Params: IdParams }>("/music/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteMusicTrack(request.params.id));
  });
};

export default mediaRoutes;
