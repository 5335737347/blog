import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession } from "@/server/auth/auth-service";
import { updateProfile } from "@/server/profile/profile-service";
import { apiSuccess, assertRequestOrigin, sessionToken } from "@/http";

/**
 * 个人资料的写入端点。
 *
 * 读取走 GET /api/public/profile（公开内容，无需鉴权）；
 * 写入必须由管理员会话发起，并经过同源校验。
 */
const profileRoutes: FastifyPluginAsync = async (app) => {
  app.put("/profile", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateProfile(request.body));
  });
};

export default profileRoutes;
