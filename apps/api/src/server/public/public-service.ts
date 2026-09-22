import type { Prisma } from "@prisma/client";
import type {
  ArticleAdjacent,
  HomePageData,
  ProjectCardData,
  ProjectsPageData,
} from "@kpblog/contracts";
import { prisma } from "@/lib/prisma";
import { postSummarySelect, toPostSummaryDto } from "@/server/articles/article-dto";
import {
  POST_ORDER_ASC,
  POST_ORDER_DESC,
  newerThanFilter,
  olderThanFilter,
} from "@/server/articles/article-order";
import { listArticles } from "@/server/articles/article-service";
import { getSettingsMap } from "@/server/settings/settings-service";
import {
  getCategoryBySlug,
  getTagBySlug,
  listCategories,
  listTags,
} from "@/server/taxonomy/taxonomy-service";

const DEFAULT_BLOG_TITLE = "鲲鹏の博客";
const DEFAULT_BLOG_DESCRIPTION = "一个关于技术和生活的个人博客";

const rssPostSelect = {
  slug: true,
  title: true,
  excerpt: true,
  content: true,
  coverImage: true,
  publishedAt: true,
  tags: {
    select: { tag: { select: { name: true } } },
  },
} satisfies Prisma.PostSelect;

type RssPostRecord = Prisma.PostGetPayload<{ select: typeof rssPostSelect }>;

export interface PublicSettingsDto {
  blogTitle: string;
  blogDescription: string;
}

export interface ContentLayoutDataDto {
  tags: Awaited<ReturnType<typeof listTags>>;
  recentPosts: { slug: string; title: string }[];
  settings: PublicSettingsDto;
}

export interface RssPostDto {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  publishedAt: Date | null;
  tags: { name: string }[];
}

export interface SitemapProjectDto {
  slug: string;
  lastModified: Date | null;
}

export interface SitemapPostDto {
  slug: string;
  updatedAt: Date;
}

export interface SitemapTagDto {
  slug: string;
}

function toRssPostDto(post: RssPostRecord): RssPostDto {
  return {
    ...post,
    tags: post.tags.map((item) => item.tag),
  };
}

export async function getPublicSettings(): Promise<PublicSettingsDto> {
  const settings = await getSettingsMap();

  return {
    blogTitle: settings.blog_title || DEFAULT_BLOG_TITLE,
    blogDescription: settings.blog_description || DEFAULT_BLOG_DESCRIPTION,
  };
}

export async function getArticleIndexPageData(
  page: number,
  pageSize: number,
  query?: string,
  filters?: { category?: string; tag?: string }
) {
  return listArticles({
    page,
    pageSize,
    // 关键词搜索(标题/摘要/正文 contains);/articles 列表页的搜索框走这里
    query: query ?? null,
    category: filters?.category || null,
    tag: filters?.tag || null,
    isAdmin: false,
  });
}

export async function getTagArchivePageData(
  tagSlug: string,
  page: number,
  pageSize: number
) {
  const [tag, articles] = await Promise.all([
    getTagBySlug(tagSlug),
    listArticles({
      page,
      pageSize,
      tag: tagSlug,
      isAdmin: false,
    }),
  ]);

  return { tag, articles };
}

export async function getCategoryArchivePageData(
  categorySlug: string,
  page: number,
  pageSize: number
) {
  const [category, articles] = await Promise.all([
    getCategoryBySlug(categorySlug),
    listArticles({
      page,
      pageSize,
      category: categorySlug,
      isAdmin: false,
    }),
  ]);

  return { category, articles };
}

export async function getContentLayoutData(): Promise<ContentLayoutDataDto> {
  const [tags, recentArticles, settings] = await Promise.all([
    listTags(),
    listArticles({
      page: 1,
      pageSize: 5,
      isAdmin: false,
    }),
    getPublicSettings(),
  ]);

  return {
    tags,
    recentPosts: recentArticles.items.map((post) => ({
      slug: post.slug,
      title: post.title,
    })),
    settings,
  };
}

export async function getRssFeedData() {
  const [posts, settings] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: rssPostSelect,
    }),
    getPublicSettings(),
  ]);

  return {
    posts: posts.map(toRssPostDto),
    settings,
  };
}

/**
 * sitemap 协议规定单个文件最多 50000 条 URL。之前三个查询都没有 take，
 * 会随文章增长把整张表读进内存；这里按协议上限做硬性边界。
 * 真正超过这个量级时应改为 sitemap index 分片。
 */
const SITEMAP_URL_LIMIT = 50_000;

export async function getSitemapData(): Promise<{
  posts: SitemapPostDto[];
  tags: SitemapTagDto[];
  categories: SitemapTagDto[];
  projects: SitemapProjectDto[];
}> {
  const [posts, tags, categories, projects] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      orderBy: POST_ORDER_DESC,
      take: SITEMAP_URL_LIMIT,
      select: { slug: true, updatedAt: true },
    }),
    prisma.tag.findMany({
      where: { posts: { some: { post: { published: true } } } },
      orderBy: { slug: "asc" },
      take: SITEMAP_URL_LIMIT,
      select: { slug: true },
    }),
    prisma.category.findMany({
      where: { posts: { some: { published: true } } },
      orderBy: { slug: "asc" },
      take: SITEMAP_URL_LIMIT,
      select: { slug: true },
    }),
    prisma.project.findMany({
      where: { posts: { some: { published: true } } },
      orderBy: { slug: "asc" },
      take: SITEMAP_URL_LIMIT,
      select: { slug: true, posts: { where: { published: true }, select: { updatedAt: true } } },
    }),
  ]);

  return {
    posts,
    tags,
    categories,
    projects: projects.map((project) => ({
      slug: project.slug,
      lastModified: project.posts.reduce<Date | null>(
        (latest, post) => (latest === null || post.updatedAt > latest ? post.updatedAt : latest),
        null
      ),
    })),
  };
}

