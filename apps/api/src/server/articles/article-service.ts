import type { Prisma } from "@prisma/client";
import { prisma, cleanOrphanTags } from "@/lib/prisma";
import { autoExcerpt, extractHashTags, slugify } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import {
  postDetailSelect,
  postMutationArgs,
  postSummarySelect,
  toPostDetailDto,
  toPostSummaryDto,
} from "./article-dto";

export interface ListArticlesOptions {
  page: number;
  pageSize: number;
  tag?: string | null;
  category?: string | null;
  query?: string | null;
  published?: string | null;
  isAdmin: boolean;
}

export interface ArticleMutationInput {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  content?: unknown;
  coverImage?: unknown;
  published?: unknown;
  categoryId?: unknown;
  tagIds?: unknown;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return trimmedString(value);
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function resolveTags(tagNames: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of tagNames) {
    const s = slugify(name);
    const tag = await prisma.tag.upsert({
      where: { slug: s },
      update: {},
      create: { name, slug: s },
    });
    ids.push(tag.id);
  }
  return ids;
}

function buildArticleWhere(options: ListArticlesOptions): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {};

  if (!options.isAdmin) {
    where.published = true;
  } else if (options.published === "all") {
    // Admin wants all posts.
  } else if (options.published === "draft") {
    where.published = false;
  } else {
    where.published = true;
  }

  if (options.tag) {
    where.tags = { some: { tag: { slug: options.tag } } };
  }
  if (options.category) {
    where.category = { slug: options.category };
  }
  const query = options.query?.trim();
  if (query) {
    where.OR = [
      { title: { contains: query } },
      { excerpt: { contains: query } },
      { content: { contains: query } },
    ];
  }

  return where;
}

export async function listArticles(options: ListArticlesOptions) {
  const where = buildArticleWhere(options);
  const [articles, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: postSummarySelect,
    }),
    prisma.post.count({ where }),
  ]);

  return {
    items: articles.map(toPostSummaryDto),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
  };
}

export async function createArticle(input: ArticleMutationInput) {
  const title = trimmedString(input.title);
  const content = trimmedString(input.content);
  if (!title || !content) {
    throw badRequest("标题和内容不能为空");
  }
  if (title.length > 200 || content.length > 1_000_000) {
    throw badRequest("标题不能超过 200 字，正文不能超过 100 万字");
  }

  const slugInput = trimmedString(input.slug);
  const finalSlug = slugInput || slugify(title);
  const existing = await prisma.post.findUnique({ where: { slug: finalSlug } });
  if (existing) {
    throw badRequest("slug 已存在，请修改");
  }

  const autoTags = extractHashTags(content);
  const allTagIds = [
    ...new Set([...stringArray(input.tagIds), ...(await resolveTags(autoTags))]),
  ];
  const published = booleanValue(input.published) ?? false;
  const excerpt = optionalText(input.excerpt);
  const coverImage = optionalText(input.coverImage);
  const categoryId = optionalText(input.categoryId);

  const post = await prisma.post.create({
    data: {
      title,
      slug: finalSlug,
      excerpt: excerpt || autoExcerpt(content) || null,
      content,
      coverImage: coverImage || null,
      published,
      publishedAt: published ? new Date() : null,
      categoryId: categoryId || null,
      tags: allTagIds.length
        ? { create: allTagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: postMutationArgs.include,
  });

  return toPostDetailDto(post);
}

export async function getArticleById(id: string, options: { isAdmin: boolean }) {
  const post = await prisma.post.findUnique({
    where: { id },
    select: postDetailSelect,
  });

  if (!post || (!post.published && !options.isAdmin)) {
    throw notFound("文章不存在");
  }

  return toPostDetailDto(post);
}

export async function getPublicArticleBySlug(slug: string) {
  const post = await prisma.post.findUnique({
    where: { slug, published: true },
    select: postDetailSelect,
  });

  return post ? toPostDetailDto(post) : null;
}

export async function updateArticle(id: string, input: ArticleMutationInput) {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("文章不存在");
  }

  const slugInput = trimmedString(input.slug);
  if (slugInput) {
    const slugConflict = await prisma.post.findFirst({
      where: { slug: slugInput, id: { not: id } },
    });
    if (slugConflict) {
      throw badRequest("slug 已存在");
    }
  }

  const title = trimmedString(input.title);
  const content = trimmedString(input.content);
  const published = booleanValue(input.published);

  if (input.title !== undefined && !title) {
    throw badRequest("标题不能为空");
  }
  if (input.content !== undefined && !content) {
    throw badRequest("内容不能为空");
  }
  if (title && title.length > 200) {
    throw badRequest("标题不能超过 200 个字符");
  }
  if (content && content.length > 1_000_000) {
    throw badRequest("正文不能超过 100 万个字符");
  }

  let publishedAt = existing.publishedAt;
  if (published && !existing.published) {
    publishedAt = new Date();
  } else if (published === false) {
    publishedAt = null;
  }

  const finalSlug = slugInput || slugify(title || existing.title);
  const slugConflict = await prisma.post.findFirst({
    where: { slug: finalSlug, id: { not: id } },
  });
  if (slugConflict) {
    throw badRequest("slug 已存在");
  }

  const data: Prisma.PostUpdateArgs["data"] = { slug: finalSlug };
  if (input.title !== undefined) data.title = title;
  if (input.excerpt !== undefined || input.content !== undefined) {
    const excerpt = optionalText(input.excerpt);
    data.excerpt = excerpt || (content ? autoExcerpt(content) : existing.excerpt);
  }
  if (input.content !== undefined) {
    data.content = content;
  }
  if (input.coverImage !== undefined) {
    const coverImage = optionalText(input.coverImage);
    data.coverImage = coverImage || null;
  }
  if (published !== undefined) {
    data.published = published;
    data.publishedAt = publishedAt;
  }

  if (input.content !== undefined || input.tagIds !== undefined) {
    const autoTags = content ? extractHashTags(content) : [];
    const autoTagIds = await resolveTags(autoTags);
    const allTagIds = [...new Set([...stringArray(input.tagIds), ...autoTagIds])];
    data.tags = {
      deleteMany: {},
      create: allTagIds.map((tagId) => ({ tagId })),
    };
  }

  if (input.categoryId !== undefined) {
    const categoryId = optionalText(input.categoryId);
    data.category = categoryId
      ? { connect: { id: categoryId } }
      : { disconnect: true };
  }

  const post = await prisma.post.update({
    where: { id },
    data,
    include: postMutationArgs.include,
  });

  if (input.content !== undefined || input.tagIds !== undefined) {
    await cleanOrphanTags();
  }

  return toPostDetailDto(post);
}

export async function deleteArticle(id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw notFound("文章不存在");
  }

  await prisma.post.delete({ where: { id } });
  await cleanOrphanTags();
  return { deleted: true };
}
