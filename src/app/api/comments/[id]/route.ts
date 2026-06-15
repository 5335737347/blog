import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// PUT /api/comments/[id] — approve/reject comment (admin)
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
    const { approved } = body;

    const comment = await prisma.comment.update({
      where: { id },
      data: { approved },
    });

    return NextResponse.json({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

// DELETE /api/comments/[id] — delete comment (admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
