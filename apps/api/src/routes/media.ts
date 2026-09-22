import type { FastifyPluginAsync } from "fastify";
import { getOptionalAuthSession, requireAdminSession } from "@/server/auth/auth-service";
import type { ImageUrlInput, MusicUrlInput } from "@/server/media/media-service";
import {
  adoptPostImages,
  createImageFromFile,
  createImageFromUrl,
  createMusicFromFile,
  createMusicFromUrl,
  deleteImage,
  deleteMusicTrack,
  listImages,
  listMusicTracks,
} from "@/server/media/media-service";
import {
  createWallpaperFromFile,
  deleteWallpaper,
  listWallpapers,
  reorderWallpapers,
  updateWallpaper,
} from "@/server/media/wallpaper-service";
import { apiSuccess, assertRequestOrigin, multipartFiles, requestBody, sessionToken } from "@/http";

type IdParams = { id: string };
type ImageQuery = { kind?: string; force?: string };
type WallpaperQuery = { all?: string };

/**
 * 媒体路由：音乐与图片。图片是 MediaImage 登记表（本地文件 + 外部图床
 * 统一入库，kind 区分封面与正文图）；音乐是 Music 表 + 可选本地文件。
 * 列表端点公开，写操作一律管理员。
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
      : await createMusicFromUrl(requestBody<MusicUrlInput>(request));
    return reply.status(201).send(apiSuccess(track));
  });

  app.delete<{ Params: IdParams }>("/music/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteMusicTrack(request.params.id));
  });

  app.get<{ Querystring: ImageQuery }>("/images", async (request) =>
    apiSuccess(await listImages({ kind: request.query.kind }))
  );

  // multipart（上传文件，kind 随表单字段）与 JSON（登记外部图床 URL）二选一。
  app.post("/images", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const image = request.isMultipart()
      ? await (async () => {
          const { files, fields } = await multipartFiles(request);
          return createImageFromFile({ file: files[0] || null, kind: fields.kind });
        })()
      : await createImageFromUrl(requestBody<ImageUrlInput>(request));
    return reply.status(201).send(apiSuccess(image));
  });

  app.delete<{ Params: IdParams; Querystring: ImageQuery }>("/images/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteImage(request.params.id, { force: request.query.force === "true" }));
  });

  // 一键收编：扫描全部文章的 coverImage 与正文图片 URL，登记入库（幂等）。
  app.post("/images/adopt", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await adoptPostImages());
  });

  // ====== 首页壁纸轮换 ======
  app.get<{ Querystring: WallpaperQuery }>("/wallpapers", async (request) => {
    const user = await getOptionalAuthSession(sessionToken(request));
    const all = user?.role === "ADMIN" && request.query.all === "true";
    return apiSuccess(await listWallpapers({ all }));
  });

  app.post("/wallpapers", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const { files } = await multipartFiles(request);
    return reply.status(201).send(apiSuccess(await createWallpaperFromFile({ file: files[0] || null })));
  });

  app.put<{ Params: IdParams }>("/wallpapers/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateWallpaper(request.params.id, requestBody(request)));
  });

  app.post("/wallpapers/reorder", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await reorderWallpapers(requestBody(request)));
  });

  app.delete<{ Params: IdParams }>("/wallpapers/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteWallpaper(request.params.id));
  });
};

export default mediaRoutes;
