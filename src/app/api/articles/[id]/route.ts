import { NextRequest, NextResponse } from "next/server";
import { prisma, cleanOrphanTags } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { slugify, renderMarkdown, extractHashTags, autoExcerpt } from "@/lib/utils";

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

    const finalSlug = slug?.trim() || slugify(title || existing.title);
    // Check slug uniqueness (against other posts)
    const slugConflict = await prisma.post.findFirst({
      where: { slug: finalSlug, id: { not: id } },
    });
    if (slugConflict) {
      return NextResponse.json({ error: "slug 已存在" }, { status: 400 });
    }

    // Only update fields that were explicitly sent
    const data: any = {};
    if (title !== undefined) data.title = title?.trim();
    data.slug = finalSlug;
    if (excerpt !== undefined || content !== undefined) {
      data.excerpt = excerpt?.trim() || (content ? autoExcerpt(content) : existing.excerpt);
    }
    if (content !== undefined) {
      data.content = content?.trim();
      data.contentHtml = renderMarkdown(content!.trim());
    }
    if (coverImage !== undefined) data.coverImage = coverImage?.trim() || null;
    if (published !== undefined) {
      data.published = published;
      data.publishedAt = publishedAt;
    }

    // Only update tags if content or tagIds were sent
    if (content !== undefined || tagIds !== undefined) {
      await prisma.tagOnPost.deleteMany({ where: { postId: id } });
      const autoTags = content ? extractHashTags(content) : [];
      const userTagIds = tagIds || [];
      const autoTagIds = await Promise.all(autoTags.map(async (name) => {
        const s = slugify(name);
        const tag = await prisma.tag.upsert({ where: { slug: s }, update: {}, create: { name, slug: s } });
        return tag.id;
      }));
      const allTagIds = [...new Set([...userTagIds, ...autoTagIds])];
      if (allTagIds.length > 0) {
        data.tags = { create: allTagIds.map((tagId: string) => ({ tagId })) };
      }
      cleanOrphanTags(); // fire-and-forget
    }
    if (categoryId !== undefined) data.categoryId = categoryId || null;

    const post = await prisma.post.update({
      where: { id },
      data,
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
  } catch (e: any) {
    console.error("PUT error:", e?.message || e);
    return NextResponse.json({ error: "更新失败: " + (e?.message || "unknown") }, { status: 500 });
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

  try {
    const { id } = await params;
    // Check article exists
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("DELETE error:", e?.message || e);
    return NextResponse.json({ error: "删除失败: " + (e?.message || "unknown") }, { status: 500 });
  }
}