export async function getHomePageData(): Promise<HomePageData> {
  const [recentPosts, categories, tags] = await Promise.all([
    listArticles({ page: 1, pageSize: 6, isAdmin: false }),
    listCategories(),
    listTags(),
  ]);

  return {
    recentPosts: recentPosts.items,
    categories,
    tags,
  };
}


/**
 * 相关文章候选池上限。
 *
 * 打分需要在内存里做，所以必须先有边界：只取「同分类或至少共享一个标签」的
 * 最新 N 篇，再排序取前 3。之前只看同分类，标签完全不参与——对中文博客来说
 * 标签往往比分类更贴近主题。
 */
const RELATED_POOL_SIZE = 60;
const RELATED_COUNT = 3;

export async function getArticleAdjacentData(slug: string): Promise<ArticleAdjacent | null> {
  const post = await prisma.post.findUnique({
    where: { slug, published: true },
    select: {
      id: true,
      categoryId: true,
      publishedAt: true,
      createdAt: true,
      category: { select: { slug: true } },
      tags: { select: { tagId: true, tag: { select: { slug: true } } } },
    },
  });
  if (!post) return null;

  const ownTagSlugs = new Set(post.tags.map((link) => link.tag.slug));
  const ownTagIds = post.tags.map((link) => link.tagId);
  const ownCategorySlug = post.category?.slug ?? null;

  // 候选必须与本文有共同信号（同分类，或至少一个共同标签），否则不进入打分。
  const relatedSignals: Prisma.PostWhereInput[] = [];
  if (post.categoryId) relatedSignals.push({ categoryId: post.categoryId });
  if (ownTagIds.length) relatedSignals.push({ tags: { some: { tagId: { in: ownTagIds } } } });

  // 之前这里会把全部已发布文章取回内存再 findIndex，等于每看一篇文章都要
  // 加载整张表。改为按排序键直接查询相邻两篇，走 Post_published_publishedAt_idx。
  const [previous, next, candidates] = await Promise.all([
    prisma.post.findFirst({
      where: {
        published: true,
        id: { not: post.id },
        ...olderThanFilter(post),
      },
      orderBy: POST_ORDER_DESC,
      select: { slug: true, title: true },
    }),
    prisma.post.findFirst({
      where: {
        published: true,
        id: { not: post.id },
        ...newerThanFilter(post),
      },
      orderBy: POST_ORDER_ASC,
      select: { slug: true, title: true },
    }),
    relatedSignals.length
      ? prisma.post.findMany({
          where: { published: true, id: { not: post.id }, OR: relatedSignals },
          orderBy: POST_ORDER_DESC,
          take: RELATED_POOL_SIZE,
          select: postSummarySelect,
        })
      : Promise.resolve([]),
  ]);

  // 共同标签权重 2、同分类权重 1：标签是更强的主题信号。
  // 同分时保持 POST_ORDER_DESC 的顺序（Array.prototype.sort 自 ES2019 起稳定）。
  const related = candidates
    .map((candidate) => ({
      candidate,
      score:
        candidate.tags.filter((link) => ownTagSlugs.has(link.tag.slug)).length * 2 +
        (ownCategorySlug && candidate.category?.slug === ownCategorySlug ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RELATED_COUNT)
    .map((entry) => entry.candidate);

  // 分类和标签都没有交集时，回退到最新文章，避免相关阅读整块留空。
  const fallback = related.length
    ? related
    : await prisma.post.findMany({
        where: { published: true, id: { not: post.id } },
        orderBy: POST_ORDER_DESC,
        take: RELATED_COUNT,
        select: postSummarySelect,
      });

  return {
    previous,
    next,
    related: fallback.map(toPostSummaryDto),
  };
}

/**
 * 项目页数据：每个项目的已发布文章数与最近更新时间，按最近更新倒序。
 *
 * 与归档时代不同：未归入项目的文章不再在这里兜底——/articles 本身就是
 * 全部文章的索引（时间倒序 + 搜索/筛选），项目页只负责「项目」这个维度。
 */
export async function getProjectsPageData(): Promise<ProjectsPageData> {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      coverImage: true,
      posts: {
        where: { published: true },
        select: { publishedAt: true },
        orderBy: { publishedAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const cards: ProjectCardData[] = projects.map((project) => {
    const latest = project.posts[0]?.publishedAt ?? null;
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      coverImage: project.coverImage,
      postCount: project.posts.length,
      latestPublishedAt: latest ? latest.toISOString() : null,
    };
  });

  cards.sort((a, b) => {
    if (!a.latestPublishedAt) return 1;
    if (!b.latestPublishedAt) return -1;
    return b.latestPublishedAt.localeCompare(a.latestPublishedAt);
  });

  return { projects: cards };
}

/** 项目详情页：项目信息 + 该项目已发布文章的分页列表。 */
export async function getCollectionPageData(
  projectSlug: string,
  page: number,
  pageSize: number
) {
  const [project, articles] = await Promise.all([
    prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, name: true, slug: true, description: true, coverImage: true },
    }),
    listArticles({
      page,
      pageSize,
      project: projectSlug,
      isAdmin: false,
    }),
  ]);

  return { project, articles };
}
