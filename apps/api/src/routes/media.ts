import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession } from "@/server/auth/auth-service";
import {
  createMusicFromFile,
  createMusicFromUrl,
  deleteImage,
  deleteMusicTrack,
  listImages,
  listMusicTracks,
  uploadImage,
} from "@/server/media/media-service";
import { apiSuccess, assertRequestOrigin, multipartFiles, sessionToken } from "@/http";

type IdParams = { id: string };
type ImageQuery = { file?: string };

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

  app.get("/images", async (request) => {
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await listImages());
  });

  app.delete<{ Querystring: ImageQuery }>("/images", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteImage(request.query.file || null));
  });

  app.post("/upload", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const { files } = await multipartFiles(request);
    return reply.status(201).send(apiSuccess(await uploadImage(files[0] || null)));
  });
};

export default mediaRoutes;
