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

export interface CommentWithReplies {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  replies?: CommentWithReplies[];
}

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
