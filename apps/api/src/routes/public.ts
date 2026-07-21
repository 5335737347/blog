import type { FastifyPluginAsync } from "fastify";
import {
  getArticleIndexPageData,
  getCategoryArchivePageData,
  getContentLayoutData,
  getPublicSettings,
  getRssFeedData,
  getSitemapData,
  getTagArchivePageData,
} from "@/server/public/public-service";
import { apiSuccess, positiveInt } from "@/http";

type ArchiveParams = { slug: string };
type PageQuery = { page?: string; limit?: string };

const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/settings", async () => apiSuccess(await getPublicSettings()));
  app.get("/public/layout", async () => apiSuccess(await getContentLayoutData()));

  app.get<{ Querystring: PageQuery }>("/public/article-index", async (request) =>
    apiSuccess(await getArticleIndexPageData(
      positiveInt(request.query.page, 1),
      Math.min(50, positiveInt(request.query.limit, 10))
    ))
  );

  app.get<{ Params: ArchiveParams; Querystring: PageQuery }>("/public/tags/:slug", async (request) =>
    apiSuccess(await getTagArchivePageData(
      request.params.slug,
      positiveInt(request.query.page, 1),
      Math.min(50, positiveInt(request.query.limit, 10))
    ))
  );

  app.get<{ Params: ArchiveParams; Querystring: PageQuery }>("/public/categories/:slug", async (request) =>
    apiSuccess(await getCategoryArchivePageData(
      request.params.slug,
      positiveInt(request.query.page, 1),
      Math.min(50, positiveInt(request.query.limit, 10))
    ))
  );

  app.get("/public/rss-data", async () => apiSuccess(await getRssFeedData()));
  app.get("/public/sitemap-data", async () => apiSuccess(await getSitemapData()));
};

export default publicRoutes;
