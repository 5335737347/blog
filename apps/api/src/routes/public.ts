import type { FastifyPluginAsync } from "fastify";
import {
  getCollectionPageData,
  getProjectsPageData,
  getArticleAdjacentData,
  getArticleIndexPageData,
  getCategoryArchivePageData,
  getContentLayoutData,
  getHomePageData,
  getPublicSettings,
  getRssFeedData,
  getSitemapData,
  getTagArchivePageData,
} from "@/server/public/public-service";
import { getProfile } from "@/server/profile/profile-service";
import {
  DEFAULT_PUBLIC_COMMENT_PAGE_SIZE,
  listPublicGuestbook,
  MAX_PUBLIC_COMMENT_PAGE_SIZE,
} from "@/server/comments/comment-service";
import { apiSuccess, positiveInt } from "@/http";

type ArchiveParams = { slug: string };
type PageQuery = { page?: string; limit?: string; q?: string };

const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/settings", async () => apiSuccess(await getPublicSettings()));
  app.get("/public/layout", async () => apiSuccess(await getContentLayoutData()));
  app.get("/public/profile", async () => apiSuccess(await getProfile()));

  // 留言板公开读取。留言与文章评论同表，postId 为 null 即为留言板。
  app.get<{ Querystring: PageQuery }>("/public/guestbook", async (request) =>
    apiSuccess(await listPublicGuestbook({
      page: positiveInt(request.query.page, 1),
      pageSize: Math.min(
        MAX_PUBLIC_COMMENT_PAGE_SIZE,
        positiveInt(request.query.limit, DEFAULT_PUBLIC_COMMENT_PAGE_SIZE)
      ),
    }))
  );

  app.get<{ Querystring: PageQuery & { category?: string; tag?: string } }>(
    "/public/article-index",
    async (request) =>
      apiSuccess(await getArticleIndexPageData(
        positiveInt(request.query.page, 1),
        Math.min(50, positiveInt(request.query.limit, 10)),
        // 与 admin 列表同一约定:关键词截断到 100 字符,过滤已发布文章
        request.query.q?.slice(0, 100),
        // /articles 列表页的分类/标签下拉筛选
        { category: request.query.category?.slice(0, 100), tag: request.query.tag?.slice(0, 100) }
      ))
  );

  app.get<{ Params: ArchiveParams; Querystring: PageQuery }>("/public/collections/:slug", async (request) =>
    apiSuccess(await getCollectionPageData(
      request.params.slug,
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

  app.get("/public/home", async () => apiSuccess(await getHomePageData()));

  app.get("/public/collections", async () => apiSuccess(await getProjectsPageData()));

  app.get<{ Params: ArchiveParams }>("/public/articles/:slug/adjacent", async (request) =>
    apiSuccess(await getArticleAdjacentData(request.params.slug))
  );
};

export default publicRoutes;
