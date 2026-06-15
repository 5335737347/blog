import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/comments?postId=xxx — get approved comments for a post
export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get("postId");
  if (!postId) {
    return NextResponse.json({ error: "缺少 postId" }, { status: 400 });
  }

  const comments = await prisma.comment.findMany({
    where: {
      postId,
      approved: true,
      parentId: null, // top-level only
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      author: true,
      email: true,
      content: true,
      createdAt: true,
      replies: {
        where: { approved: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          author: true,
          email: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json(
    comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      replies: c.replies.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    }))
  );
}

// POST /api/comments — submit a new comment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId, parentId, author, email, content } = body;

    if (!postId || !author?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "缺少必要字段" },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return NextResponse.json(
        { error: "评论内容过长（最多2000字）" },
        { status: 400 }
      );
    }

    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: postId, published: true },
    });
    if (!post) {
      return NextResponse.json(
        { error: "文章不存在" },
        { status: 404 }
      );
    }

    // If replying, verify parent comment exists and belongs to same post
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId, postId },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "父评论不存在" },
          { status: 400 }
        );
      }
      // Only allow one level of nesting
      if (parent.parentId) {
        return NextResponse.json(
          { error: "不支持多级嵌套回复" },
          { status: 400 }
        );
      }
    }

    await prisma.comment.create({
      data: {
        postId,
        parentId: parentId || null,
        author: author.trim(),
        email: email?.trim() || null,
        content: content.trim(),
        approved: false,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "提交失败" },
      { status: 500 }
    );
  }
}
