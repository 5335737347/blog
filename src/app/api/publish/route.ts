import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify, extractHashTags, autoExcerpt } from "@/lib/utils";
import { parseMarkdownDocument, parseOptionalDate } from "@/lib/content";

// POST /api/publish — publish article via API key
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const apiKey = auth.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return NextResponse.json({ error: "缺少 API Key" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({ where: { apiKey } });
  if (!user) {
    return NextResponse.json({ error: "无效的 API Key" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content, slug, tags, excerpt, coverImage, category, published, date } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
    }

    const parsed = parseMarkdownDocument(content, title || "untitled.md");
    const finalTitle = title?.trim() || parsed.title;
    const finalSlug = slug?.trim() ? slugify(slug) : parsed.slug;
    const finalContent = parsed.content.trim();

    if (!finalTitle || !finalContent) {
      return NextResponse.json({ error: "标题和内容不能为空" }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.post.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      return NextResponse.json({ error: `slug "${finalSlug}" 已存在` }, { status: 409 });
    }

    // Resolve tags: user-provided + auto-extracted from content
    const userTags: string[] = Array.isArray(tags) ? tags : [];
    const autoTags = extractHashTags(finalContent);
    const allTagNames = [...new Set([...userTags, ...parsed.frontmatter.tags, ...autoTags])];
    const tagConnects = [];
    for (const name of allTagNames) {
      const tagSlug = slugify(name);
      const tag = await prisma.tag.upsert({
        where: { slug: tagSlug },
        update: {},
        create: { name, slug: tagSlug },
      });
      tagConnects.push({ tagId: tag.id });
    }

    const categoryName = category?.trim() || parsed.frontmatter.category;
    const resolvedCategory = categoryName
      ? await prisma.category.upsert({
          where: { slug: slugify(categoryName) },
          update: {},
          create: { name: categoryName, slug: slugify(categoryName) },
        })
      : null;
    const shouldPublish = published ?? parsed.frontmatter.published ?? true;
    const publishedAt = shouldPublish
      ? parseOptionalDate(date || parsed.frontmatter.date) || new Date()
      : null;

    const post = await prisma.post.create({
      data: {
        title: finalTitle,
        slug: finalSlug,
        excerpt: excerpt?.trim() || parsed.frontmatter.excerpt || autoExcerpt(finalContent) || null,
        content: finalContent,
        coverImage: coverImage?.trim() || parsed.frontmatter.coverImage || null,
        published: shouldPublish,
        publishedAt,
        categoryId: resolvedCategory?.id,
        tags: tagConnects.length > 0 ? { create: tagConnects } : undefined,
      },
    });

    return NextResponse.json(
      {
        success: true,
        post: {
          id: post.id,
          slug: post.slug,
          title: post.title,
          published: post.published,
          url: `${process.env.SITE_URL || "http://localhost:3000"}/articles/${post.slug}`,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "发布失败" }, { status: 500 });
  }
}
