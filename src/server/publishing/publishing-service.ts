import { prisma } from "@/lib/prisma";
import { normalizeMarkdown, parseMarkdownDocument, parseOptionalDate } from "@/lib/content";
import { autoExcerpt, extractHashTags, slugify } from "@/lib/utils";
import { badRequest, ServiceError } from "@/server/errors";
import mammoth from "mammoth";

type MammothWithMarkdown = typeof mammoth & {
  convertToMarkdown(input: { buffer: Buffer }): Promise<{ value: string }>;
};

export interface ImportResult {
  success: boolean;
  title: string;
  id?: string;
  slug?: string;
  source?: string;
  error?: string;
}

export interface PublishInput {
  title?: unknown;
  content?: unknown;
  slug?: unknown;
  tags?: unknown;
  excerpt?: unknown;
  coverImage?: unknown;
  category?: unknown;
  published?: unknown;
  date?: unknown;
}

interface CreatePostFromMarkdownInput {
  raw: string;
  filename: string;
  title?: string;
  slug?: string;
  tags?: string[];
  excerpt?: string;
  coverImage?: string;
  category?: string;
  publishedDefault: boolean;
  publishedOverride?: boolean;
  date?: string;
  fallbackToRawContent: boolean;
  duplicateSlugMessage?: (slug: string) => string;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function resolveTagConnects(tagNames: string[]) {
  const tagConnects = [];
  for (const name of tagNames) {
    const tagSlug = slugify(name);
    const tag = await prisma.tag.upsert({
      where: { slug: tagSlug },
      update: {},
      create: { name, slug: tagSlug },
    });
    tagConnects.push({ tagId: tag.id });
  }
  return tagConnects;
}

async function resolveCategory(categoryName: string | undefined) {
  if (!categoryName) return null;
  return prisma.category.upsert({
    where: { slug: slugify(categoryName) },
    update: {},
    create: {
      name: categoryName,
      slug: slugify(categoryName),
    },
  });
}

async function createPostFromMarkdown(input: CreatePostFromMarkdownInput) {
  const parsed = parseMarkdownDocument(input.raw, input.filename);
  const title = input.title || parsed.title;
  const slug = input.slug ? slugify(input.slug) : parsed.slug;
  const content = parsed.content.trim() || (input.fallbackToRawContent ? input.raw.trim() : "");

  if (!title || !content) {
    throw badRequest("标题和内容不能为空");
  }

  const existing = await prisma.post.findUnique({ where: { slug } });
  if (existing) {
    throw new ServiceError(
      input.duplicateSlugMessage?.(slug) ?? `slug "${slug}" 已存在`,
      409,
      "CONFLICT"
    );
  }

  const autoTags = extractHashTags(content);
  const allTags = [
    ...new Set([...(input.tags || []), ...parsed.frontmatter.tags, ...autoTags]),
  ];
  const tagConnects = await resolveTagConnects(allTags);
  const category = await resolveCategory(input.category || parsed.frontmatter.category);
  const published =
    input.publishedOverride ?? parsed.frontmatter.published ?? input.publishedDefault;
  const publishedAt = published
    ? parseOptionalDate(input.date || parsed.frontmatter.date) || new Date()
    : null;

  const post = await prisma.post.create({
    data: {
      title,
      slug,
      content,
      excerpt: input.excerpt || parsed.frontmatter.excerpt || autoExcerpt(content) || null,
      coverImage: input.coverImage || parsed.frontmatter.coverImage || null,
      published,
      publishedAt,
      categoryId: category?.id,
      tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
    },
  });

  return post;
}

async function fileToMarkdown(file: File): Promise<{ raw: string; ext: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (ext === "docx") {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await (mammoth as MammothWithMarkdown).convertToMarkdown({ buffer: buf });
    if (!result.value.trim()) {
      throw badRequest("文档为空");
    }
    return { raw: result.value, ext };
  }

  if (["md", "html", "htm", "txt"].includes(ext)) {
    return { raw: await file.text(), ext };
  }

  throw badRequest(`不支持的文件类型 .${ext}`);
}

export async function importFiles(files: File[]) {
  const results: ImportResult[] = [];

  for (const file of files) {
    try {
      const { raw, ext } = await fileToMarkdown(file);
      const normalized = normalizeMarkdown(raw);
      const markdown =
        ext === "txt"
          ? normalized.replace(/</g, "&lt;").replace(/>/g, "&gt;")
          : normalized;
      const parsed = parseMarkdownDocument(markdown, file.name);
      const content = parsed.content.trim() || markdown.trim();

      if (!content) {
        results.push({ success: false, title: parsed.title, error: "文档内容为空" });
        continue;
      }

      const post = await createPostFromMarkdown({
        raw: markdown,
        filename: file.name,
        publishedDefault: false,
        fallbackToRawContent: true,
        duplicateSlugMessage: (slug) => `"${slug}" 已存在`,
      });

      results.push({
        success: true,
        title: post.title,
        id: post.id,
        slug: post.slug,
        source: ext,
      });
    } catch (error) {
      const title = file.name;
      results.push({
        success: false,
        title,
        error: error instanceof ServiceError ? error.message : "解析失败",
      });
    }
  }

  const imported = results.filter((result) => result.success).length;
  const failed = results.length - imported;
  return { imported, failed, results };
}

export async function publishMarkdown(input: PublishInput) {
  const content = trimmedString(input.content);
  if (!content) {
    throw badRequest("内容不能为空");
  }

  const post = await createPostFromMarkdown({
    raw: content,
    filename: trimmedString(input.title) || "untitled.md",
    title: trimmedString(input.title),
    slug: trimmedString(input.slug),
    tags: stringArray(input.tags),
    excerpt: trimmedString(input.excerpt),
    coverImage: trimmedString(input.coverImage),
    category: trimmedString(input.category),
    publishedDefault: true,
    publishedOverride: booleanValue(input.published),
    date: trimmedString(input.date),
    fallbackToRawContent: false,
  });

  return {
    post: {
      id: post.id,
      slug: post.slug,
      title: post.title,
      published: post.published,
      url: `${process.env.SITE_URL || "http://localhost:3000"}/articles/${post.slug}`,
    },
  };
}
