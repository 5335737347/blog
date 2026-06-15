import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET /api/settings — get all settings (public, for site config)
export async function GET() {
  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json(map);
}

// PUT /api/settings — update settings (admin only)
export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: { key: string; value: string }[] = [];

    if (body.blog_title !== undefined) {
      updates.push({ key: "blog_title", value: String(body.blog_title) });
    }
    if (body.blog_description !== undefined) {
      updates.push({ key: "blog_description", value: String(body.blog_description) });
    }

    for (const { key, value } of updates) {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
