import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify } from "@/lib/utils";

// GET /api/articles/[id] — get single article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(request);

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
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
    },
  });

  if (!post) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  if (!post.published && !user) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  return NextResponse.json({
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    tags: post.tags.map((t) => t.tag),
  });
}

// PUT /api/articles/[id] — update article (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, published, categoryId, tagIds } =
      body;

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    // Check slug uniqueness (excluding this post)
    if (slug) {
      const slugConflict = await prisma.post.findFirst({
        where: { slug, id: { not: id } },
      });
      if (slugConflict) {
        return NextResponse.json(
          { error: "slug 已存在" },
          { status: 400 }
        );
      }
    }

    // Handle publish transition
    let publishedAt = existing.publishedAt;
    if (published && !existing.published) {
      publishedAt = new Date();
    } else if (!published) {
      publishedAt = null;
    }

    // Update tags: delete all, then create
    await prisma.tagOnPost.deleteMany({ where: { postId: id } });

    const finalSlug = slug?.trim() || slugify(title || existing.title);
    // Check slug uniqueness (against other posts)
    const slugConflict = await prisma.post.findFirst({
      where: { slug: finalSlug, id: { not: id } },
    });
    if (slugConflict) {
      return NextResponse.json({ error: "slug 已存在" }, { status: 400 });
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        title: title?.trim(),
        slug: finalSlug,
        excerpt: excerpt?.trim() ?? null,
        content: content?.trim(),
        coverImage: coverImage !== undefined ? (coverImage?.trim() ?? null) : undefined,
        published,
        publishedAt,
        categoryId: categoryId === null ? null : categoryId || existing.categoryId,
        tags: tagIds?.length
          ? {
              create: tagIds.map((tagId: string) => ({ tagId })),
            }
          : undefined,
      },
      include: {
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json({
      ...post,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      tags: post.tags.map((t) => t.tag),
    });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE /api/articles/[id] — delete article (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
