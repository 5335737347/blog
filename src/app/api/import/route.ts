import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify, extractHashTags } from "@/lib/utils";
import { normalizeMarkdown, parseMarkdownDocument, parseOptionalDate } from "@/lib/content";
import mammoth from "mammoth";

type MammothWithMarkdown = typeof mammoth & {
  convertToMarkdown(input: { buffer: Buffer }): Promise<{ value: string }>;
};

interface ImportResult {
  success: boolean;
  title: string;
  id?: string;
  slug?: string;
  source?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const results: ImportResult[] = [];

    for (const file of files) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        let raw: string;

        // Convert based on file type
        if (ext === "docx") {
          const buf = Buffer.from(await file.arrayBuffer());
          const result = await (mammoth as MammothWithMarkdown).convertToMarkdown({ buffer: buf });
          raw = result.value;
          if (!raw.trim()) {
            results.push({ success: false, title: file.name, error: "文档为空" });
            continue;
          }
        } else if (["md", "html", "htm", "txt"].includes(ext)) {
          raw = await file.text();
        } else {
          results.push({ success: false, title: file.name, error: `不支持的文件类型 .${ext}` });
          continue;
        }

        raw = normalizeMarkdown(raw);

        // For plain text, wrap in markdown-friendly format
        if (ext === "txt") {
          raw = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        const parsed = parseMarkdownDocument(raw, file.name);
        const title = parsed.title;
        const slug = parsed.slug;
        const content = parsed.content.trim() || raw.trim();
        const excerpt = parsed.excerpt;
        const published = parsed.frontmatter.published ?? false;
        const publishedAt = published ? parseOptionalDate(parsed.frontmatter.date) || new Date() : null;
        const coverImage = parsed.frontmatter.coverImage || null;

        if (!content) {
          results.push({ success: false, title, error: "文档内容为空" });
          continue;
        }

        // Check slug
        const existing = await prisma.post.findUnique({ where: { slug } });
        if (existing) {
          results.push({ success: false, title, error: `"${slug}" 已存在` });
          continue;
        }

        // Merge tags + auto-detected
        const autoTags = extractHashTags(content);
        const allTags = [...new Set([...parsed.frontmatter.tags, ...autoTags])];

        const tagConnects = [];
        for (const tagName of allTags) {
          const tagSlug = slugify(tagName);
          const tag = await prisma.tag.upsert({
            where: { slug: tagSlug },
            update: {},
            create: { name: tagName, slug: tagSlug },
          });
          tagConnects.push({ tagId: tag.id });
        }

        const category = parsed.frontmatter.category
          ? await prisma.category.upsert({
              where: { slug: slugify(parsed.frontmatter.category) },
              update: {},
              create: {
                name: parsed.frontmatter.category,
                slug: slugify(parsed.frontmatter.category),
              },
            })
          : null;

        const post = await prisma.post.create({
          data: {
            title,
            slug,
            content,
            excerpt,
            coverImage,
            published,
            publishedAt,
            categoryId: category?.id,
            tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
          },
        });

        results.push({ success: true, title, id: post.id, slug, source: ext });
      } catch {
        results.push({ success: false, title: file.name, error: "解析失败" });
      }
    }

    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    return NextResponse.json({ imported: ok, failed: fail, results }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "导入失败" }, { status: 500 });
  }
}
