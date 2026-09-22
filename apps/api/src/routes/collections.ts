import type { FastifyPluginAsync } from "fastify";
import { getOptionalAuthSession, requireAdminSession } from "@/server/auth/auth-service";
import {
  createProject,
  deleteProject,
  listProjectsForAdmin,
  listProjectsPublic,
  updateProject,
} from "@/server/projects/project-service";
import { apiSuccess, assertRequestOrigin, requestBody, sessionToken } from "@/http";

type IdParams = { id: string };
type ProjectQuery = { all?: string };

/**
 * 项目合集路由。GET 公开（公开口径只计已发布；?all=true 管理员含草稿，
 * 匿名/普通用户忽略该参数），其余操作一律管理员。
 */
const collectionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ProjectQuery }>("/collections", async (request) => {
    const user = await getOptionalAuthSession(sessionToken(request));
    if (user?.role === "ADMIN" && request.query.all === "true") {
      return apiSuccess(await listProjectsForAdmin());
    }
    return apiSuccess(await listProjectsPublic());
  });

  app.post("/collections", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createProject(requestBody(request))));
  });

  app.put<{ Params: IdParams }>("/collections/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateProject(request.params.id, requestBody(request)));
  });

  app.delete<{ Params: IdParams }>("/collections/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteProject(request.params.id));
  });
};

export default collectionRoutes;
