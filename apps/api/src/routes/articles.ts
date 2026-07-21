import type { FastifyPluginAsync } from "fastify";
import { getAuthUser } from "@/lib/auth";
import {
  createArticle,
  deleteArticle,
  getArticleById,
  getPublicArticleBySlug,
  listArticles,
  updateArticle,
} from "@/server/articles/article-service";
import { requireAdminSession } from "@/server/auth/auth-service";
import { listCategories, listTags } from "@/server/taxonomy/taxonomy-service";
import { apiSuccess, assertRequestOrigin, positiveInt, sessionToken } from "@/http";

type ArticleParams = { id: string };
type SlugParams = { slug: string };
type ArticleQuery = {
  page?: string;
  limit?: string;
  tag?: string;
  category?: string;
  q?: string;
  published?: string;
};

const articleRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ArticleQuery }>("/articles", async (request) => {
    const user = await getAuthUser(sessionToken(request));
    const query = request.query;
    return apiSuccess(await listArticles({
      page: positiveInt(query.page, 1),
      pageSize: Math.min(50, positiveInt(query.limit, 10)),
      tag: query.tag,
      category: query.category,
      query: query.q?.slice(0, 100),
      published: query.published,
      isAdmin: user?.role === "ADMIN",
    }));
  });

  app.post("/articles", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createArticle(request.body as Record<string, unknown>)));
  });

  app.get<{ Params: ArticleParams }>("/articles/:id", async (request) => {
    const user = await getAuthUser(sessionToken(request));
    return apiSuccess(await getArticleById(request.params.id, { isAdmin: user?.role === "ADMIN" }));
  });

  app.put<{ Params: ArticleParams }>("/articles/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await updateArticle(request.params.id, request.body as Record<string, unknown>));
  });

  app.delete<{ Params: ArticleParams }>("/articles/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteArticle(request.params.id));
  });

  app.get<{ Params: SlugParams }>("/public/articles/:slug", async (request) =>
    apiSuccess(await getPublicArticleBySlug(request.params.slug))
  );

  app.get("/tags", async () => apiSuccess(await listTags()));
  app.get("/categories", async () => apiSuccess(await listCategories()));
};

export default articleRoutes;
