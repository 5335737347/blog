export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
}

export interface PostDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  content: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
}

export interface CommentWithReplies {
  id: string;
  author: string;
  email: string | null;
  content: string;
  createdAt: string;
  replies: CommentWithReplies[];
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
