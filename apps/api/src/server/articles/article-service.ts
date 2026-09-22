import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoExcerpt, extractHashTags, isSafeImageReference, slugify } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import {
  postDetailSelect,
  postMutationArgs,
  postSummarySelect,
  toPostDetailDto,
  toPostSummaryDto,
} from "./article-dto";
import { POST_ORDER_DESC } from "./article-order";
import { resolveTagIds } from "@/server/taxonomy/taxonomy-service";

export interface ListArticlesOptions {
  page: number;
  pageSize: number;
  tag?: string | null;
  category?: string | null;
  project?: string | null;
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
  /** 可选发布日期（ISO 字符串）。用于回填旧文章，见 parsePublishedAt。 */
  publishedAt?: unknown;
  categoryId?: unknown;
  projectId?: unknown;
  tagIds?: unknown;
}

/**
 * 解析可选的发布日期。
 *
 * 之前只有 CLI 发布（frontmatter 的 `date:`）能指定日期，后台编辑器恒为
 * 「保存那一刻」。结果是：通过后台回填的旧文章全部落在今年，归档按年份分组
 * 失真、文章列表排序也错乱。
 *
 * 语义：
 *   undefined → 未提供，保持原有行为（发布时取当前时间）
 *   null / "" → 显式清空
 *   合法日期串 → 使用该日期
 */
function parsePublishedAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = trimmedString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("发布日期格式不正确");
  }
  return date;
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
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw badRequest("标签数据格式不正确");
  }
  const values = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
  if (values.length > 50) throw badRequest("单篇文章最多选择 50 个标签");
  return values;
}

async function assertProjectReference(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw badRequest("项目不存在");
}

