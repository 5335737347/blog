import type { FastifyPluginAsync } from "fastify";
import { listCategories, listTags } from "@/server/taxonomy/taxonomy-service";
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteOrphanTags,
  deleteTag,
  listCategoriesForAdmin,
  listTagsForAdmin,
  mergeTag,
  updateCategory,
  updateTag,
} from "@/server/taxonomy/taxonomy-admin-service";
import { getOptionalAuthSession, requireAdminSession } from "@/server/auth/auth-service";
import { apiSuccess, assertRequestOrigin, requestBody, sessionToken } from "@/http";

type IdParams = { id: string };
type TaxonomyQuery = { all?: string };

/**
 * 分类与标签路由。
 *
 * 公开读写分离：GET 全部公开（公开面语义不变），其余操作一律管理员。
 * 两个 GET 的 `?all=true` 都是管理端扩展参数——匿名/普通用户传入时被忽略，
 * 拿到的仍是公开口径（分类计数只算已发布；标签列表只含有已发布文章的）。
 */
const taxonomyRoutes: FastifyPluginAsync = async (app) => {
  // ====== 分类 ======
  app.get<{ Querystring: TaxonomyQuery }>("/categories", async (request) => {
    const user = await getOptionalAuthSession(sessionToken(request));
    if (user?.role === "ADMIN" && request.query.all === "true") {
      return apiSuccess(await listCategoriesForAdmin());
    }
    return apiSuccess(await listCategories());
  });

  app.post("/categories", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createCategory(requestBody(request))));
  });

  app.put<{ Params: IdParams }>("/categories/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateCategory(request.params.id, requestBody(request)));
  });

  app.delete<{ Params: IdParams }>("/categories/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteCategory(request.params.id));
  });

  // ====== 标签 ======
  app.get<{ Querystring: TaxonomyQuery }>("/tags", async (request) => {
    const user = await getOptionalAuthSession(sessionToken(request));
    if (user?.role === "ADMIN" && request.query.all === "true") {
      return apiSuccess(await listTagsForAdmin());
    }
    return apiSuccess(await listTags());
  });

  app.post("/tags", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createTag(requestBody(request))));
  });

  // 必须放在 /tags/:id 之前，避免把 "orphaned" 当作标签 id。
  app.delete("/tags/orphaned", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteOrphanTags());
  });

  app.put<{ Params: IdParams }>("/tags/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateTag(request.params.id, requestBody(request)));
  });

  app.delete<{ Params: IdParams }>("/tags/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteTag(request.params.id));
  });

  app.post<{ Params: IdParams }>("/tags/:id/merge", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await mergeTag(request.params.id, requestBody(request)));
  });
};

export default taxonomyRoutes;
