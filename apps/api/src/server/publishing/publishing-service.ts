import { prisma } from "@/lib/prisma";
import { normalizeMarkdown, parseMarkdownDocument, parseOptionalDate } from "@/lib/content";
import { autoExcerpt, extractHashTags, isSafeImageReference, slugify } from "@/lib/utils";
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
  project?: unknown;
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
  project?: string;
  publishedDefault: boolean;
  /** true（API 发布）＝同 slug 覆盖更新；false（导入）＝冲突报错，保护已发布内容。 */
  updateExisting?: boolean;
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
  const items = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const unique = [...new Set(items)];
  if (unique.length > 50) {
    throw badRequest("单篇文章最多选择 50 个标签");
  }
  return unique;
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

/**
 * 解析 frontmatter / 发布参数里的项目。
 *
 * 与分类不同：项目是「少量、刻意维护」的工作单元，且刚建立时往往只有
 * 后台建好的几个——静默自动创建会让拼写错误悄悄出现在 /projects 页。
 * 所以只做匹配（先名后 slug），不存在直接报错，让发布者当场纠正。
 */
async function resolveProject(projectName: string | undefined) {
  if (!projectName) return null;

  const byName = await prisma.project.findUnique({ where: { name: projectName } });
  if (byName) return byName;
  const bySlug = await prisma.project.findUnique({ where: { slug: slugify(projectName) } });
  if (bySlug) return bySlug;

  throw badRequest(`项目「${projectName}」不存在，请先在后台「项目管理」创建`);
}

/** 发布/导入未指定封面时的内置随机封面池（复用首页壁纸，避免新增静态资源）。 */
const DEFAULT_COVER_POOL = [
  "/images/home/wallpaper-01.webp",
  "/images/home/wallpaper-02.webp",
  "/images/home/wallpaper-03.webp",
  "/images/home/wallpaper-04.webp",
  "/images/home/wallpaper-05.webp",
  "/images/home/wallpaper-06.webp",
  "/images/home/wallpaper-07.webp",
  "/images/home/wallpaper-08.webp",
];

function randomDefaultCover() {
  return DEFAULT_COVER_POOL[Math.floor(Math.random() * DEFAULT_COVER_POOL.length)] as string;
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
  if (existing && !input.updateExisting) {
    throw new ServiceError(
      input.duplicateSlugMessage?.(slug) ?? `slug "${slug}" 已存在`,
      409,
      "CONFLICT"
    );
  }

  const autoTags = extractHashTags(content);
  // 按名字的 Set 只做粗略去重；真正保证唯一性的是 resolveTagIds 内部的 slug 去重。
  const allTags = [
    ...new Set(
      [...(input.tags || []), ...parsed.frontmatter.tags, ...autoTags]
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ];
  if (allTags.length > 50) {
    throw badRequest("单篇文章最多选择 50 个标签");
  }
  const tagConnects = (await resolveTagIds(allTags)).map((tagId) => ({ tagId }));
  const category = await resolveCategory(input.category || parsed.frontmatter.category);
  const project = await resolveProject(input.project || parsed.frontmatter.project);

  // 封面：笔记显式给出 > 已有文章的封面 > 随机内置封面（仅新建时初始化，
  // 覆盖更新不会重新随机——频繁保存不该让封面跳来跳去）。
  const explicitCover = input.coverImage || parsed.frontmatter.coverImage || null;
  if (explicitCover && explicitCover.length > 2048) {
    throw badRequest("封面图 URL 过长");
  }
  if (explicitCover && !isSafeImageReference(explicitCover)) {
    throw badRequest("封面图地址仅支持 http(s) 或站内相对路径");
  }

  const excerpt = input.excerpt || parsed.frontmatter.excerpt || autoExcerpt(content) || null;
  if (excerpt && excerpt.length > 500) {
    throw badRequest("摘要不能超过 500 个字符");
  }

  if (existing) {
    // 覆盖更新（Obsidian「改完再发」工作流）：
    // - 内容派生字段（标题/正文/摘要/标签）跟随笔记；
    // - 结构字段（分类/项目）只在显式提供时改动，缺省保留原值；
    // - 发布状态缺省保留原样，日期缺省保留原发布时间（改错字不应改动归档位置）；
    // - slug 是查找键，永不改变，公开链接稳定。
    const published =
      input.publishedOverride ?? parsed.frontmatter.published ?? existing.published;
    const explicitDate = parseOptionalDate(input.date || parsed.frontmatter.date);
    const publishedAt = published
      ? (explicitDate ?? existing.publishedAt ?? new Date())
      : null;

    const post = await prisma.post.update({
      where: { id: existing.id },
      data: {
        title,
        content,
        excerpt,
        coverImage: explicitCover ?? existing.coverImage,
        published,
        publishedAt,
        ...(category ? { categoryId: category.id } : {}),
        ...(project ? { projectId: project.id } : {}),
        tags: { deleteMany: {}, create: tagConnects },
      },
    });
    return { post, updated: true };
  }

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
      excerpt,
      coverImage: explicitCover ?? randomDefaultCover(),
      published,
      publishedAt,
      categoryId: category?.id,
      projectId: project?.id,
      tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
    },
  });

  return { post, updated: false };
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

      const { post } = await createPostFromMarkdown({
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

  // API 发布走覆盖更新：Obsidian「改完再发」是常态，同 slug 的笔记应当
  // 更新已有文章而不是失败；导入路径（importFiles）保持冲突报错。
  const { post, updated } = await createPostFromMarkdown({
    raw: content,
    filename: trimmedString(input.title) || "untitled.md",
    title: trimmedString(input.title),
    slug: trimmedString(input.slug),
    tags: stringArray(input.tags),
    excerpt: trimmedString(input.excerpt),
    coverImage: trimmedString(input.coverImage),
    category: trimmedString(input.category),
    project: trimmedString(input.project),
    publishedDefault: true,
    publishedOverride: booleanValue(input.published),
    date: trimmedString(input.date),
    fallbackToRawContent: false,
    updateExisting: true,
  });

  return {
    updated,
    post: {
      id: post.id,
      slug: post.slug,
      title: post.title,
      published: post.published,
      url: `${process.env.SITE_URL || "http://localhost:3001"}/articles/${post.slug}`,
    },
  };
}
