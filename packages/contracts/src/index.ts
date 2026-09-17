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
  service: "kpblog-api";
  status: "ok";
  version: string;
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

export interface BlogSettings {
  blog_title: string;
  blog_description: string;
}

export interface TaxonomyWithCount {
  id: string;
  name: string;
  slug: string;
  postCount: number;
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

/** 归档页里的一条文章摘要（只保留按时间浏览所需的最小字段）。 */
export interface ArchivePostSummary {
  slug: string;
  title: string;
  publishedAt: string | null;
}

/** 归档按年份分组。年份为 null 表示该文章没有 publishedAt（历史数据）。 */
export interface ArchiveYear {
  year: number | null;
  posts: ArchivePostSummary[];
}

export interface ArchiveData {
  total: number;
  years: ArchiveYear[];
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
