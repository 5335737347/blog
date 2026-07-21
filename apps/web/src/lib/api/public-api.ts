import "server-only";
import { cache } from "react";
import type { ApiResponse, PaginatedResult, PostDetail, PostSummary } from "@kpblog/contracts";

const DEFAULT_BLOG_TITLE = "鲲鹏の博客";
const DEFAULT_BLOG_DESCRIPTION = "一个关于技术和生活的个人博客";

export interface PublicSettingsDto {
  blogTitle: string;
  blogDescription: string;
}

export interface RegistrationCapabilities {
  email: boolean;
  phone: boolean;
}

interface TaxonomyDto {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface ContentLayoutDataDto {
  tags: TaxonomyDto[];
  recentPosts: { slug: string; title: string }[];
  settings: PublicSettingsDto;
}

interface ArchiveData {
  articles: PaginatedResult<PostSummary>;
}

interface TagArchiveData extends ArchiveData {
  tag: TaxonomyDto | null;
}

interface CategoryArchiveData extends ArchiveData {
  category: TaxonomyDto | null;
}

export interface RssPostDto {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  publishedAt: string | null;
  tags: { name: string }[];
}

export interface SitemapDataDto {
  posts: { slug: string; updatedAt: string }[];
  tags: { slug: string }[];
  categories: { slug: string }[];
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
}

async function getApiData<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? `API request failed: ${response.status}` : payload.error.message);
  }
  return payload.data;
}

export async function getPublicSettings(): Promise<PublicSettingsDto> {
  try {
    return await getApiData<PublicSettingsDto>("/api/public/settings");
  } catch {
    return {
      blogTitle: DEFAULT_BLOG_TITLE,
      blogDescription: DEFAULT_BLOG_DESCRIPTION,
    };
  }
}

export function getArticleIndexPageData(page: number, pageSize: number) {
  return getApiData<PaginatedResult<PostSummary>>(`/api/public/article-index?page=${page}&limit=${pageSize}`);
}

export const getArticlePageData = cache((slug: string) =>
  getApiData<PostDetail | null>(`/api/public/articles/${encodeURIComponent(slug)}`)
);

export function getTagArchivePageData(tagSlug: string, page: number, pageSize: number) {
  return getApiData<TagArchiveData>(`/api/public/tags/${encodeURIComponent(tagSlug)}?page=${page}&limit=${pageSize}`);
}

export function getCategoryArchivePageData(categorySlug: string, page: number, pageSize: number) {
  return getApiData<CategoryArchiveData>(`/api/public/categories/${encodeURIComponent(categorySlug)}?page=${page}&limit=${pageSize}`);
}

export function getContentLayoutData() {
  return getApiData<ContentLayoutDataDto>("/api/public/layout");
}

export function getRssFeedData() {
  return getApiData<{ posts: RssPostDto[]; settings: PublicSettingsDto }>("/api/public/rss-data");
}

export function getSitemapData() {
  return getApiData<SitemapDataDto>("/api/public/sitemap-data");
}

export async function getRegistrationCapabilities(): Promise<RegistrationCapabilities> {
  try {
    return await getApiData<RegistrationCapabilities>("/api/auth/registration-options");
  } catch {
    return { email: false, phone: false };
  }
}
