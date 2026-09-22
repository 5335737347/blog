export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  checks: { database: "ok" | "error" };
}

export interface PublicSettingsDto {
  blogTitle: string;
  blogDescription: string;
}

export interface RegistrationCapabilities {
  email: boolean;
}

export interface MediaImageDto {
  id: string;
  /** 当前取值为 cover / article；服务层会拒绝其它值。 */
  kind: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface MusicTrackDto {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  createdAt: string;
}

export interface HomeWallpaperDto {
  id: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
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

export interface ProjectDetailData {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string | null;
}

export interface TaxonomySummary {
  name: string;
  slug: string;
}

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: TaxonomySummary | null;
  tags: TaxonomySummary[];
}

export interface PostDetail extends PostSummary {
  content: string;
  published: boolean;
}

/**
 * 一条已审核通过的评论，以及它已审核通过的回复（仅一级）。
 *
 * 留言板复用同一结构：留言板没有所属文章，因此响应里不含 postId。
 */
export interface CommentWithReplies {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  replies?: CommentWithReplies[];
}

/** 留言板条目与文章评论结构相同，单独命名只为调用点更易读。 */
export type GuestbookEntry = CommentWithReplies;

/**
 * 公开评论 / 留言列表的分页响应。
 *
 * 顶层评论分页返回，每条评论自带它已审核通过的回复（回复不分页）。
 * 与文章列表共用 `PaginatedResult`，前端只需一套分页处理逻辑。
 */
export type CommentThreadPage = PaginatedResult<CommentWithReplies>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TaxonomyWithCount {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface TagArchiveData {
  tag: TaxonomyWithCount | null;
  articles: PaginatedResult<PostSummary>;
}

export interface CategoryArchiveData {
  category: TaxonomyWithCount | null;
  articles: PaginatedResult<PostSummary>;
}

export interface CollectionArchiveData {
  project: ProjectDetailData | null;
  articles: PaginatedResult<PostSummary>;
}

export interface ArticleAdjacent {
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  related: PostSummary[];
}

export interface HomePageData {
  recentPosts: PostSummary[];
  categories: TaxonomyWithCount[];
  tags: TaxonomyWithCount[];
}

/**
 * 项目页（/projects）的一个项目卡片。
 * postCount 只计已发布文章；latestPublishedAt 用于「按最近更新排序」。
 */
export interface ProjectCardData {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string | null;
  postCount: number;
  latestPublishedAt: string | null;
}

export interface ProjectsPageData {
  projects: ProjectCardData[];
}

/** 社交链接（个人介绍页与页脚共用）。 */
export interface ProfileSocialLink {
  label: string;
  href: string;
}

/**
 * 站点所有者的个人资料。
 *
 * 由 /admin/settings 编辑，公开面（/about、/now 与页脚）读取。
 * 所有字段都可能为空字符串 —— 页面负责渲染对应的空状态。
 */
export interface ProfileDto {
  name: string;
  headline: string;
  bio: string;
  location: string;
  avatar: string;
  email: string;
  now: string;
  socialLinks: ProfileSocialLink[];
}
