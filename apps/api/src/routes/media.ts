import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession } from "@/server/auth/auth-service";
import type { MusicUrlInput } from "@/server/media/media-service";
import {
  createImageFromFile,
  createMusicFromFile,
  createMusicFromUrl,
  deleteImage,
  deleteMusicTrack,
  listImages,
  listMusicTracks,
} from "@/server/media/media-service";
import { apiSuccess, assertRequestOrigin, multipartFiles, requestBody, sessionToken } from "@/http";

type IdParams = { id: string };

/**
 * 媒体路由：音乐与封面图片（后台「资源管理」页共用）。
 */
const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/images", async () => apiSuccess(await listImages()));

  app.post("/images", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const { files } = await multipartFiles(request);
    const image = await createImageFromFile({ file: files[0] || null });
    return reply.status(201).send(apiSuccess(image));
  });

  app.delete<{ Params: { name: string } }>("/images/:name", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteImage(request.params.name));
  });

  app.get("/music", async () => apiSuccess(await listMusicTracks()));

  app.post("/music", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const track = request.isMultipart()
      ? await (async () => {
          const { files, fields } = await multipartFiles(request);
          return createMusicFromFile({ file: files[0] || null, title: fields.title, artist: fields.artist });
        })()
      : await createMusicFromUrl(requestBody<MusicUrlInput>(request));
    return reply.status(201).send(apiSuccess(track));
  });

  app.delete<{ Params: IdParams }>("/music/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteMusicTrack(request.params.id));
  });
};

export default mediaRoutes;
