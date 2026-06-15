import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";

// DELETE /api/music/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const track = await prisma.music.findUnique({ where: { id } });
  if (!track) {
    return NextResponse.json({ error: "不存在" }, { status: 404 });
  }

  // Delete local file if it's not an external URL
  if (track.url.startsWith("/music/")) {
    try {
      const filePath = path.join(process.cwd(), "public", track.url);
      await unlink(filePath);
    } catch {
      // File may already be gone — ignore
    }
  }

  await prisma.music.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
