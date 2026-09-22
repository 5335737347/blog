import "server-only";
import { cache } from "react";
import type {
  ProjectsPageData,
  ApiResponse,
  ArticleAdjacent,
  HomePageData,
  PaginatedResult,
  PostDetail,
  PostSummary,
  ProfileDto,
} from "@kpblog/contracts";

const DEFAULT_BLOG_TITLE = "鲲鹏の博客";
const DEFAULT_BLOG_DESCRIPTION = "一个关于技术和生活的个人博客";

export interface PublicSettingsDto {
  blogTitle: string;
  blogDescription: string;
}

export interface RegistrationCapabilities {
  email: boolean;
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

/** 标签/分类列表页接口的返回形状。 */
interface TaxonomyArchiveListing {
  articles: PaginatedResult<PostSummary>;
}

interface TagArchiveData extends TaxonomyArchiveListing {
  tag: TaxonomyDto | null;
}

interface CategoryArchiveData extends TaxonomyArchiveListing {
  category: TaxonomyDto | null;
}

export interface RssPostDto {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  publishedAt: string | null;
  tags: { name: string }[];
}

export interface SitemapDataDto {
  posts: { slug: string; updatedAt: string }[];
  tags: { slug: string }[];
  categories: { slug: string }[];
  projects: { slug: string; lastModified: string | null }[];
}

function apiBaseUrl() {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
}

/**
 * 公开内容的默认重验证窗口。博客内容不是实时数据，之前每个请求都用
 * no-store 重新取一遍，导致每次浏览要打 4-5 次 API，且页面无法静态化。
 */
const REVALIDATE_SECONDS = 60;

async function getApiData<T>(path: string, revalidate = REVALIDATE_SECONDS): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    next: { revalidate },
    headers: { Accept: "application/json" },
  });

  // 先解析再判断状态码，会让网关返回非 JSON（例如 502 的 HTML 页面）时
  // 抛出 SyntaxError，掩盖真正的失败原因。
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || payload === null || payload.success !== true) {
    const message =
      payload !== null && payload.success === false
        ? payload.error.message
        : `API request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload.data;
}

// 这三个 fetcher 在同一请求内会被多次调用（根 layout、(public) layout、页面本体），
// 用 cache() 去重可以消除重复的 API 往返。
export const getPublicSettings = cache(async (): Promise<PublicSettingsDto> => {
  try {
    return await getApiData<PublicSettingsDto>("/api/public/settings");
  } catch {
    return {
      blogTitle: DEFAULT_BLOG_TITLE,
      blogDescription: DEFAULT_BLOG_DESCRIPTION,
    };
  }
});

export function getArticleIndexPageData(
  page: number,
  pageSize: number,
  query?: string,
  filters?: { category?: string; tag?: string }
) {
  const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  if (query) params.set("q", query);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.tag) params.set("tag", filters.tag);
  return getApiData<PaginatedResult<PostSummary>>(`/api/public/article-index?${params.toString()}`);
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

interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string | null;
}

interface CollectionArchiveData extends TaxonomyArchiveListing {
  project: ProjectSummary | null;
}

export function getCollectionPageData(projectSlug: string, page: number, pageSize: number) {
  return getApiData<CollectionArchiveData>(`/api/public/collections/${encodeURIComponent(projectSlug)}?page=${page}&limit=${pageSize}`);
}

export interface HomeWallpaperDto {
  id: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
}

/**
 * 首页壁纸轮换（仅启用项，按轮换顺序）。可降级：拿不到时首页回退到
 * 代码里的默认壁纸列表。
 */
export const getHomeWallpapers = cache(async (): Promise<HomeWallpaperDto[]> => {
  try {
    return await getApiData<HomeWallpaperDto[]>("/api/wallpapers");
  } catch {
    return [];
  }
});

/** /articles 列表页的筛选下拉数据。可降级：分类/标签拿不到时筛选框隐藏。 */
export const getPublicCategories = cache(async (): Promise<TaxonomyDto[]> => {
  try {
    return await getApiData<TaxonomyDto[]>("/api/categories");
  } catch {
    return [];
  }
});

export const getPublicTags = cache(async (): Promise<TaxonomyDto[]> => {
  try {
    return await getApiData<TaxonomyDto[]>("/api/tags");
  } catch {
    return [];
  }
});

/**
 * 侧边栏数据被 6 个公开路由使用。它必须可降级：页面现在可以在构建期预渲染，
 * 而构建期（以及 CI）通常没有运行 API。若这里抛错，整站构建会直接失败；
 * 即使构建成功，API 短暂抖动也会让所有带侧边栏的页面变成 500。
 * 返回空侧边栏后，ISR 会在下一个 revalidate 周期自动补上真实数据。
 */
/**
 * 同一路径在每个进程内只提示一次。
 *
 * 构建期会并行预渲染多个页面，API 不可用时每个页面都会命同一条降级分支；
 * 之前每次都打印完整错误对象（含堆栈），构建日志里会出现多条重复的堆栈，
 * 掩盖真正有用的信息。降级本身是设计行为，一句话说明就够了。
 */
const warnedDegradedPaths = new Set<string>();

function warnDegradedOnce(path: string, error: unknown) {
  if (warnedDegradedPaths.has(path)) return;
  warnedDegradedPaths.add(path);
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[public-api] ${path} 不可用（${reason}），已降级为默认内容。`);
}

export const getContentLayoutData = cache(async (): Promise<ContentLayoutDataDto> => {
  try {
    return await getApiData<ContentLayoutDataDto>("/api/public/layout");
  } catch (error) {
    warnDegradedOnce("/api/public/layout", error);
    return {
      tags: [],
      recentPosts: [],
      settings: {
        blogTitle: DEFAULT_BLOG_TITLE,
        blogDescription: DEFAULT_BLOG_DESCRIPTION,
      },
    };
  }
});

/**
 * 个人资料（/about、/now 与页脚共用）。
 *
 * 原先这些页面直接读 apps/web/src/config/profile.ts —— 一个代码文件，
 * 改一句简介就要重新构建并重启。现在与博客标题一致，由后台编辑。
 *
 * 未填写任何内容时返回空资料，页面据此渲染空状态。
 */
const EMPTY_PROFILE: ProfileDto = {
  name: "",
  headline: "",
  bio: "",
  location: "",
  avatar: "",
  email: "",
  now: "",
  socialLinks: [],
};

export const getProfile = cache(async (): Promise<ProfileDto> => {
  try {
    return await getApiData<ProfileDto>("/api/public/profile");
  } catch (error) {
    warnDegradedOnce("/api/public/profile", error);
    return { ...EMPTY_PROFILE };
  }
});

/** 项目页（/projects）：项目卡片（已发布计数 + 最近更新），按最近更新倒序。 */
export const getProjectsData = cache(async (): Promise<ProjectsPageData> => {
  try {
    return await getApiData<ProjectsPageData>("/api/public/collections");
  } catch (error) {
    warnDegradedOnce("/api/public/collections", error);
    return { projects: [] };
  }
});

export async function getHomePageData(): Promise<HomePageData> {  try {
    return await getApiData<HomePageData>("/api/public/home");
  } catch {
    return { recentPosts: [], categories: [], tags: [] };
  }
}

export const getArticleAdjacentData = cache((slug: string) =>
  getApiData<ArticleAdjacent | null>(
    `/api/public/articles/${encodeURIComponent(slug)}/adjacent`
  )
);

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
    return { email: false };
  }
}
