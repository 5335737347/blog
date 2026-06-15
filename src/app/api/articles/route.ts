import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify, renderMarkdown, extractHashTags, autoExcerpt } from "@/lib/utils";

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

// GET /api/articles — list published articles (public)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, parseInt(searchParams.get("limit") || "10"));
  const tag = searchParams.get("tag");
  const category = searchParams.get("category");
  const published = searchParams.get("published");

  const where: Record<string, unknown> = {};

  // Admin can see all; public only published
  const user = await getAuthUser(request);
  if (!user) {
    where.published = true;
  } else if (published === "all") {
    // admin wants all
  } else if (published === "draft") {
    where.published = false;
  } else {
    where.published = true;
  }

  if (tag) {
    where.tags = { some: { tag: { slug: tag } } };
  }
  if (category) {
    where.category = { slug: category };
  }

  const [articles, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
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
      },
    }),
    prisma.post.count({ where }),
  ]);

  return NextResponse.json({
    items: articles.map((a) => ({
      ...a,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      tags: a.tags.map((t) => t.tag),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

// POST /api/articles — create article (admin only)
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, published, categoryId, tagIds } =
      body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "标题和内容不能为空" },
        { status: 400 }
      );
    }

    const finalSlug = slug?.trim() || slugify(title);

    // Check slug uniqueness
    const existing = await prisma.post.findUnique({
      where: { slug: finalSlug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "slug 已存在，请修改" },
        { status: 400 }
      );
    }

    // Auto-extract tags from content #tags
    const autoTags = extractHashTags(content);
    const allTagIds = [...new Set([...(tagIds || []), ...(await resolveTags(autoTags))])];

    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        slug: finalSlug,
        excerpt: excerpt?.trim() || autoExcerpt(content) || null,
        content: content.trim(),
        contentHtml: renderMarkdown(content.trim()),
        coverImage: coverImage?.trim() || null,
        published: published ?? false,
        publishedAt: published ? new Date() : null,
        categoryId: categoryId || null,
        tags: allTagIds.length
          ? { create: allTagIds.map((tagId: string) => ({ tagId })) }
          : undefined,
      },
      include: {
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(
      {
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        tags: post.tags.map((t) => t.tag),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
