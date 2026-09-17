import { prisma } from "@/lib/prisma";
import { normalizeMarkdown, parseMarkdownDocument, parseOptionalDate } from "@/lib/content";
import { autoExcerpt, extractHashTags, slugify } from "@/lib/utils";
import { badRequest, ServiceError } from "@/server/errors";
import { resolveTagIds } from "@/server/taxonomy/taxonomy-service";
import mammoth from "mammoth";

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ARTICLE_CONTENT_LENGTH = 1_000_000;

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

/**
 * 解析 frontmatter / 导入参数里的分类。
 *
 * `name` 与 `slug` 都是唯一字段，且可能各自指向不同记录：
 * 分类先由后台按中文名建立时，它的 slug 与按名字 slugify 的结果并不一致。
 * 所以先按 slug 查（同 slug 改名），再按 name 查（同名不同 slug），最后才新建。
 *
 * 原先直接 `upsert({ where: { slug }, create: { name } })`：当已存在
 * `{ name: "技术", slug: "tech" }` 而 frontmatter 写 `category: 技术` 时，
 * 会往 create 分支写入重复的 name，撞 `Category.name` 唯一约束并让发布 500。
 */
async function resolveCategory(categoryName: string | undefined) {
  if (!categoryName) return null;
  const slug = slugify(categoryName);

  const bySlug = await prisma.category.findUnique({ where: { slug } });
  if (bySlug) {
    if (bySlug.name === categoryName) return bySlug;
    return prisma.category.update({ where: { id: bySlug.id }, data: { name: categoryName } });
  }

  const byName = await prisma.category.findUnique({ where: { name: categoryName } });
  if (byName) return byName;

  return prisma.category.create({ data: { name: categoryName, slug } });
}

async function createPostFromMarkdown(input: CreatePostFromMarkdownInput) {
  const parsed = parseMarkdownDocument(input.raw, input.filename);
  const title = input.title || parsed.title;
  const slug = input.slug ? slugify(input.slug) : parsed.slug;
  const content = parsed.content.trim() || (input.fallbackToRawContent ? input.raw.trim() : "");

  if (!title || !content) {
    throw badRequest("标题和内容不能为空");
  }
  if (title.length > 200 || content.length > MAX_ARTICLE_CONTENT_LENGTH) {
    throw badRequest("标题不能超过 200 字，正文不能超过 100 万字");
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
  // 按名字的 Set 只做粗略去重；真正保证唯一性的是 resolveTagIds 内部的 slug 去重。
  const allTags = [
    ...new Set([...(input.tags || []), ...parsed.frontmatter.tags, ...autoTags]),
  ];
  const tagConnects = (await resolveTagIds(allTags)).map((tagId) => ({ tagId }));
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
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw badRequest("单个导入文件不能超过 10MB");
  }
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
      url: `${process.env.SITE_URL || "http://localhost:3001"}/articles/${post.slug}`,
    },
  };
}
