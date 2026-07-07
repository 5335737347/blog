import { slugify, autoExcerpt } from "@/lib/utils";

export interface MarkdownFrontmatter {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string;
  category?: string;
  tags: string[];
  published?: boolean;
  date?: string;
}

export interface ParsedMarkdownDocument {
  frontmatter: MarkdownFrontmatter;
  content: string;
  title: string;
  slug: string;
  excerpt: string;
}

type FrontmatterValue = string | string[] | boolean;

export function normalizeMarkdown(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [stripQuotes(trimmed)].filter(Boolean);
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseInlineList(trimmed);
  }
  return stripQuotes(trimmed);
}

function parseFrontmatterBlock(block: string): Record<string, FrontmatterValue> {
  const data: Record<string, FrontmatterValue> = {};
  const lines = block.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const value = match[2];
    if (value.trim()) {
      data[key] = parseScalar(value);
      continue;
    }

    const list: string[] = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const itemMatch = next.match(/^\s*-\s+(.+)$/);
      if (!itemMatch) break;
      list.push(stripQuotes(itemMatch[1]));
      index += 1;
    }
    if (list.length > 0) {
      data[key] = list;
    }
  }

  return data;
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, FrontmatterValue>; content: string } {
  const normalized = normalizeMarkdown(raw);
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { frontmatter: {}, content: normalized.trim() };
  }
  return {
    frontmatter: parseFrontmatterBlock(match[1]),
    content: normalized.slice(match[0].length).trim(),
  };
}

function asString(value: FrontmatterValue | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function asStringArray(value: FrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return parseInlineList(value);
  return [];
}

function asBoolean(value: FrontmatterValue | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function titleFromContent(content: string): string | undefined {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.\w+$/i, "").replace(/[-_]/g, " ").trim();
}

export function parseMarkdownDocument(raw: string, filename = "untitled.md"): ParsedMarkdownDocument {
  const { frontmatter: rawFrontmatter, content } = splitFrontmatter(raw);
  const frontmatter: MarkdownFrontmatter = {
    title: asString(rawFrontmatter.title),
    slug: asString(rawFrontmatter.slug),
    excerpt: asString(rawFrontmatter.excerpt),
    coverImage: asString(rawFrontmatter.coverImage) || asString(rawFrontmatter.cover_image),
    category: asString(rawFrontmatter.category),
    tags: asStringArray(rawFrontmatter.tags),
    published: asBoolean(rawFrontmatter.published),
    date: asString(rawFrontmatter.date),
  };

  const title = frontmatter.title || titleFromContent(content) || titleFromFilename(filename);
  const slug = frontmatter.slug ? slugify(frontmatter.slug) : slugify(title);
  const excerpt = frontmatter.excerpt || autoExcerpt(content);

  return {
    frontmatter,
    content,
    title,
    slug,
    excerpt,
  };
}

export function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
