import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { readdir, unlink, stat } from "fs/promises";
import path from "path";

// GET /api/images — list all uploaded images
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const dir = path.join(process.cwd(), "public", "images");
    const files = await readdir(dir).catch(() => [] as string[]);

    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    const images = await Promise.all(
      imageFiles.map(async (f) => {
        const filePath = path.join(dir, f);
        const s = await stat(filePath);
        return { name: f, url: `/images/${f}`, size: s.size, modified: s.mtime.toISOString() };
      })
    );
    images.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json(images);
  } catch {
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

// DELETE /api/images?file=filename
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const file = request.nextUrl.searchParams.get("file");
  if (!file || file.includes("..") || file.includes("/")) {
    return NextResponse.json({ error: "无效文件名" }, { status: 400 });
  }

  try {
    const filePath = path.join(process.cwd(), "public", "images", file);
    await unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
