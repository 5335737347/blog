import type { Prisma } from "@prisma/client";
import type { PostDetail, PostSummary } from "@kpblog/contracts";

export const postSummarySelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  tags: {
    select: { tag: { select: { name: true, slug: true } } },
  },
} satisfies Prisma.PostSelect;

export const postDetailSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  content: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
  category: { select: { name: true, slug: true } },
  tags: {
    select: { tag: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.PostSelect;

const postMutationInclude = {
  category: { select: { name: true, slug: true } },
  tags: {
    include: { tag: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.PostInclude;

export const postMutationArgs = {
  include: postMutationInclude,
} satisfies Pick<Prisma.PostDefaultArgs, "include">;

type PostSummaryRecord = Prisma.PostGetPayload<{ select: typeof postSummarySelect }>;
type PostDetailRecord = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>;
type PostMutationRecord = Prisma.PostGetPayload<typeof postMutationArgs>;

export function toPostSummaryDto(post: PostSummaryRecord): PostSummary {
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    tags: post.tags.map((t) => t.tag),
  };
}

export function toPostDetailDto(post: PostDetailRecord | PostMutationRecord): PostDetail {
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    tags: post.tags.map((t) => t.tag),
  };
}

export type PostSummaryDto = ReturnType<typeof toPostSummaryDto>;
export type PostDetailDto = ReturnType<typeof toPostDetailDto>;
