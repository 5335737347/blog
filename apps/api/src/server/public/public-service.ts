import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listArticles } from "@/server/articles/article-service";
import { getSettingsMap } from "@/server/settings/settings-service";
import {
  getCategoryBySlug,
  getTagBySlug,
  listTags,
} from "@/server/taxonomy/taxonomy-service";

const DEFAULT_BLOG_TITLE = "鲲鹏の博客";
const DEFAULT_BLOG_DESCRIPTION = "一个关于技术和生活的个人博客";

const rssPostSelect = {
  slug: true,
  title: true,
  excerpt: true,
  content: true,
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
  publishedAt: Date | null;
  tags: { name: string }[];
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

export async function getArticleIndexPageData(page: number, pageSize: number) {
  return listArticles({
    page,
    pageSize,
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

export async function getSitemapData(): Promise<{
  posts: SitemapPostDto[];
  tags: SitemapTagDto[];
  categories: SitemapTagDto[];
}> {
  const [posts, tags, categories] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.tag.findMany({
      where: { posts: { some: { post: { published: true } } } },
      select: { slug: true },
    }),
    prisma.category.findMany({
      where: { posts: { some: { published: true } } },
      select: { slug: true },
    }),
  ]);

  return { posts, tags, categories };
}
