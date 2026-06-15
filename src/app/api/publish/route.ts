import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify, renderMarkdown, extractHashTags } from "@/lib/utils";

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
    const { title, content, slug, tags, excerpt, coverImage } = body;

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "标题和内容不能为空" }, { status: 400 });
    }

    const finalSlug = slug?.trim() || slugify(title);

    // Check uniqueness
    const existing = await prisma.post.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      return NextResponse.json({ error: `slug "${finalSlug}" 已存在` }, { status: 409 });
    }

    // Resolve tags: user-provided + auto-extracted from content
    const userTags: string[] = tags || [];
    const autoTags = extractHashTags(content);
    const allTagNames = [...new Set([...userTags, ...autoTags])];
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

    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        slug: finalSlug,
        excerpt: excerpt?.trim() || null,
        content: content.trim(),
        contentHtml: renderMarkdown(content.trim()),
        coverImage: coverImage?.trim() || null,
        published: true,
        publishedAt: new Date(),
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
          url: `${process.env.SITE_URL || "http://localhost:3000"}/articles/${post.slug}`,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: "发布失败" }, { status: 500 });
  }
}