async function assertTaxonomyReferences(categoryId: string | null, tagIds: string[]) {
  const [category, tagCount] = await Promise.all([
    categoryId
      ? prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
      : Promise.resolve(null),
    tagIds.length
      ? prisma.tag.count({ where: { id: { in: tagIds } } })
      : Promise.resolve(0),
  ]);
  if (categoryId && !category) throw badRequest("分类不存在");
  if (tagCount !== tagIds.length) throw badRequest("包含不存在的标签");
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
  if (options.project) {
    where.project = { slug: options.project };
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
      orderBy: POST_ORDER_DESC,
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
  const finalSlug = slugify(slugInput || title);
  const existing = await prisma.post.findUnique({ where: { slug: finalSlug } });
  if (existing) {
    throw badRequest("slug 已存在，请修改");
  }

  const explicitTagIds = stringArray(input.tagIds);
  const categoryId = optionalText(input.categoryId) || null;
  await assertTaxonomyReferences(categoryId, explicitTagIds);
  const projectId = optionalText(input.projectId) || null;
  if (projectId) await assertProjectReference(projectId);

  const autoTags = extractHashTags(content);
  const allTagIds = [
    ...new Set([...explicitTagIds, ...(await resolveTagIds(autoTags))]),
  ];
  if (allTagIds.length > 50) {
    throw badRequest("单篇文章最多关联 50 个标签");
  }
  const published = booleanValue(input.published) ?? false;
  const requestedPublishedAt = parsePublishedAt(input.publishedAt);
  const excerpt = optionalText(input.excerpt);
  const coverImage = optionalText(input.coverImage);
  if (excerpt && excerpt.length > 500) throw badRequest("摘要不能超过 500 个字符");
  if (coverImage && coverImage.length > 2048) throw badRequest("封面图 URL 过长");
  if (coverImage && !isSafeImageReference(coverImage)) {
    throw badRequest("封面图地址仅支持 http(s) 或站内相对路径");
  }

  try {
    const post = await prisma.post.create({
      data: {
        title,
        slug: finalSlug,
        excerpt: excerpt || autoExcerpt(content) || null,
        content,
        coverImage: coverImage || null,
        published,
        publishedAt: published ? (requestedPublishedAt ?? new Date()) : null,
        categoryId,
        projectId,
        tags: allTagIds.length
          ? { create: allTagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: postMutationArgs.include,
    });
    return toPostDetailDto(post);
  } catch (error) {
    // 预检与 INSERT 之间的并发窗口由唯一约束兜底；翻译成 400，别报 500。
    if ((error as { code?: string }).code === "P2002") {
      throw badRequest("slug 已存在，请修改");
    }
    throw error;
  }
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
  const existing = await prisma.post.findUnique({
    where: { id },
    // 需要已有的标签 id：只改正文时不能把它们清掉。
    include: { tags: { select: { tagId: true } } },
  });
  if (!existing) {
    throw notFound("文章不存在");
  }

  const slugInput = trimmedString(input.slug);

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

  // 显式传入的日期优先级最高，其次是「由草稿转为发布」取当前时间。
  const requestedPublishedAt = parsePublishedAt(input.publishedAt);
  let publishedAt = existing.publishedAt;
  if (requestedPublishedAt !== undefined) {
    publishedAt = requestedPublishedAt;
  } else if (published && !existing.published) {
    publishedAt = new Date();
  } else if (published === false) {
    publishedAt = null;
  }

  // slug 只在显式传入时才变化。此前是 `slugify(slugInput || title || existing.title)`，
  // 于是「只改正文/封面」也会用标题重算出新 slug，把文章 URL 换掉、断掉所有已有链接
  // 与外链。未提供 slug 时必须沿用 existing.slug。
  const finalSlug = slugInput ? slugify(slugInput) : existing.slug;
  if (!finalSlug) {
    throw badRequest("slug 不能为空");
  }
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
    if (excerpt && excerpt.length > 500) throw badRequest("摘要不能超过 500 个字符");
    data.excerpt = excerpt || (content ? autoExcerpt(content) : existing.excerpt);
  }
  if (input.content !== undefined) {
    data.content = content;
  }
  if (input.coverImage !== undefined) {
    const coverImage = optionalText(input.coverImage);
    if (coverImage && coverImage.length > 2048) throw badRequest("封面图 URL 过长");
    if (coverImage && !isSafeImageReference(coverImage)) {
      throw badRequest("封面图地址仅支持 http(s) 或站内相对路径");
    }
    data.coverImage = coverImage || null;
  }
  if (published !== undefined) {
    data.published = published;
  }
  if (published !== undefined || input.publishedAt !== undefined) {
    data.publishedAt = publishedAt;
  }

  if (input.content !== undefined || input.tagIds !== undefined) {
    // tagIds 未显式提供时必须沿用文章已有标签。
    // 之前 stringArray(undefined) 返回空数组，于是「只改正文」会把手工挑选的标签
    // 连同自动标签一起替换掉，造成静默的数据丢失。
    const explicitTagIds =
      input.tagIds !== undefined
        ? stringArray(input.tagIds)
        : existing.tags.map((item) => item.tagId);
    if (input.tagIds !== undefined) {
      await assertTaxonomyReferences(null, explicitTagIds);
    }
    const autoTagIds = content ? await resolveTagIds(extractHashTags(content)) : [];
    const allTagIds = [...new Set([...explicitTagIds, ...autoTagIds])];
    if (allTagIds.length > 50) {
      throw badRequest("单篇文章最多关联 50 个标签");
    }
    data.tags = {
      deleteMany: {},
      create: allTagIds.map((tagId) => ({ tagId })),
    };
  }

  if (input.categoryId !== undefined) {
    const categoryId = optionalText(input.categoryId);
    await assertTaxonomyReferences(categoryId || null, []);
    data.category = categoryId
      ? { connect: { id: categoryId } }
      : { disconnect: true };
  }

  if (input.projectId !== undefined) {
    const projectId = optionalText(input.projectId);
    if (projectId) await assertProjectReference(projectId);
    data.project = projectId
      ? { connect: { id: projectId } }
      : { disconnect: true };
  }

  try {
    const post = await prisma.post.update({
      where: { id },
      data,
      include: postMutationArgs.include,
    });
    return toPostDetailDto(post);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") throw badRequest("slug 已存在");
    if (code === "P2025") throw notFound("文章不存在");
    throw error;
  }
}

export async function deleteArticle(id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw notFound("文章不存在");
  }

  await prisma.post.delete({ where: { id } });
  return { deleted: true };
}
