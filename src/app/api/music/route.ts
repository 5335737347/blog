import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateUniqueFilename } from "@/lib/utils";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// GET /api/music — list all music
export async function GET() {
  const tracks = await prisma.music.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(
    tracks.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))
  );
}

// POST /api/music — upload file or add external URL
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // File upload
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const title = (formData.get("title") as string) || file?.name || "Unknown";
      const artist = (formData.get("artist") as string) || null;

      if (!file) {
        return NextResponse.json({ error: "请选择文件" }, { status: 400 });
      }

      const allowedTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/webm"];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm)$/i)) {
        return NextResponse.json(
          { error: "不支持的文件类型，仅支持 MP3/WAV/OGG" },
          { status: 400 }
        );
      }

      const maxSize = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSize) {
        return NextResponse.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
      }

      const ext = file.name.split(".").pop() || "mp3";
      const filename = generateUniqueFilename(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadDir = path.join(process.cwd(), "public", "music");

      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), buffer);

      const track = await prisma.music.create({
        data: { title, artist, url: `/music/${filename}` },
      });

      return NextResponse.json(
        { ...track, createdAt: track.createdAt.toISOString() },
        { status: 201 }
      );
    } else {
      // External URL
      const body = await request.json();
      const { title, artist, url } = body;

      if (!title?.trim() || !url?.trim()) {
        return NextResponse.json(
          { error: "标题和 URL 不能为空" },
          { status: 400 }
        );
      }

      const track = await prisma.music.create({
        data: { title: title.trim(), artist: artist?.trim() || null, url: url.trim() },
      });

      return NextResponse.json(
        { ...track, createdAt: track.createdAt.toISOString() },
        { status: 201 }
      );
    }
  } catch {
    return NextResponse.json({ error: "添加失败" }, { status: 500 });
  }
}
